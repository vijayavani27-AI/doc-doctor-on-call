"""Diagnosis extraction for discharge summaries and prescriptions (our own rules + dictionary, no AI).

Looks only inside diagnosis sections ("Final diagnosis:", "Diagnosis:", "Impression:", "Dx:") and
"K/C/O ..." (known case of) history lines, splits them into items and maps each to ICD-10 + SNOMED CT
with data/diagnoses.json. Unknown items are kept with low confidence so the person can review them.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from functools import lru_cache

from .. import config


@dataclass
class DraftDiagnosis:
    name_raw: str
    key: str | None = None
    name: str | None = None
    icd10: str | None = None
    snomed: str | None = None
    condition: str | None = None
    status: str = "active"  # active / history
    source_text: str | None = None
    confidence: float = 0.6


@lru_cache
def catalog() -> dict[str, dict]:
    data = json.loads((config.DATA_DIR / "diagnoses.json").read_text(encoding="utf-8"))
    return {d["key"]: d for d in data["items"]}


@lru_cache
def _aliases() -> list[tuple[str, str]]:
    out = []
    for key, d in catalog().items():
        for a in {d["name"].lower(), *d["aliases"]}:
            out.append((a.lower(), key))
    return sorted(out, key=lambda x: -len(x[0]))


def match(text: str) -> tuple[str | None, float]:
    t = re.sub(r"\s+", " ", text.lower()).strip(" .:-")
    for alias, key in _aliases():
        if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", t):
            return key, 0.95 if len(alias) > 4 else 0.85
    return None, 0.0


def finalize(d: DraftDiagnosis) -> DraftDiagnosis:
    key, conf = match(d.name_raw) if not d.key else (d.key, max(d.confidence, 0.9))
    if key and key in catalog():
        c = catalog()[key]
        d.key, d.name, d.icd10, d.snomed, d.condition = key, c["name"], c["icd10"], c["snomed"], c.get("condition")
        d.confidence = round(min(max(d.confidence, conf), 1.0), 2)
    else:
        d.name = d.name or d.name_raw.strip().rstrip(".")[:160]
        d.confidence = min(d.confidence, 0.6)
    return d


_SECTION = re.compile(r"^\s*(?:\d+[.)]\s*)?((?:final|provisional|discharge|primary|secondary|principal|working|clinical)\s+)?(diagnosis|diagnoses|impression|dx)\b\s*[:\-–]?\s*(.*)$", re.I)
_KCO = re.compile(r"\b(?:k/c/o|kco|known case of|known c/o|h/o|history of|old case of)\b\s*[:\-]?\s*(.+)", re.I)
_STOP = re.compile(r"^\s*(k/c/o|kco|known case|h/o|history|presenting|chief complaint|c/o|complaints?|examination|o/e|investigations?|course|treatment|procedure|medications?|"
                   r"drugs?|advice|follow[- ]?up|discharge (medication|advice|condition)|condition at discharge|rx\b|tab\b|cap\b|inj\b|"
                   r"date of|doa|dod|signature|consultant|dr\.)", re.I)
_SPLIT = re.compile(r"\s*(?:,|;|/(?![a-z]/)|\band\b|\bwith\b|\bw/\b|\+|\s\d+[.)]\s|^\d+[.)]\s|•|·)\s*", re.I)


def _items(chunk: str) -> list[str]:
    parts = [p.strip(" .:-–()") for p in _SPLIT.split(chunk) if p and p.strip(" .:-–()")]
    return [p for p in parts if 2 <= len(p) <= 120 and not re.fullmatch(r"[\d\s./-]+", p)]


def extract(text: str) -> list[DraftDiagnosis]:
    lines = [ln.rstrip() for ln in (text or "").splitlines()]
    found: list[DraftDiagnosis] = []
    i = 0
    while i < len(lines):
        m = _SECTION.match(lines[i])
        if m:
            body = [m.group(3)] if m.group(3) else []
            j = i + 1
            while j < len(lines) and lines[j].strip() and not _STOP.match(lines[j]) and not _SECTION.match(lines[j]) and len(body) < 8:
                body.append(lines[j].strip())
                j += 1
            for b in body:
                for item in _items(b):
                    found.append(finalize(DraftDiagnosis(name_raw=item, source_text=lines[i].strip() if b == m.group(3) else b, confidence=0.7)))
            i = j
            continue
        k = _KCO.search(lines[i])
        if k:
            for item in _items(k.group(1)):
                d = finalize(DraftDiagnosis(name_raw=item, status="history", source_text=lines[i].strip(), confidence=0.7))
                if d.key:  # only known conditions from K/C/O lines (they are often abbreviations)
                    found.append(d)
        i += 1
    seen, out = set(), []
    for d in found:
        k = d.key or d.name.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(d)
    return out[:15]


_DOA = re.compile(r"\b(?:date of admission|admission date|admitted on|d\.?o\.?a\.?)\b\s*[:\-]?\s*(.+)", re.I)
_DOD = re.compile(r"\b(?:date of discharge|discharge date|discharged on|d\.?o\.?d\.?)\b\s*[:\-]?\s*(.+)", re.I)


def is_discharge(text: str) -> bool:
    t = text or ""
    return bool(re.search(r"discharge summary|date of discharge|discharged on|\bdod\b|course in (the )?hospital", t, re.I))


def admission_dates(text: str, parse_date) -> tuple[date | None, date | None]:
    doa = dod = None
    for ln in (text or "").splitlines():
        if doa is None and (m := _DOA.search(ln)):
            doa = parse_date(m.group(1))
        if dod is None and (m := _DOD.search(ln)):
            dod = parse_date(m.group(1))
    return doa, dod
