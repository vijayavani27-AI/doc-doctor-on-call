"""Code-generated plain-language sentences in English / Tamil / Hindi from curated templates
(data/tamil.json). No AI is needed for these, so the wording is predictable and reviewable."""
from __future__ import annotations

import json
from functools import lru_cache

from .. import config

DISCLAIMER = ("DOC explains your records in simple words. It does not diagnose or prescribe. "
              "Please discuss any result or change with your doctor. In an emergency call 112.")

_FALLBACK = {
    "flag.normal": "{test} is {value} {unit}, within the usual range.",
    "flag.low": "{test} is {value} {unit}, below the usual range. This is worth discussing with your doctor.",
    "flag.high": "{test} is {value} {unit}, above the usual range. This is worth discussing with your doctor.",
    "flag.critical_low": "{test} is {value} {unit}, far below the usual range. Please contact a doctor today.",
    "flag.critical_high": "{test} is {value} {unit}, far above the usual range. Please contact a doctor today.",
    "trend.up": "{test} went from {from_value} to {to_value} {unit} ({change_percent}%) between {from_date} and {to_date}. This is worth discussing with your doctor.",
    "trend.down": "{test} went from {from_value} to {to_value} {unit} ({change_percent}%) between {from_date} and {to_date}. This is worth discussing with your doctor.",
    "trend.stable": "{test} stayed about the same ({from_value} to {to_value} {unit}) between {from_date} and {to_date}.",
    "summary.header": "Report summary for {name}, dated {date}",
    "summary.no_abnormal": "All {count} values are within the usual range.",
    "summary.n_abnormal": "{abnormal} of {count} values are outside the usual range. These are worth discussing with your doctor.",
    "needs_review": "We could not read {test} clearly. Please check this value against your printed report.",
    "risk.low": "Your {risk} score is {value}. This usually means a low risk.",
    "risk.moderate": "Your {risk} score is {value}. This can indicate a moderate risk. It is worth discussing with your doctor.",
    "risk.high": "Your {risk} score is {value}. This can indicate a high risk. Please see your doctor soon.",
    "sos.message": "{name} needs urgent help. Location: {location}. Please call them now. If you cannot reach them, call 112.",
    "disclaimer": DISCLAIMER,
    "urgent.banner": "Some values need urgent attention. Please see a doctor now or call 112.",
}


@lru_cache
def _templates() -> dict:
    path = config.DATA_DIR / "tamil.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8")).get("templates", {})
        except (OSError, ValueError):
            return {}
    return {}


class _Safe(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def t(key: str, lang: str = "en", **kw) -> str:
    entry = _templates().get(key) or {}
    text = entry.get(lang) or entry.get("en") or _FALLBACK.get(key, key)
    return text.format_map(_Safe(**{k: _fmt(v) for k, v in kw.items()}))


def _fmt(v):
    if isinstance(v, float):
        return f"{v:g}"
    return "" if v is None else v


def disclaimer(lang: str = "en") -> str:
    return t("disclaimer", lang)
