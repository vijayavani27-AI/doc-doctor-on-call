"""DOC insight engine.

Works on plain dataclasses (not ORM objects) so it is easy to test. `analyze()` returns
everything the dashboard, Hidden Risks page, alerts, doctor summary and chat need:

* hidden_risks    - Hidden Disease Finder: validated formulas computed by joining values
                    from different reports / labs / dates, with full provenance
* drifts          - Personal-baseline model: values that are still "normal" but moving
                    steadily the wrong way (linear trend + projection to the limit)
* alerts          - critical values, care gaps, repeat tests, medicine-kidney safety,
                    prescribing cascades, side-effect timing, iron-without-improvement
* next_tests      - "Next Best Test": the cheapest panels that unlock the most insight
* score / questions for the doctor
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, timedelta

from . import catalog, formulas, wellness


# ---------------------------------------------------------------- data classes
@dataclass
class Obs:
    code: str
    value: float
    date: date
    result_id: int | None = None
    report_id: int | None = None
    lab_name: str | None = None
    source_text: str | None = None
    ref_low: float | None = None
    ref_high: float | None = None


@dataclass
class Med:
    id: int | None
    brand: str
    generics: list[str]
    start: date | None
    end: date | None = None
    active: bool = True

    def classes(self) -> set[str]:
        g = catalog.medicines()["generics"]
        return {g[x]["class"] for x in self.generics if x in g}


@dataclass
class SymptomEvt:
    key: str
    onset: date
    label: str = ""


@dataclass
class Patient:
    sex: str
    dob: date | None
    conditions: list[str] = field(default_factory=list)
    obs: list[Obs] = field(default_factory=list)
    meds: list[Med] = field(default_factory=list)
    symptoms: list[SymptomEvt] = field(default_factory=list)
    today: date = field(default_factory=date.today)
    vitals: list = field(default_factory=list)  # wellness.Vital
    height_cm: float | None = None

    def series(self, code: str) -> list[Obs]:
        return sorted((o for o in self.obs if o.code == code), key=lambda o: o.date)

    def latest(self, code: str) -> Obs | None:
        s = self.series(code)
        return s[-1] if s else None

    def age_at(self, d: date) -> float | None:
        if not self.dob:
            return None
        return (d - self.dob).days / 365.25

    def has(self, condition: str) -> bool:
        return condition in [c.lower() for c in self.conditions]


# ---------------------------------------------------------------- helpers
def _ref(o: Obs, sex: str) -> tuple[float | None, float | None]:
    if o.ref_low is not None or o.ref_high is not None:
        return o.ref_low, o.ref_high
    return catalog.ref_range(o.code, sex)


def flag(o: Obs, sex: str) -> str:
    lo, hi = _ref(o, sex)
    if lo is not None and o.value < lo:
        return "L"
    if hi is not None and o.value > hi:
        return "H"
    return "N"


def _input_view(o: Obs, sex: str) -> dict:
    t = catalog.tests()[o.code]
    lo, hi = _ref(o, sex)
    return {
        "code": o.code, "name": t["name"], "value": round(o.value, 2), "unit": t["unit"],
        "date": o.date.isoformat(), "lab": o.lab_name, "result_id": o.result_id, "report_id": o.report_id,
        "source_text": o.source_text, "ref_low": lo, "ref_high": hi, "flag": flag(o, sex),
    }


def human_days(days: int) -> str:
    if days < 60:
        return f"{days} days"
    if days < 730:
        return f"{round(days / 30.44)} months"
    return f"{days / 365.25:.1f} years"


def linear_trend(points: list[tuple[date, float]]) -> tuple[float, float] | None:
    """Least-squares slope (units per year) and r^2."""
    if len(points) < 2:
        return None
    xs = [(d - points[0][0]).days / 365.25 for d, _ in points]
    ys = [v for _, v in points]
    if xs[-1] - xs[0] <= 0:
        return None
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True))
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0:
        return None
    slope = sxy / sxx
    r2 = (sxy * sxy) / (sxx * syy) if syy else 1.0
    return slope, r2


def _nearest(series: list[Obs], d: date, window: int, prefer_report: int | None) -> Obs | None:
    best, best_key = None, None
    for o in series:
        gap = abs((o.date - d).days)
        if gap > window:
            continue
        key = (0 if prefer_report is not None and o.report_id == prefer_report else 1, gap)
        if best_key is None or key < best_key:
            best, best_key = o, key
    return best


# ---------------------------------------------------------------- hidden disease finder
_PRIMARY = {"fib4": "AST", "apri": "AST", "mentzer": "MCV", "tyg": "TG", "tg_hdl": "TG",
            "egfr": "CREAT", "non_hdl": "TC", "corr_ca": "CA"}


def _compute(fid: str, v: dict[str, float], age: float | None, sex: str) -> float | None:
    if fid == "fib4":
        return None if age is None else formulas.fib4(age, v["AST"], v["ALT"], v["PLT"])
    if fid == "apri":
        return formulas.apri(v["AST"], v["PLT"])
    if fid == "mentzer":
        return formulas.mentzer(v["MCV"], v["RBC"])
    if fid == "tyg":
        return formulas.tyg(v["TG"], v["FBG"])
    if fid == "tg_hdl":
        return formulas.tg_hdl(v["TG"], v["HDL"])
    if fid == "egfr":
        return None if age is None else formulas.egfr_ckd_epi_2021(v["CREAT"], age, sex)
    if fid == "non_hdl":
        return formulas.non_hdl(v["TC"], v["HDL"])
    if fid == "corr_ca":
        return formulas.corrected_calcium(v["CA"], v["ALB"])
    return None


def formula_points(fid: str, p: Patient) -> list[dict]:
    meta = catalog.formulas()[fid]
    lab_inputs = [c for c in meta["inputs"] if c not in ("AGE", "SEX")]
    primary = _PRIMARY[fid]
    others = [c for c in lab_inputs if c != primary]
    window = meta.get("window_days", 0)
    series = {c: p.series(c) for c in lab_inputs}
    points, seen = [], set()
    for anchor in series[primary]:
        if fid == "mentzer" and anchor.value >= 80:
            continue  # Mentzer only applies to small red cells
        chosen = {primary: anchor}
        for c in others:
            o = _nearest(series[c], anchor.date, window, anchor.report_id)
            if o is None:
                break
            chosen[c] = o
        else:
            key = tuple(sorted((c, o.result_id or id(o)) for c, o in chosen.items()))
            if key in seen:
                continue
            seen.add(key)
            when = max(o.date for o in chosen.values())
            age = p.age_at(when)
            value = _compute(fid, {c: o.value for c, o in chosen.items()}, age, p.sex)
            if value is None or math.isnan(value):
                continue
            band = formulas.classify(fid, value, age)
            reports = {o.report_id for o in chosen.values() if o.report_id is not None}
            labs = {o.lab_name for o in chosen.values() if o.lab_name}
            inputs = [_input_view(chosen[c], p.sex) for c in lab_inputs]
            if age is not None and "AGE" in meta["inputs"]:
                inputs.insert(0, {"code": "AGE", "name": "Age", "value": round(age, 1), "unit": "years", "date": when.isoformat(), "flag": "N"})
            points.append({
                "date": when.isoformat(), "value": round(value, 2), "status": band["status"], "label": band["label"], "text": band["text"],
                "inputs": inputs, "reports_combined": len(reports), "labs_combined": sorted(labs),
                "all_inputs_normal": all(i.get("flag") == "N" for i in inputs if i["code"] not in ("AGE",)),
                "max_gap_days": max((abs((o.date - anchor.date).days) for o in chosen.values()), default=0),
            })
    points.sort(key=lambda x: x["date"])
    return points


def hidden_risks(p: Patient) -> list[dict]:
    out = []
    for fid, meta in catalog.formulas().items():
        if fid == "tyg" and p.has("diabetes"):
            continue  # TyG is for spotting insulin resistance before diabetes
        pts = formula_points(fid, p)
        if not pts:
            continue
        cur = dict(pts[-1])
        trend = None
        if len(pts) >= 2:
            lt = linear_trend([(date.fromisoformat(x["date"]), x["value"]) for x in pts])
            if lt:
                trend = {"per_year": round(lt[0], 2), "r2": round(lt[1], 2),
                         "first": pts[0]["value"], "first_date": pts[0]["date"]}
        risk = {
            "id": fid, "name": meta["name"], "hidden_condition": meta["hidden_condition"], "organ": meta["organ"],
            "equation": meta["equation"], "citation": meta["citation"], "next_step": meta["next_step"],
            "why_hidden": meta["why_hidden"], "simple": meta["simple"], "notes": meta.get("notes"),
            "applies_when": meta.get("applies_when"),
            "status": cur["status"], "label": cur["label"], "text": cur["text"], "current": cur, "history": pts, "trend": trend,
        }
        if fid == "egfr":
            risk["stage"] = formulas.egfr_stage(cur["value"])
            span = (date.fromisoformat(pts[-1]["date"]) - date.fromisoformat(pts[0]["date"])).days if len(pts) > 1 else 0
            if trend and span >= 300 and trend["per_year"] < -5:
                risk["status"] = "red"
                risk["label"] = f"Rapid decline ({abs(trend['per_year']):.1f} per year)"
                risk["text"] = (f"Your kidney score has fallen from {trend['first']:.0f} to {cur['value']:.0f}. "
                                "A fall of more than 5 per year is called rapid decline, even though creatinine still looks normal on each report.")
        if fid == "fib4" and p.age_at(p.today) is not None and p.age_at(p.today) < 35:
            risk["notes"] = (risk["notes"] or "") + " Caution: FIB-4 is not validated below age 35."
        out.append(risk)
    order = {"red": 0, "yellow": 1, "green": 2}
    out.sort(key=lambda r: (order[r["status"]], r["name"]))
    return out


# ---------------------------------------------------------------- personal baseline model
def drifts(p: Patient) -> list[dict]:
    """Values still inside the normal range but trending steadily towards the limit."""
    out = []
    for code, t in catalog.tests().items():
        s = p.series(code)
        if len(s) < 3 or (s[-1].date - s[0].date).days < 300:
            continue
        latest = s[-1]
        if flag(latest, p.sex) != "N":
            continue  # already abnormal -> shown as a normal flag, not a hidden drift
        lt = linear_trend([(o.date, o.value) for o in s])
        if not lt:
            continue
        slope, r2 = lt
        bad = t.get("bad_direction", "both")
        lo, hi = _ref(latest, p.sex)
        rising_bad = slope > 0 and bad in ("high", "both") and hi is not None
        falling_bad = slope < 0 and bad in ("low", "both") and lo is not None
        if r2 < 0.6 or not (rising_bad or falling_bad):
            continue
        first = s[0].value
        change_pct = (latest.value - first) / first * 100 if first else 0
        limit = hi if rising_bad else lo
        years_to_limit = (limit - latest.value) / slope if slope else None
        months = round(years_to_limit * 12) if years_to_limit is not None and years_to_limit >= 0 else None
        if abs(change_pct) < 15 and (months is None or months > 36):
            continue
        direction = "rising" if slope > 0 else "falling"
        msg = (f"{t['name']} has been {direction} steadily: {first:g} → {latest.value:g} {t['unit']} "
               f"({change_pct:+.0f}%) since {s[0].date.strftime('%b %Y')}. Every report says 'normal', but the trend is heading towards the {'upper' if rising_bad else 'lower'} limit")
        if months == 0:
            msg += ", and it is now right at the limit."
        elif months is not None and months <= 60:
            msg += f", which it may cross in about {months} months."
        else:
            msg += "."
        out.append({
            "code": code, "name": t["name"], "unit": t["unit"], "first": first, "latest": latest.value,
            "first_date": s[0].date.isoformat(), "latest_date": latest.date.isoformat(), "change_pct": round(change_pct, 1),
            "slope_per_year": round(slope, 3), "r2": round(r2, 2), "limit": limit, "months_to_limit": months,
            "points": [{"date": o.date.isoformat(), "value": o.value, "lab": o.lab_name, "result_id": o.result_id} for o in s],
            "message": msg,
        })
    out.sort(key=lambda d: (d["months_to_limit"] if d["months_to_limit"] is not None else 999, -abs(d["change_pct"])))
    return out


# ---------------------------------------------------------------- alerts
def _alert(aid, kind, level, title, text, action=None, citation=None, refs=None, panel=None):
    return {"id": aid, "type": kind, "level": level, "title": title, "text": text, "action": action,
            "citation": citation, "refs": refs or [], "panel": panel}


def _latest_egfr(risks: list[dict]) -> float | None:
    for r in risks:
        if r["id"] == "egfr":
            return r["current"]["value"]
    return None


def _months(a: date, b: date) -> float:
    return (b - a).days / 30.44


def alerts(p: Patient, risks: list[dict]) -> list[dict]:
    out: list[dict] = []
    tests = catalog.tests()
    meds_db = catalog.medicines()["generics"]
    active = [m for m in p.meds if m.active]

    # 1. Critical values (latest of each test)
    for code, t in tests.items():
        o = p.latest(code)
        crit = t.get("critical")
        if not o or not crit:
            continue
        if ("low" in crit and o.value < crit["low"]) or ("high" in crit and o.value > crit["high"]):
            out.append(_alert(f"critical-{code}", "critical", "red", f"Danger: {t['name']} is {o.value:g} {t['unit']}",
                              f"This is in the critical range (report dated {o.date:%d %b %Y}). Contact a doctor today. If you feel unwell, go to the emergency room.",
                              "Contact your doctor today", refs=[o.result_id]))

    # 2. Medicine-kidney safety
    egfr = _latest_egfr(risks)
    if egfr is not None:
        for m in active:
            for g in m.generics:
                for rule in meds_db.get(g, {}).get("kidney", []):
                    if egfr < rule["below"]:
                        out.append(_alert(f"kidney-{m.id}-{g}", "kidney_med", rule["level"],
                                          f"{m.brand}: kidney dose check needed",
                                          f"Your latest eGFR is {egfr:.0f}. {rule['text']}",
                                          f"Ask your doctor to review the dose of {meds_db[g]['name']}", refs=[m.id]))
                        break
        classes = set().union(*(m.classes() for m in active)) if active else set()
        if "nsaid" in classes and classes & {"acei", "arb"} and classes & {"loop_diuretic", "mra"}:
            out.append(_alert("triple-whammy", "kidney_med", "red", "Risky medicine combination for the kidneys",
                              "A painkiller (NSAID) together with an ACE-inhibitor/ARB BP medicine and a water pill is known as the 'triple whammy'. It can cause sudden kidney injury.",
                              "Ask your doctor before taking the painkiller again",
                              "Lapi F et al. BMJ 2013;346:e8525."))

    # 3. Prescribing cascades
    for rule in catalog.rules()["cascades"]:
        firsts = [m for m in p.meds if rule["first_class"] in m.classes() and m.start]
        seconds = [m for m in p.meds if rule["second_class"] in m.classes() and m.start]
        for a in firsts:
            for b in seconds:
                gap = (b.start - a.start).days
                if 0 < gap <= rule["max_gap_days"]:
                    sym = next((s for s in p.symptoms if s.key == rule["symptom"] and a.start <= s.onset <= b.start), None)
                    text = rule["text"]
                    if sym:
                        text = (f"'{catalog.symptoms().get(sym.key, sym.key)}' was logged on {sym.onset:%d %b %Y}, "
                                f"{human_days((sym.onset - a.start).days)} after starting {a.brand}. "
                                f"{b.brand} was added {human_days((b.start - sym.onset).days)} later. ") + text
                    else:
                        text = f"{b.brand} was started {human_days(gap)} after {a.brand}. " + text
                    out.append(_alert(f"cascade-{rule['id']}-{a.id}-{b.id}", "cascade", "yellow", rule["title"], text,
                                      rule["question"], rule["citation"], refs=[a.id, b.id]))

    # 4. Side effect timing (symptom started soon after a new medicine)
    for s in p.symptoms:
        for m in p.meds:
            if not m.start:
                continue
            days = (s.onset - m.start).days
            if 0 <= days <= 120:
                for g in m.generics:
                    if s.key in meds_db.get(g, {}).get("side_effects", []):
                        label = catalog.symptoms().get(s.key, s.key)
                        out.append(_alert(f"sidefx-{s.key}-{m.id}", "side_effect", "yellow",
                                          f"{label} may be linked to {m.brand}",
                                          f"'{label}' started {days} days after you began {m.brand} ({meds_db[g]['name']}). This is a known side effect.",
                                          f"Tell your doctor about the {label.lower()} before changing anything", refs=[m.id]))
                        break

    # 5. Medicine monitoring (e.g. metformin -> B12)
    for m in active:
        if not m.start:
            continue
        for g in m.generics:
            for mon in meds_db.get(g, {}).get("monitoring", []):
                on_months = _months(m.start, p.today)
                if on_months < mon["after_months"]:
                    continue
                last = p.latest(mon["test"])
                if last and _months(last.date, p.today) <= mon["every_months"]:
                    continue
                tingling = next((s for s in p.symptoms if s.key == "tingling_feet"), None) if mon["test"] == "B12" else None
                text = f"You have been on {meds_db[g]['name']} for {on_months / 12:.1f} years. {mon['text']}"
                text += f" No {tests[mon['test']]['name']} result found in your records." if not last else f" Last checked {last.date:%b %Y}."
                level = "yellow"
                if tingling:
                    text += f" You also logged tingling in the feet on {tingling.onset:%d %b %Y}; low B12 is a treatable cause."
                    level = "red"
                out.append(_alert(f"monitor-{g}-{mon['test']}", "monitoring", level,
                                  f"{tests[mon['test']]['name']} check due ({meds_db[g]['name']})", text,
                                  f"Ask for a {tests[mon['test']]['name']} test", refs=[m.id],
                                  panel=catalog.panel_of_test().get(mon["test"])))

    # 6. Iron tablets without improvement
    for m in p.meds:
        if "iron" not in m.classes() or not m.start:
            continue
        hb = p.series("HB")
        before = [o for o in hb if o.date <= m.start + timedelta(days=14)]
        after = [o for o in hb if o.date >= m.start + timedelta(days=90)]
        if before and after and after[-1].value - before[-1].value < 0.5:
            mz = next((r for r in risks if r["id"] == "mentzer"), None)
            text = (f"Iron tablets ({m.brand}) since {m.start:%b %Y}, but haemoglobin is still {after[-1].value:g} g/dL "
                    f"(was {before[-1].value:g}).")
            if mz and mz["status"] == "red":
                text += f" The Mentzer index is {mz['current']['value']}, which points to thalassaemia trait rather than iron deficiency."
            out.append(_alert(f"iron-{m.id}", "iron", "red" if mz and mz["status"] == "red" else "yellow",
                              "Iron tablets are not improving haemoglobin", text,
                              "Ask your doctor about Hb electrophoresis and ferritin", refs=[m.id]))

    # 7. Care gaps
    gaps_by_panel: dict[str, list[dict]] = defaultdict(list)
    for rule in catalog.rules()["care_gaps"]:
        if not p.has(rule["condition"]):
            continue
        last = p.latest(rule["test"])
        if last and _months(last.date, p.today) <= rule["every_months"]:
            continue
        gaps_by_panel[rule["panel"]].append({**rule, "last": last.date.isoformat() if last else None})
    for panel, rules in gaps_by_panel.items():
        r0 = rules[0]
        last = r0["last"]
        when = f"Last done {date.fromisoformat(last):%b %Y}." if last else "Not found in your records."
        out.append(_alert(f"gap-{panel}", "care_gap", "yellow", f"Due: {catalog.panels()[panel]['name']}",
                          f"{r0['text']} {when}", f"Book a {catalog.panels()[panel]['name']}", r0["citation"], panel=panel))

    # 8. Repeat tests (same panel twice within a short window)
    windows = catalog.rules()["repeat_windows_days"]
    for pcode, panel in catalog.panels().items():
        dates_reports = sorted({(o.date, o.report_id, o.lab_name) for c in panel["tests"] for o in p.series(c)})
        for (d1, r1, l1), (d2, r2, l2) in zip(dates_reports, dates_reports[1:], strict=False):
            gap = (d2 - d1).days
            if r1 != r2 and 0 < gap <= windows.get(pcode, windows["default"]):
                out.append(_alert(f"repeat-{pcode}-{d2}", "repeat", "info", f"{panel['name']} repeated after {gap} days",
                                  f"Done on {d1:%d %b %Y} ({l1 or 'lab'}) and again on {d2:%d %b %Y} ({l2 or 'lab'}). "
                                  "Unless your doctor asked for it, a repeat this soon is often not needed. Share old reports to save money.",
                                  "Show previous reports before re-testing"))

    order = {"red": 0, "yellow": 1, "info": 2}
    out.sort(key=lambda a: order[a["level"]])
    return out


# ---------------------------------------------------------------- next best test
def next_tests(p: Patient, risks: list[dict], alert_list: list[dict]) -> list[dict]:
    recent = {o.code for o in p.obs if (p.today - o.date).days <= 365}
    risk_by_id = {r["id"]: r for r in risks}
    out = []
    for pcode, panel in catalog.panels().items():
        unlocks = []
        for fid, meta in catalog.formulas().items():
            if fid == "tyg" and p.has("diabetes"):
                continue
            if fid == "fib4" and (p.age_at(p.today) or 99) < 35:
                continue  # not validated below 35
            if fid == "mentzer":
                mcv = p.latest("MCV")
                if not mcv or mcv.value >= 80:
                    continue  # only meaningful for small red cells
            lab_inputs = [c for c in meta["inputs"] if c not in ("AGE", "SEX")]
            if not set(lab_inputs) & set(panel["tests"]):
                continue
            cur = risk_by_id.get(fid)
            fresh = cur and (p.today - date.fromisoformat(cur["current"]["date"])).days <= 365
            if fresh:
                continue
            if all(c in recent or c in panel["tests"] for c in lab_inputs):
                unlocks.append(meta["name"])
        gaps = [a["title"] for a in alert_list if a["type"] == "care_gap" and a["panel"] == pcode]
        follow = []
        mz = risk_by_id.get("mentzer")
        urgent = []
        if pcode == "HB_ELECTRO" and mz and mz["status"] == "red":
            urgent.append("confirms or rules out thalassaemia trait (Mentzer index points to it)")
        if pcode == "FERRITIN" and mz:
            follow.append("confirms whether iron stores are low")
        eg = risk_by_id.get("egfr")
        if pcode == "UACR" and eg and eg["status"] != "green":
            (urgent if eg["status"] == "red" else follow).append("checks for protein leak, needed to stage your kidney health")
        if any(a["type"] == "monitoring" and a["panel"] == pcode for a in alert_list):
            follow.append("monitoring due for one of your medicines")
        ty = risk_by_id.get("tyg")
        if pcode == "HBA1C" and ty and ty["status"] != "green" and "HBA1C" not in recent:
            follow.append("checks for prediabetes (TyG shows insulin resistance)")
        fb = risk_by_id.get("fib4")
        if pcode == "LFT" and fb and fb["status"] != "green" and (p.today - date.fromisoformat(fb["current"]["date"])).days > 180:
            follow.append("re-checks your liver-scarring score")
        follow = urgent + follow
        score = 3 * len(unlocks) + 2 * len(gaps) + 4 * len(follow) + 2 * len(urgent)
        if score == 0:
            continue
        out.append({"panel": pcode, "name": panel["name"], "price_inr": panel["price_inr"], "unlocks": unlocks,
                    "care_gaps": gaps, "follow_ups": follow, "score": score,
                    "value_per_100": round(score / (panel["price_inr"] / 100), 2)})
    out.sort(key=lambda x: (-x["score"], x["price_inr"]))
    return out[:4]


# ---------------------------------------------------------------- summary
def snapshot_score(risks: list[dict], alert_list: list[dict], drift_list: list[dict]) -> dict:
    s = 100
    s -= 12 * sum(r["status"] == "red" for r in risks) + 5 * sum(r["status"] == "yellow" for r in risks)
    s -= 20 * sum(a["type"] == "critical" for a in alert_list)
    s -= 6 * sum(a["level"] == "red" and a["type"] != "critical" for a in alert_list)
    s -= 3 * sum(a["level"] == "yellow" for a in alert_list)
    s -= 3 * len(drift_list)
    s = max(5, min(100, s))
    label = "All good" if s >= 85 else "A few things to watch" if s >= 65 else "Needs attention" if s >= 40 else "Talk to your doctor soon"
    return {"value": s, "label": label,
            "explanation": "This is not a medical score. It summarises how many things in your records need attention: red flags count more than yellow ones."}


def doctor_questions(risks: list[dict], alert_list: list[dict], drift_list: list[dict]) -> list[str]:
    qs = []
    for r in risks:
        if r["status"] == "red":
            qs.append(f"My {r['name']} is {r['current']['value']} ({r['label']}). {r['next_step']}")
    for a in alert_list:
        if a["level"] in ("red", "yellow") and a.get("action") and a["type"] in ("cascade", "kidney_med", "monitoring", "iron", "side_effect", "wellness"):
            qs.append(a["action"] if a["action"].endswith("?") else f"{a['title']}: {a['action']}.")
    for d in drift_list[:2]:
        qs.append(f"My {d['name']} has changed {d['change_pct']:+.0f}% over the years, though still 'normal'. Should we watch it?")
    for r in risks:
        if r["status"] == "yellow":
            qs.append(f"My {r['name']} is {r['current']['value']} ({r['label']}). {r['next_step']}")
    seen, out = set(), []
    for q in qs:
        if q not in seen:
            seen.add(q)
            out.append(q)
    return out[:6]


def analyze(p: Patient) -> dict:
    risks = hidden_risks(p)
    drift_list = drifts(p)
    alert_list = alerts(p, risks)
    from datetime import datetime, time

    nsaid_starts = [(m.brand, datetime.combine(m.start, time(), tzinfo=UTC)) for m in p.meds if m.start and "nsaid" in m.classes()]
    wellness_cards, wellness_alerts = wellness.analyze(
        p.vitals, now=datetime.combine(p.today, time(23, 59), tzinfo=UTC), height_cm=p.height_cm,
        has_diabetes=p.has("diabetes"), nsaid_starts=nsaid_starts)
    alert_list = sorted(alert_list + wellness_alerts, key=lambda a: {"red": 0, "yellow": 1, "info": 2}[a["level"]])
    return {
        "hidden_risks": risks,
        "drifts": drift_list,
        "wellness": wellness_cards,
        "alerts": alert_list,
        "next_tests": next_tests(p, risks, alert_list),
        "score": snapshot_score(risks, alert_list, drift_list),
        "questions": doctor_questions(risks, alert_list, drift_list),
    }
