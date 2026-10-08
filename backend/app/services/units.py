"""Unit harmonisation: every lab writes units differently (2.5 lakhs/cumm, 250 x10^3/uL,
250 10^9/L...). We convert everything to the catalogue's canonical unit so values from
different labs can be compared and used in formulas."""
import re
from dataclasses import dataclass

from . import catalog

_SUPERSCRIPTS = str.maketrans({"³": "3", "⁶": "6", "⁹": "9", "¹": "1", "²": "2", "⁰": "0"})


def norm_unit(unit: str | None) -> str:
    if not unit:
        return ""
    s = unit.strip().lower().translate(_SUPERSCRIPTS)
    s = s.replace("µ", "u").replace("μ", "u").replace("mcg", "ug")
    s = s.replace(" ", "")
    s = re.sub(r"^[x×*]", "", s)
    s = re.sub(r"10\^?(\d+)", r"10e\1", s)  # 10^3, 103 after superscript strip -> 10e3
    s = s.replace("10e3", "10e3").replace("thou", "10e3").replace("thousand", "10e3")
    s = re.sub(r"(millions?|mill)", "10e6", s)
    s = re.sub(r"(lakhs?|lacs?)", "lakh", s)
    s = re.sub(r"(cu\.?mm|cmm|mm3|mm\^3|cumm|ul|microlitre|microliter)$", "ul", s)
    s = s.replace("cells/", "/") if s.startswith("cells/") else s
    if s in ("/cmm", "/cumm", "/mm3"):
        s = "/ul"
    if s == "10e6/ul":
        return "10e6/ul"
    return s


@dataclass
class Converted:
    value: float
    unit: str
    confidence: float
    note: str | None = None


def convert(code: str, value: float, unit_raw: str | None) -> Converted:
    """Convert a raw value to the canonical unit for test `code`."""
    t = catalog.tests().get(code)
    if t is None:
        return Converted(value, unit_raw or "", 0.5, "unknown test")
    canonical = t["unit"]
    conversions = t.get("conversions", {})
    lo, hi = t.get("plausible", [float("-inf"), float("inf")])
    key = norm_unit(unit_raw)

    if key and key in conversions:
        factor, offset = conversions[key]
        v = round(value * factor + offset, 4)
        conf = 1.0 if lo <= v <= hi else 0.4
        note = None if factor == 1 and offset == 0 else f"converted from {unit_raw}"
        return Converted(v, canonical, conf, note)

    if key == norm_unit(canonical):
        return Converted(value, canonical, 1.0 if lo <= value <= hi else 0.4)

    # Unit missing or unrecognised: infer from magnitude (common for platelets / WBC).
    if code == "PLT":
        if value < 10:
            return Converted(round(value * 100, 2), canonical, 0.7, "assumed lakhs/cumm from magnitude")
        if value > 5000:
            return Converted(round(value / 1000, 2), canonical, 0.7, "assumed cells/uL from magnitude")
    if code == "WBC" and value > 500:
        return Converted(round(value / 1000, 2), canonical, 0.7, "assumed cells/uL from magnitude")
    if lo <= value <= hi:
        return Converted(value, canonical, 0.7 if key else 0.75, f"unit '{unit_raw}' assumed to be {canonical}" if key else "unit missing; assumed canonical")
    return Converted(value, canonical, 0.3, f"value outside plausible range for unit '{unit_raw}'")


def convert_ref(code: str, low: float | None, high: float | None, unit_raw: str | None) -> tuple[float | None, float | None]:
    out = []
    for v in (low, high):
        out.append(None if v is None else convert(code, v, unit_raw).value)
    return out[0], out[1]
