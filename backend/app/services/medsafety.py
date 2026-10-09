"""Medicine safety from a deterministic knowledge base (data/med_safety.json), never from an AI:
food notes, interactions, duplicate salts, two-of-the-same-type, and lab-value cautions."""
from __future__ import annotations

import json
from functools import lru_cache

from .. import config
from . import catalog, extraction


@lru_cache
def kb() -> dict:
    return json.loads((config.DATA_DIR / "med_safety.json").read_text(encoding="utf-8"))


def _side(spec: dict) -> tuple[set[str], set[str]]:
    return set(spec.get("generics", [])), set(spec.get("classes", []))


def _sides(rule: dict) -> tuple[tuple[set, set], tuple[set, set]]:
    if "left" in rule:
        return _side(rule["left"]), _side(rule["right"])
    g, c = rule.get("generics", []), rule.get("classes", [])
    if len(g) == 2:
        return ({g[0]}, set()), ({g[1]}, set())
    if len(c) == 2:
        return (set(), {c[0]}), (set(), {c[1]})
    if len(g) == 1 and len(c) == 1:
        return ({g[0]}, set()), (set(), {c[0]})
    return (set(g), set(c)), (set(g), set(c))


def _matches(med: dict, side: tuple[set, set]) -> bool:
    gens, classes = side
    return bool(gens & med["generics"]) or bool(classes & med["classes"])


def describe(meds) -> list[dict]:
    gens = catalog.medicines()["generics"]
    out = []
    for m in meds:
        gids, _, _ = extraction.match_medicine(m.brand, m.generic)
        out.append({"id": m.id, "brand": m.brand, "generics": set(gids),
                    "classes": {gens[g]["class"] for g in gids if g in gens and gens[g].get("class")},
                    "names": [gens[g]["name"] for g in gids if g in gens]})
    return out


def check(active_meds, latest_flags: dict[str, str] | None = None) -> dict:
    data = kb()
    meds = describe(active_meds)
    latest_flags = latest_flags or {}
    food = []
    for m in meds:
        for g in sorted(m["generics"]):
            for note in data["food_notes"].get(g, []):
                food.append({"medicine": m["brand"], "medicine_id": m["id"], "generic": g, **note})

    interactions = []
    for rule in data["interactions"]:
        left, right = _sides(rule)
        for i, a in enumerate(meds):
            for b in meds[i + 1:]:
                if (_matches(a, left) and _matches(b, right)) or (_matches(a, right) and _matches(b, left)):
                    interactions.append({"id": rule["id"], "level": rule["level"], "medicines": [a["brand"], b["brand"]],
                                         "medicine_ids": [a["id"], b["id"]], "text": rule["text"], "source": rule.get("source")})
                    break
            else:
                continue
            break

    duplicates, same_class = [], []
    sc_classes = set(data.get("same_class_note", {}).get("classes", []))
    for i, a in enumerate(meds):
        for b in meds[i + 1:]:
            shared = a["generics"] & b["generics"]
            if shared:
                g = sorted(shared)[0]
                name = catalog.medicines()["generics"].get(g, {}).get("name", g)
                duplicates.append({"medicines": [a["brand"], b["brand"]], "medicine_ids": [a["id"], b["id"]], "generic": name,
                                   "text": data["duplicate_note"].format(brand_a=a["brand"], brand_b=b["brand"], generic=name)})
                continue
            cls = (a["classes"] & b["classes"]) & sc_classes
            if cls:
                c = sorted(cls)[0]
                same_class.append({"medicines": [a["brand"], b["brand"]], "medicine_ids": [a["id"], b["id"]], "class": c,
                                   "text": data["same_class_note"]["text"].replace("{class}", c.replace("_", " "))})

    lab = []
    for rule in data["lab_cautions"]:
        f = latest_flags.get(rule["test"])
        if not f or rule["condition"] not in f:  # "low" matches low / critical_low
            continue
        side = (set(rule.get("generics", [])), set(rule.get("classes", [])))
        hit = [m["brand"] for m in meds if _matches(m, side)]
        if hit:
            lab.append({"id": rule["id"], "test": rule["test"], "flag": f, "medicines": hit, "level": rule.get("level", "caution"),
                        "text": rule["text"], "source": rule.get("source")})

    order = {"major": 0, "moderate": 1}
    interactions.sort(key=lambda x: order.get(x["level"], 2))
    return {"food_notes": food, "interactions": interactions, "duplicates": duplicates, "same_class": same_class, "lab_cautions": lab,
            "checked": [{"brand": m["brand"], "generics": m["names"]} for m in meds],
            "source": "DOC medicine-safety knowledge base (rules, not AI)", "disclaimer": data["disclaimer"]}
