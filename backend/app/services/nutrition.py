"""Indian food database (data/nutrition_in.csv), our own text meal parser, and rule-based diet tips."""
from __future__ import annotations

import csv
import re
from datetime import UTC, date, datetime, timedelta
from difflib import get_close_matches
from functools import lru_cache

from .. import config

NUM = ("kcal", "carbs_g", "protein_g", "fat_g", "fiber_g", "sodium_mg")
_WORD_NUM = {"half": 0.5, "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "1/2": 0.5, "½": 0.5}
_UNITS = r"(?:plates?|bowls?|katoris?|cups?|glass(?:es)?|pieces?|pcs?|nos?|servings?|small|medium|large|big)"


@lru_cache
def foods() -> dict[str, dict]:
    out = {}
    with open(config.DATA_DIR / "nutrition_in.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            for k in (*NUM, "serving_g"):
                row[k] = float(row[k])
            row["veg"] = row["veg"].strip().lower() == "true"
            row["tags"] = [t for t in row["tags"].split(";") if t]
            out[row["key"]] = row
    return out


@lru_cache
def _index() -> dict[str, str]:
    idx = {}
    for k, f in foods().items():
        for name in {k.replace("_", " "), f["name"].lower(), f["name_ta"], f["name_hi"]}:
            idx[name.strip().lower()] = k
        base = re.sub(r"\(.*?\)", "", f["name"].lower()).strip()
        idx.setdefault(base, k)
        for part in base.split(" / "):
            idx.setdefault(part.strip(), k)
    idx.update({"chapati": idx.get("roti", idx.get("chapati", "")), "chappathi": idx.get("chapati", idx.get("roti", "")),
                "rice": idx.get("white rice", idx.get("rice", "")), "curd": idx.get("curd", idx.get("plain curd", "")),
                "chai": idx.get("tea with milk and sugar", idx.get("tea", ""))})
    return {k: v for k, v in idx.items() if v}


def search(q: str, limit: int = 12) -> list[dict]:
    q = (q or "").strip().lower()
    items = list(foods().values())
    if not q:
        return items[:limit]
    hits = [f for f in items if q in f["name"].lower() or q in f["key"] or q in f["name_ta"] or q in f["name_hi"].lower()]
    if len(hits) < limit:
        for name in get_close_matches(q, list(_index()), n=limit, cutoff=0.6):
            f = foods()[_index()[name]]
            if f not in hits:
                hits.append(f)
    return hits[:limit]


def match(name: str) -> tuple[str | None, float]:
    n = re.sub(r"\s+", " ", name.strip().lower())
    idx = _index()
    if n in idx:
        return idx[n], 1.0
    if n.endswith("s") and n[:-1] in idx:
        return idx[n[:-1]], 0.95
    close = get_close_matches(n, list(idx), n=1, cutoff=0.72)
    if close:
        return idx[close[0]], 0.8
    for key in idx:  # "masala dosa with chutney" -> masala dosa
        if len(key) >= 4 and re.search(rf"\b{re.escape(key)}\b", n):
            return idx[key], 0.7
    return None, 0.0


def parse_text(text: str) -> dict:
    """'2 idli, sambar and 1 cup tea' -> matched items with servings (our own parser, no AI)."""
    parts = re.split(r",|\band\b|\+|&|\n|;|\bwith\b", (text or "").lower())
    items, unknown = [], []
    for raw in parts:
        s = raw.strip(" .")
        if not s:
            continue
        qty = 1.0
        m = re.match(r"^(\d+(?:\.\d+)?|half|a|an|one|two|three|four|five|six|1/2|½)\s*(?:x\s*)?", s)
        if m:
            tok = m.group(1)
            qty = float(tok) if re.match(r"\d", tok) else _WORD_NUM.get(tok, 1)
            s = s[m.end():]
        s = re.sub(rf"^{_UNITS}\s*(?:of\s*)?", "", s).strip()
        if not s:
            continue
        key, conf = match(s)
        if key:
            f = foods()[key]
            # "2 idli" when the serving is already "2 medium idli" -> 1 serving
            per = re.match(r"^(\d+)\s", f["serving"])
            servings = qty / float(per.group(1)) if per and m and re.match(r"\d", m.group(1)) and float(per.group(1)) > 1 else qty
            items.append(item(key, round(servings, 2), conf, raw.strip()))
        else:
            unknown.append(raw.strip())
    return {"items": items, "unknown": unknown, "totals": totals(items)}


def item(key: str, servings: float, confidence: float = 1.0, said: str | None = None) -> dict:
    f = foods()[key]
    return {"key": key, "name": f["name"], "name_ta": f["name_ta"], "serving": f["serving"], "servings": servings, "gi_band": f["gi_band"],
            "confidence": confidence, "said": said, **{k: round(f[k] * servings, 1) for k in NUM}}


def totals(items: list[dict]) -> dict:
    return {k: round(sum(i.get(k, 0) for i in items), 1) for k in NUM}


# ---------------------------------------------------------------- diet suggestions (rules, never prescriptions)
def suggestions(profile, latest: dict[str, dict], wellness_cards: list[dict], meals) -> dict:
    """latest: test code -> {"value", "flag"} (flag_computed). Returns tips with the reason (citing the person's own value)."""
    week = datetime.now(UTC) - timedelta(days=7)
    recent = [m for m in meals if (m.eaten_at if m.eaten_at.tzinfo else m.eaten_at.replace(tzinfo=UTC)) >= week]
    eaten = [i for m in recent for i in (m.items or [])]
    db = foods()
    tips = []

    def tip(tid, title, why, do, swaps=None, source=None):
        tips.append({"id": tid, "title": title, "why": why, "try": do, "swaps": swaps or [], "source": source})

    conds = set(profile.conditions or [])
    a1c, fbg = latest.get("HBA1C"), latest.get("FBG")
    if "diabetes" in conds or (a1c and a1c["value"] >= 5.7) or (fbg and fbg["flag"] in ("high", "critical_high")):
        high_gi = sorted({i["name"] for i in eaten if i.get("gi_band") == "high"})
        low_gi = [f["name"] for f in db.values() if f["gi_band"] == "low" and ("breakfast" in f["tags"] or "millet" in f["tags"])][:5]
        why = f"HbA1c {a1c['value']:g}%" if a1c else ("fasting sugar " + f"{fbg['value']:g} mg/dL" if fbg else "diabetes in your profile")
        tip("low_gi", "Choose slower-sugar (low-GI) foods", f"Because of your {why}.",
            ["Fill half the plate with vegetables, a quarter with dal/egg/paneer, a quarter with rice or roti.",
             "Prefer whole grains and millets (ragi, jowar, bajra) over refined rice or maida.", "Avoid sugary tea, juices and sweets between meals."],
            [{"instead_of": n, "try": low_gi[:3]} for n in high_gi[:3]], "ICMR-NIN Dietary Guidelines for Indians 2024; ADA Standards of Care 2025")
    ldl, tg, tc = latest.get("LDL"), latest.get("TG"), latest.get("TC")
    if any(x and x["flag"] in ("high", "critical_high") for x in (ldl, tg, tc)):
        fried = sorted({i["name"] for i in eaten if "fried" in db.get(i["key"], {}).get("tags", [])})
        fibre = [f["name"] for f in db.values() if "high_fiber" in f["tags"]][:4]
        vals = ", ".join(f"{n} {x['value']:g} mg/dL" for n, x in (("LDL", ldl), ("triglycerides", tg), ("total cholesterol", tc)) if x and x["flag"] != "normal")
        tip("heart_fats", "Fewer fried foods, more fibre", f"Because {vals} is above the usual range.",
            ["Keep deep-fried snacks (vada, samosa, bajji) to once a week or less.", "Use less oil; avoid reheating used frying oil.",
             "Add fibre: dal, sprouts, vegetables, fruit with skin."], [{"instead_of": n, "try": fibre[:3]} for n in fried[:3]],
            "ICMR-NIN Dietary Guidelines for Indians 2024")
    bp = next((w for w in wellness_cards if w["kind"] == "bp" and w.get("avg30")), None)
    if "hypertension" in conds or (bp and bp["status"] != "green"):
        salty = sorted({i["name"] for i in eaten if db.get(i["key"], {}).get("sodium_mg", 0) >= 500})
        why = f"your home BP average is {bp['avg30']:.0f}/{(bp.get('avg30_2') or 0):.0f}" if bp else "high BP in your profile"
        tip("salt", "Go easy on salt", f"Because {why}.",
            ["Aim for under 5 g of salt a day (about one level teaspoon) in total.", "Pickles, papad, chips, ready mixes and restaurant food hide a lot of salt.",
             "Use lemon, herbs and spices for flavour."], [{"instead_of": n, "try": ["a home-cooked, low-salt version"]} for n in salty[:3]],
            "WHO sodium guideline 2012/2023; ICMR-NIN 2024")
    hb, ferr = latest.get("HB"), latest.get("FERRITIN")
    if (hb and hb["flag"] in ("low", "critical_low")) or (ferr and ferr["flag"] in ("low", "critical_low")):
        tip("iron", "Iron-rich foods", f"Because your {'haemoglobin is ' + format(hb['value'], 'g') if hb and hb['flag'] != 'normal' else 'ferritin is low'}.",
            ["Eat green leafy vegetables, dals, chana, rajma, eggs or meat if you eat them.", "Have a vitamin C food (lemon, guava, amla, orange) with iron-rich meals.",
             "Keep tea and coffee at least 1 hour away from meals."], [], "ICMR-NIN Dietary Guidelines for Indians 2024")
    creat = latest.get("CREAT")
    if "ckd" in conds or (creat and creat["flag"] in ("high", "critical_high")):
        tip("kidney", "Ask about a kidney-friendly diet", "Because of your kidney results.",
            ["Ask your doctor whether you need limits on salt, protein, potassium or fluids. These limits are personal, so please don't guess."], [],
            "KDIGO 2024 CKD guideline")
    uric = latest.get("URIC")
    if uric and uric["flag"] in ("high", "critical_high"):
        tip("uric", "Fewer sugary drinks and less alcohol", f"Because uric acid is {uric['value']:g} mg/dL.",
            ["Sugary drinks and alcohol can raise uric acid.", "Drink enough water unless your doctor set a fluid limit."], [], "ACR 2020 gout guideline")
    bmi = round(profile.weight_kg / (profile.height_cm / 100) ** 2, 1) if profile.height_cm and profile.weight_kg else None
    if bmi and bmi >= 23:
        tip("portion", "Smaller portions, more movement", f"Because your BMI is {bmi} (Asian cut-off for overweight is 23).",
            ["Use a smaller plate; eat slowly.", "Walk 30 minutes on most days if your doctor agrees."], [], "WHO Asia-Pacific BMI cut-offs; ICMR-NIN 2024")
    if not tips:
        tip("balanced", "Keep a balanced Indian plate", "Your recent values don't point to a specific change.",
            ["Half vegetables and fruit, a quarter whole grains, a quarter protein (dal, egg, paneer, fish).", "Limit sugar, salt and fried snacks."], [],
            "ICMR-NIN My Plate for the Day (2024)")
    days = max(1, len({(m.eaten_at.date() if isinstance(m.eaten_at, datetime) else date.today()) for m in recent}))
    return {"tips": tips, "week": {"meals": len(recent), "days_logged": len(recent) and days,
                                   "avg_per_day": {k: round(sum(i.get(k, 0) for i in eaten) / days, 1) for k in NUM} if recent else None},
            "disclaimer": "General healthy-eating information based on your own values. It is not a diet prescription. "
                          "Your doctor or a dietitian can set personal targets."}
