"""Test-name normaliser: 'SGPT', 'ALT', 'Alanine transaminase' and 'S.G.P.T' all map to ALT.

Matching order: exact alias -> alias contained in the name -> fuzzy match (difflib).
Each step returns a confidence so low-confidence matches can be sent to the user to confirm.
"""
import re
from difflib import SequenceMatcher, get_close_matches
from functools import lru_cache

from . import catalog


def clean(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[\t:;,_]+", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip(" .-*")


def _strip_noise(s: str) -> str:
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(serum|s\.|plasma|blood|level|test|method|calculated|direct)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip(" .-")


@lru_cache
def _alias_index() -> dict[str, str]:
    idx = {}
    for code, t in catalog.tests().items():
        for a in [t["name"], *t.get("aliases", [])]:
            idx[clean(a)] = code
            idx.setdefault(_strip_noise(clean(a)), code)
    idx.pop("", None)
    return idx


@lru_cache
def aliases_longest_first() -> list[tuple[str, str]]:
    return sorted(_alias_index().items(), key=lambda kv: -len(kv[0]))


def match(name: str) -> tuple[str | None, float]:
    """Return (test_code, confidence) for a raw test name."""
    if not name:
        return None, 0.0
    idx = _alias_index()
    c = clean(name)
    if c in idx:
        return idx[c], 1.0
    s = _strip_noise(c)
    if s in idx:
        return idx[s], 0.95
    for alias, code in aliases_longest_first():
        if len(alias) >= 3 and re.search(rf"(^|[^a-z0-9]){re.escape(alias)}($|[^a-z0-9])", c):
            return code, 0.85
    close = get_close_matches(s or c, list(idx.keys()), n=1, cutoff=0.82)
    if close:
        ratio = SequenceMatcher(None, s or c, close[0]).ratio()
        return idx[close[0]], round(0.5 + 0.3 * ratio, 2)
    return None, 0.0
