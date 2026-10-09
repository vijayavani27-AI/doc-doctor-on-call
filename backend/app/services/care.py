"""Helpers for the care plan: risk-model features from a person's records, reminder slots, demo devices."""
from __future__ import annotations

import random
import re
from datetime import UTC, date, datetime, timedelta

from . import catalog

# ---------------------------------------------------------------- spec vital types <-> stored kinds
VITAL_TYPES = {
    "glucose_fasting": ("glucose", "fasting"), "glucose_post": ("glucose", "after_meal"), "bp": ("bp", None),
    "heart_rate": ("heart_rate", None), "weight": ("weight", None), "steps": ("steps", None), "sleep_hours": ("sleep", None),
    "water_ml": ("water", None), "calories": ("calories", None), "spo2": ("spo2", None), "glucose_random": ("glucose", "random"),
}


def vital_type(kind: str, context: str | None) -> str:
    for t, (k, c) in VITAL_TYPES.items():
        if k == kind and (c is None or c == context):
            return t
    return kind


# ---------------------------------------------------------------- risk features
def _latest(profile, code: str, days: int | None = None):
    rs = [r for r in profile.results if r.confirmed and r.test_code == code and r.value is not None and r.date]
    if days is not None:
        rs = [r for r in rs if r.date >= date.today() - timedelta(days=days)]
    return max(rs, key=lambda r: r.date) if rs else None


def _vitals_avg(profile, kind: str, context: str | None = None, days: int = 60) -> tuple[float | None, float | None]:
    since = datetime.now(UTC) - timedelta(days=days)
    vs = [v for v in profile.vitals if v.kind == kind and (context is None or v.context == context)
          and (v.measured_at if v.measured_at.tzinfo else v.measured_at.replace(tzinfo=UTC)) >= since]
    if not vs:
        return None, None
    a = sum(v.value for v in vs) / len(vs)
    b = [v.value2 for v in vs if v.value2 is not None]
    return round(a, 1), (round(sum(b) / len(b), 1) if b else None)


def _age(profile) -> int | None:
    return (date.today() - profile.dob).days // 365 if profile.dob else None


def _bmi(profile) -> float | None:
    if profile.height_cm and profile.weight_kg:
        return round(profile.weight_kg / (profile.height_cm / 100) ** 2, 1)
    return None


def risk_features(kind: str, profile, answers: dict | None = None) -> tuple[dict, list[dict]]:
    """Map the person's own data to model features. Returns (values, notes about where each came from)."""
    answers = {k: v for k, v in (answers or {}).items() if v is not None}
    notes: list[dict] = []
    v: dict[str, float | None] = {}

    def put(feature, value, source):
        if value is not None:
            v[feature] = value
            notes.append({"feature": feature, "source": source})

    age = _age(profile)
    put("age", age, "date of birth")
    if kind == "diabetes":
        ppbg = _latest(profile, "PPBG", 365)
        home_post, _ = _vitals_avg(profile, "glucose", "after_meal")
        if ppbg:
            put("glucose", ppbg.value, f"post-meal sugar lab test on {ppbg.date} (used in place of a 2-hour glucose test)")
        elif home_post:
            put("glucose", home_post, "average home post-meal sugar, last 60 days (used in place of a 2-hour glucose test)")
        _, dia = _vitals_avg(profile, "bp")
        put("diastolic_bp", dia, "average home BP (bottom number), last 60 days")
        put("bmi", _bmi(profile), "height and weight in your profile")
        if profile.sex == "M":
            put("pregnancies", 0, "sex: male")
    else:
        put("sex", 1 if profile.sex == "M" else 0, "profile")
        sys_bp, _ = _vitals_avg(profile, "bp")
        put("trestbps", sys_bp, "average home BP (top number), last 60 days")
        tc = _latest(profile, "TC", 730)
        if tc:
            put("chol", tc.value, f"total cholesterol on {tc.date}")
        fbg = _latest(profile, "FBG", 730)
        if fbg:
            put("fbs", 1 if fbg.value > 120 else 0, f"fasting sugar {fbg.value:g} mg/dL on {fbg.date}")
    for k, val in answers.items():
        try:
            put(k, float(val), "your answer")
        except (TypeError, ValueError):
            continue
    return v, notes


# ---------------------------------------------------------------- reminders
_FREQ_TIMES = {"1-0-0": ["08:00"], "0-1-0": ["14:00"], "0-0-1": ["21:00"], "1-0-1": ["08:00", "21:00"], "1-1-0": ["08:00", "14:00"],
               "0-1-1": ["14:00", "21:00"], "1-1-1": ["08:00", "14:00", "21:00"]}


def times_for_frequency(freq: str | None) -> list[str]:
    f = (freq or "").lower().replace(" ", "")
    m = re.match(r"([01])-([01])-([01])", f)
    if m:
        return _FREQ_TIMES.get("-".join(m.groups()), ["08:00"])
    if any(x in f for x in ("tds", "tid", "thrice")):
        return ["08:00", "14:00", "21:00"]
    if any(x in f for x in ("bd", "bid", "twice")):
        return ["08:00", "21:00"]
    if any(x in f for x in ("hs", "night", "bedtime")):
        return ["21:30"]
    return ["08:00"]


def slots_today(rem, today: date | None = None) -> list[dict]:
    today = today or date.today()
    if not rem.active or (rem.start_date and today < rem.start_date) or (rem.end_date and today > rem.end_date):
        return []
    if rem.days and today.weekday() not in rem.days:
        return []
    done = set(rem.done_log or [])
    return [{"slot": f"{today.isoformat()} {t}", "time": t, "done": f"{today.isoformat()} {t}" in done} for t in sorted(rem.times or [])]


# ---------------------------------------------------------------- simulated devices
DEVICE_KINDS = {
    "bp_monitor": {"name": "Omron-style BP monitor (simulated)", "reads": ["bp", "heart_rate"]},
    "glucometer": {"name": "Glucometer (simulated)", "reads": ["glucose"]},
    "fitness_band": {"name": "Fitness band (simulated)", "reads": ["steps", "sleep", "heart_rate"]},
    "smart_scale": {"name": "Smart scale (simulated)", "reads": ["weight"]},
    "pulse_oximeter": {"name": "Pulse oximeter (simulated)", "reads": ["spo2", "heart_rate"]},
}


def simulate_readings(device_kind: str, profile, since: datetime, now: datetime, seed: int) -> list[dict]:
    """Plausible daily readings between `since` and `now`, centred on the person's own recent values when present."""
    rng = random.Random(seed)
    days = max(1, min(14, (now.date() - since.date()).days or 1))
    base_bp, base_dia = _vitals_avg(profile, "bp", days=90)
    base_w = profile.weight_kg or _vitals_avg(profile, "weight", days=180)[0] or 65
    out = []
    for i in range(days):
        d = now - timedelta(days=days - 1 - i)
        for kind in DEVICE_KINDS[device_kind]["reads"]:
            if kind == "bp":
                s = round(rng.gauss(base_bp or 128, 6))
                out.append({"kind": "bp", "value": s, "value2": round(min(s - 25, rng.gauss(base_dia or 82, 4))), "at": d.replace(hour=7, minute=rng.randint(0, 50))})
            elif kind == "heart_rate":
                out.append({"kind": "heart_rate", "value": round(rng.gauss(76, 5)), "at": d.replace(hour=7, minute=rng.randint(0, 50))})
            elif kind == "glucose":
                out.append({"kind": "glucose", "value": round(rng.gauss(118, 12)), "context": "fasting", "at": d.replace(hour=7, minute=rng.randint(0, 50))})
            elif kind == "steps":
                out.append({"kind": "steps", "value": round(max(800, rng.gauss(5600, 1600))), "at": d.replace(hour=22, minute=0)})
            elif kind == "sleep":
                out.append({"kind": "sleep", "value": round(min(10, max(4, rng.gauss(6.6, 0.8))), 1), "at": d.replace(hour=7, minute=0)})
            elif kind == "weight":
                out.append({"kind": "weight", "value": round(rng.gauss(base_w, 0.3), 1), "at": d.replace(hour=7, minute=5)})
            elif kind == "spo2":
                out.append({"kind": "spo2", "value": min(100, round(rng.gauss(97, 1))), "at": d.replace(hour=7, minute=10)})
    return out


# ---------------------------------------------------------------- ABHA
ABHA_NUMBER_RE = re.compile(r"^\d{2}-?\d{4}-?\d{4}-?\d{4}$")
ABHA_ADDRESS_RE = re.compile(r"^[a-z0-9][a-z0-9._]{2,30}@(abdm|sbx)$")


def normalise_abha_number(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip()
    if not ABHA_NUMBER_RE.match(s):
        raise ValueError("ABHA number must be 14 digits, like 12-3456-7890-1234")
    d = re.sub(r"\D", "", s)
    return f"{d[:2]}-{d[2:6]}-{d[6:10]}-{d[10:]}"


def normalise_abha_address(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip().lower()
    if not ABHA_ADDRESS_RE.match(s):
        raise ValueError("ABHA address looks like yourname@abdm")
    return s


def checkup_suggestions(analysis: dict, profile) -> list[dict]:
    """Suggested checkups from the engine's care gaps / next best tests (not a prescription; 'worth discussing')."""
    out = []
    have = {c.title.lower() for c in profile.checkups if not c.done_date}
    for n in analysis.get("next_tests", [])[:4]:
        title = n["name"]
        if title.lower() in have:
            continue
        why = "; ".join(n.get("follow_ups", []) + n.get("care_gaps", []))[:240] or "Helps complete your health picture"
        out.append({"title": title, "kind": "lab", "why": why, "price_inr": n.get("price_inr")})
    conds = set(profile.conditions or [])
    if "diabetes" in conds and "eye check (retina)" not in have:
        out.append({"title": "Eye check (retina)", "kind": "eye", "why": "People with diabetes are usually advised a yearly retina check (ADA Standards of Care).", "price_inr": None})
    if "diabetes" in conds and "foot check" not in have:
        out.append({"title": "Foot check", "kind": "doctor", "why": "A yearly foot check is usually advised with diabetes (ADA Standards of Care).", "price_inr": None})
    return out[:6]


def test_name(code: str) -> str:
    return catalog.tests().get(code, {}).get("name", code)
