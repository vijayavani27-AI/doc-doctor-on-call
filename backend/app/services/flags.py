"""Lab flags are computed in CODE from the number + reference range (+ critical limits), never by an AI."""
from __future__ import annotations

from . import catalog

REVIEW_THRESHOLD = 0.75
FLAGS = ("normal", "low", "high", "critical_low", "critical_high")
# FHIR v3 ObservationInterpretation codes
INTERPRETATION = {"normal": ("N", "Normal"), "low": ("L", "Low"), "high": ("H", "High"),
                  "critical_low": ("LL", "Critical low"), "critical_high": ("HH", "Critical high")}


def compute_flag(value: float | None, ref_low: float | None, ref_high: float | None,
                 critical_low: float | None = None, critical_high: float | None = None) -> str | None:
    """normal / low / high / critical_low / critical_high, or None when there is no number."""
    if value is None:
        return None
    if critical_low is not None and value < critical_low:
        return "critical_low"
    if critical_high is not None and value > critical_high:
        return "critical_high"
    if ref_low is not None and value < ref_low:
        return "low"
    if ref_high is not None and value > ref_high:
        return "high"
    return "normal"


def critical_limits(code: str | None) -> tuple[float | None, float | None]:
    t = catalog.tests().get(code or "")
    crit = (t or {}).get("critical") or {}
    return crit.get("low"), crit.get("high")


def flag_for(code: str | None, value: float | None, ref_low: float | None, ref_high: float | None) -> str | None:
    lo, hi = critical_limits(code)
    return compute_flag(value, ref_low, ref_high, lo, hi)


def short(flag: str | None) -> str | None:
    """Legacy one-letter flag used by the existing UI (L / N / H)."""
    return {"normal": "N", "low": "L", "critical_low": "L", "high": "H", "critical_high": "H"}.get(flag or "")


def needs_review(confidence: float | None, user_verified: bool = False) -> bool:
    return not user_verified and (confidence is None or confidence < REVIEW_THRESHOLD)
