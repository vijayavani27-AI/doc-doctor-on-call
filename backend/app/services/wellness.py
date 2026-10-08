"""Wellness analysis: turns home readings into averages, trends and guideline-based prompts.

Links wellness data with the rest of the record. For example, home BP rising after an NSAID
painkiller was started, or home sugar staying above target for a person with diabetes.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from . import catalog


@dataclass
class Vital:
    kind: str
    value: float
    value2: float | None
    at: datetime
    context: str | None = None
    id: int | None = None


def _avg(xs: list[float]) -> float | None:
    return round(sum(xs) / len(xs), 1) if xs else None


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def analyze(vitals: list[Vital], *, now: datetime, height_cm: float | None, has_diabetes: bool,
            nsaid_starts: list[tuple[str, datetime]]) -> tuple[list[dict], list[dict]]:
    """Return (cards, alerts). Cards summarise each kind; alerts follow the shared alert shape."""
    meta = catalog.wellness()
    now = _aware(now)
    by_kind: dict[str, list[Vital]] = {}
    for v in sorted(vitals, key=lambda v: _aware(v.at)):
        by_kind.setdefault(v.kind, []).append(v)
    cards, alerts = [], []

    def window(vs: list[Vital], days: int, end: datetime | None = None) -> list[Vital]:
        end = end or now
        return [v for v in vs if end - timedelta(days=days) <= _aware(v.at) <= end]

    def alert(aid, level, title, text, action, citation):
        alerts.append({"id": aid, "type": "wellness", "level": level, "title": title, "text": text, "action": action,
                       "citation": citation, "refs": [], "panel": None})

    for kind, vs in by_kind.items():
        m = meta.get(kind)
        if not m:
            continue
        last = vs[-1]
        recent = window(vs, 30)
        prev = window(vs, 30, now - timedelta(days=30))
        card = {"kind": kind, "label": m["label"], "unit": m["unit"], "target": m["target"], "citation": m["citation"],
                "count": len(vs), "latest": last.value, "latest2": last.value2, "latest_at": _aware(last.at).isoformat(),
                "avg30": _avg([v.value for v in recent]), "avg30_2": _avg([v.value2 for v in recent if v.value2 is not None]),
                "prev30": _avg([v.value for v in prev]),
                "points": [{"at": _aware(v.at).isoformat(), "value": v.value, "value2": v.value2, "context": v.context} for v in vs[-120:]],
                "status": "green", "note": None}

        if kind == "bp" and recent:
            s, d = card["avg30"], card["avg30_2"] or 0
            if any(v.value >= 180 or (v.value2 or 0) >= 110 for v in window(vs, 7)):
                card["status"] = "red"
                alert("bp-crisis", "red", "Very high BP reading this week",
                      "A home reading of 180/110 or higher was recorded in the last 7 days. If you have headache, chest pain, breathlessness or weakness, seek emergency care.",
                      "Call your doctor today", m["citation"])
            elif s >= 135 or d >= 85:
                card["status"] = "red" if s >= 160 or d >= 100 else "yellow"
                alert("bp-high", card["status"], f"Home BP above target: average {s:.0f}/{d:.0f}",
                      f"Your 30-day home average is {s:.0f}/{d:.0f} mmHg from {len(recent)} readings. The home target is below 135/85.",
                      "Show these readings to your doctor; your BP medicines may need review", m["citation"])
            card["note"] = f"30-day average {s:.0f}/{d:.0f}"
            # wellness x prescriptions: BP rise after an NSAID painkiller started
            for brand, started in nsaid_starts:
                before = [v.value for v in vs if started - timedelta(days=60) <= _aware(v.at) < started]
                after = [v.value for v in vs if started <= _aware(v.at) <= started + timedelta(days=90)]
                if len(before) >= 3 and len(after) >= 3 and (_avg(after) or 0) - (_avg(before) or 0) >= 8:
                    alert(f"bp-nsaid-{brand}", "yellow", f"BP went up after starting {brand}",
                          f"Average home systolic BP was {_avg(before):.0f} before {brand} and {_avg(after):.0f} after it ({len(before)} vs {len(after)} readings). NSAID painkillers are known to raise blood pressure.",
                          f"Ask your doctor whether {brand} could be raising your BP", "Rochon PA, Gurwitz JH. The prescribing cascade revisited. Lancet 2017;389:1778-1780.")

        if kind == "glucose" and recent:
            fasting = [v.value for v in recent if v.context in (None, "fasting")]
            lows = [v for v in window(vs, 30) if v.value < 70]
            if lows:
                card["status"] = "red"
                alert("glucose-low", "red", f"Low sugar reading{'s' if len(lows) > 1 else ''} in the last 30 days",
                      f"{len(lows)} reading(s) below 70 mg/dL (lowest {min(v.value for v in lows):.0f}). Low sugar can cause shaking, sweating and confusion.",
                      "Tell your doctor; your diabetes medicine dose may need review", m["citation"])
            if fasting and has_diabetes and (_avg(fasting) or 0) > 130:
                card["status"] = "yellow" if card["status"] == "green" else card["status"]
                alert("glucose-high", "yellow", f"Fasting sugar above target: average {_avg(fasting):.0f}",
                      f"Your 30-day fasting average is {_avg(fasting):.0f} mg/dL. The usual target before meals is 80–130.",
                      "Share your sugar diary at your next visit", m["citation"])
            card["note"] = f"30-day fasting average {_avg(fasting):.0f}" if fasting else None

        if kind == "weight":
            if height_cm:
                bmi = round(last.value / ((height_cm / 100) ** 2), 1)
                card["bmi"] = bmi
                card["note"] = f"BMI {bmi} ({'healthy' if 18.5 <= bmi < 23 else 'overweight' if bmi < 25 else 'obese' if bmi >= 25 else 'underweight'} for Asian adults)"
                if bmi >= 23:
                    card["status"] = "yellow"
            old = [v for v in vs if now - timedelta(days=200) <= _aware(v.at) <= now - timedelta(days=150)]
            if old and old[0].value:
                change = (last.value - old[0].value) / old[0].value * 100
                card["change_6m_pct"] = round(change, 1)
                if change <= -5:
                    card["status"] = "yellow"
                    alert("weight-loss", "yellow", f"Weight down {abs(change):.0f}% in about 6 months",
                          f"Weight went from {old[0].value:g} to {last.value:g} kg. If you weren't trying to lose weight, this is worth checking.",
                          "Mention the weight loss to your doctor", m["citation"])

        if kind == "spo2" and recent:
            low = min(v.value for v in window(vs, 7)) if window(vs, 7) else None
            if low is not None and low < 92:
                card["status"] = "red"
                alert("spo2-low", "red", f"Low oxygen reading: {low:.0f}%",
                      "Oxygen below 92% at rest needs medical advice. Below 90%, or if you are breathless, seek urgent care.",
                      "Contact a doctor today", m["citation"])

        if kind == "heart_rate" and recent:
            a = card["avg30"] or 0
            if a > 100 or a < 50:
                card["status"] = "yellow"
                alert("hr-range", "yellow", f"Resting heart rate average {a:.0f} bpm",
                      "Your average resting heart rate is outside 50–100 bpm.", "Mention it to your doctor", m["citation"])

        if kind == "steps" and recent:
            a = card["avg30"] or 0
            card["note"] = f"30-day average {a:,.0f} steps"
            if a < 5000:
                card["status"] = "yellow"
                alert("steps-low", "info", f"Low activity: about {a:,.0f} steps a day",
                      "Below 5,000 steps a day counts as sedentary. Even a 10-minute walk after meals helps sugar and BP.",
                      "Ask your doctor what activity is safe for you", m["citation"])

        if kind == "sleep" and recent:
            a = card["avg30"] or 0
            card["note"] = f"30-day average {a:.1f} h"
            if a < 6:
                card["status"] = "yellow"
                alert("sleep-short", "info", f"Short sleep: about {a:.1f} hours a night",
                      "Less than 6–7 hours a night is linked with higher BP and sugar.", "Talk to your doctor if you can't sleep well", m["citation"])

        cards.append(card)
    order = ["bp", "glucose", "weight", "heart_rate", "spo2", "steps", "sleep"]
    cards.sort(key=lambda c: order.index(c["kind"]) if c["kind"] in order else 99)
    return cards, alerts
