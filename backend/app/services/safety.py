"""Code rules that force an urgent "see a doctor now / call 112" banner. Never decided by an AI."""
from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

from . import catalog, flags, templates

EMERGENCY_NUMBERS = [{"label": "Emergency (all services)", "number": "112"}, {"label": "Ambulance", "number": "108"}]
MENTAL_HEALTH = {"label": "Tele-MANAS mental health helpline (24x7, free)", "number": "14416"}

# Words that mean "this could be an emergency" in a free-text question (English, Tamil, Hindi).
_URGENT_TEXT = [
    (r"chest pain|chest tight|pressure in (my )?chest|நெஞ்சு வலி|மார்பு வலி|सीने में दर्द|छाती में दर्द", "chest pain"),
    (r"can'?t breathe|cannot breathe|short(ness)? of breath|breathless|மூச்சு திணறல்|सांस (नहीं|लेने में)", "trouble breathing"),
    (r"face droop|slurred speech|one side (weak|numb)|stroke|பக்கவாதம்|लकवा", "possible stroke signs"),
    (r"faint(ed)?|unconscious|passed out|மயக்கம்|बेहोश", "fainting"),
    (r"vomit(ing)? blood|blood in vomit|black stool|severe bleeding|heavy bleeding|ரத்த வாந்தி|खून की उल्टी", "bleeding"),
    (r"seizure|fits|convulsion|வலிப்பு|दौरा", "seizure"),
    (r"suicid|kill myself|end my life|self.?harm|தற்கொலை|आत्महत्या", "thoughts of self-harm"),
]


def text_urgency(text: str | None) -> list[str]:
    if not text:
        return []
    q = text.lower()
    return [label for pat, label in _URGENT_TEXT if re.search(pat, q)]


def _recent(dt: datetime, days: int) -> bool:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt >= datetime.now(UTC) - timedelta(days=days)


def urgent_banner(profile=None, text: str | None = None, lang: str = "en") -> dict | None:
    """Return a banner dict if any rule fires, else None.

    Rules: latest value of any test is critical (from catalogue limits); home BP >= 180/120 in the last 7 days;
    home glucose < 54 or > 400 mg/dL in the last 7 days; SpO2 < 90% in the last 7 days; urgent words in a question.
    """
    reasons: list[str] = []
    if profile is not None:
        latest: dict[str, object] = {}
        for r in profile.results:
            if r.confirmed and r.test_code and r.value is not None and r.date:
                cur = latest.get(r.test_code)
                if cur is None or r.date >= cur.date:
                    latest[r.test_code] = r
        tests = catalog.tests()
        for code, r in latest.items():
            f = flags.flag_for(code, r.value, r.ref_low, r.ref_high)
            if f in ("critical_low", "critical_high"):
                reasons.append(f"{tests.get(code, {}).get('name', code)} {r.value:g} {r.unit or ''} on {r.date:%d %b %Y} is at a critical level".strip())
        for v in profile.vitals:
            if not _recent(v.measured_at, 7):
                continue
            if v.kind == "bp" and (v.value >= 180 or (v.value2 or 0) >= 120):
                reasons.append(f"Home BP {v.value:g}/{(v.value2 or 0):g} on {v.measured_at:%d %b} is in the crisis range")
            elif v.kind == "glucose" and (v.value < 54 or v.value > 400):
                reasons.append(f"Home sugar {v.value:g} mg/dL on {v.measured_at:%d %b} is dangerously {'low' if v.value < 54 else 'high'}")
            elif v.kind == "spo2" and v.value < 90:
                reasons.append(f"Oxygen level {v.value:g}% on {v.measured_at:%d %b} is low")
    words = text_urgency(text)
    reasons += [f"You mentioned {w}" for w in words]
    if not reasons:
        return None
    out = {"level": "emergency", "message": templates.t("urgent.banner", lang), "reasons": list(dict.fromkeys(reasons))[:5],
           "call": EMERGENCY_NUMBERS}
    if "thoughts of self-harm" in words:
        out["call"] = [*EMERGENCY_NUMBERS, MENTAL_HEALTH]
    return out
