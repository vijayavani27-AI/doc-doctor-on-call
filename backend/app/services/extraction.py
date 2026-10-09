"""Report reading: PDF / photo -> structured draft (tests + medicines) for the user to confirm.

Two paths, same output:
1. Claude (vision / text) with a strict JSON schema - used when AI is configured.
   Text PDFs are PII-redacted first and sent as text; scans and photos are sent as images.
2. Offline rule-based parser for text PDFs - works with no API key.

Both paths then go through the same normaliser (test name -> canonical code) and unit
converter, and every value keeps its confidence and the exact source line.
"""
from __future__ import annotations

import base64
import io
import re
from dataclasses import dataclass, field
from datetime import date
from difflib import get_close_matches

from . import ai, catalog, normalizer, pii, units
from . import diagnoses as dx

# ---------------------------------------------------------------- output types


@dataclass
class DraftTest:
    test_name_raw: str
    value_raw: str
    unit_raw: str | None
    ref_raw: str | None = None
    source_text: str | None = None
    confidence: float = 0.8
    test_code: str | None = None
    value: float | None = None
    unit: str | None = None
    ref_low: float | None = None
    ref_high: float | None = None
    note: str | None = None


@dataclass
class DraftMed:
    brand: str
    generic: str | None = None
    dose: str | None = None
    frequency: str | None = None
    duration: str | None = None
    source_text: str | None = None
    confidence: float = 0.8
    generics: list[str] = field(default_factory=list)
    drug_class: str | None = None


@dataclass
class Draft:
    kind: str = "lab"
    lab_name: str | None = None
    doctor_name: str | None = None
    report_date: date | None = None
    tests: list[DraftTest] = field(default_factory=list)
    medicines: list[DraftMed] = field(default_factory=list)
    method: str = "text-parser"
    warnings: list[str] = field(default_factory=list)
    redactions: int = 0
    pages: int | None = None
    reader: str | None = None  # pdf-text / ocr / text / none
    text: str | None = None
    diagnoses: list = field(default_factory=list)  # list[diagnoses.DraftDiagnosis]
    admission_date: date | None = None
    discharge_date: date | None = None


# ---------------------------------------------------------------- helpers
_MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
_DATE_PATTERNS = [
    (re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b"), "ymd"),
    (re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b"), "dmy"),
    (re.compile(r"\b(\d{1,2})[\s\-/]([A-Za-z]{3,9})[\s\-/,]+(\d{4})\b"), "dMy"),
    (re.compile(r"\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b"), "Mdy"),
]


def parse_date(s: str | None) -> date | None:
    if not s:
        return None
    for pat, kind in _DATE_PATTERNS:
        m = pat.search(s)
        if not m:
            continue
        try:
            if kind == "ymd":
                return date(int(m[1]), int(m[2]), int(m[3]))
            if kind == "dmy":  # Indian reports use day first
                return date(int(m[3]), int(m[2]), int(m[1]))
            if kind == "dMy":
                return date(int(m[3]), _MONTHS[m[2][:3].lower()], int(m[1]))
            if kind == "Mdy":
                return date(int(m[3]), _MONTHS[m[1][:3].lower()], int(m[2]))
        except (KeyError, ValueError):
            continue
    return None


def parse_number(s: str | None) -> float | None:
    if s is None:
        return None
    s = re.sub(r"(?<=\d),(?=\d{2,3}(?!\d))", "", str(s))  # 2,50,000 / 250,000 -> 250000
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else None


def parse_range(s: str | None) -> tuple[float | None, float | None]:
    if not s:
        return None, None
    s = s.replace("–", "-").replace("—", "-")
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)", s)
    if m:
        return float(m[1]), float(m[2])
    m = re.search(r"(<|<=|≤|upto|up to|less than)\s*(\d+(?:\.\d+)?)", s, re.I)
    if m:
        return None, float(m[2])
    m = re.search(r"(>|>=|≥|more than|greater than)\s*(\d+(?:\.\d+)?)", s, re.I)
    if m:
        return float(m[2]), None
    return None, None


def finalize_test(t: DraftTest, sex: str | None, force_code: str | None = None) -> DraftTest:
    if force_code and force_code in catalog.tests():
        code, name_conf = force_code, 1.0  # user picked the test in the review screen
    else:
        code, name_conf = normalizer.match(t.test_name_raw)
    t.test_code = code
    raw_value = parse_number(t.value_raw)
    if code is None or raw_value is None:
        t.confidence = min(t.confidence, 0.4)
        t.note = "test not recognised" if code is None else "value could not be read"
        t.value = raw_value
        t.unit = t.unit_raw
        return t
    conv = units.convert(code, raw_value, t.unit_raw)
    t.value, t.unit = conv.value, conv.unit
    lo, hi = parse_range(t.ref_raw)
    if lo is not None or hi is not None:
        t.ref_low, t.ref_high = units.convert_ref(code, lo, hi, t.unit_raw)
    else:
        t.ref_low, t.ref_high = catalog.ref_range(code, sex)
    t.confidence = round(min(t.confidence, name_conf, conv.confidence), 2)
    t.note = conv.note
    return t


# ---------------------------------------------------------------- medicine matching
@dataclass
class _BrandIndex:
    names: dict[str, dict]


_brand_index: _BrandIndex | None = None


def _brands() -> _BrandIndex:
    global _brand_index
    if _brand_index is None:
        idx = {}
        for b in catalog.medicines()["brands"]:
            idx[_clean_brand(b["brand"])] = b
        _brand_index = _BrandIndex(idx)
    return _brand_index


def _clean_brand(s: str) -> str:
    s = s.lower()
    s = re.sub(r"^\s*(tab|tablet|cap|capsule|syp|syrup|inj|t\.|c\.)\.?\s+", "", s)
    return re.sub(r"[^a-z0-9/+ ]", "", s).strip()


def match_medicine(brand: str, generic_hint: str | None = None) -> tuple[list[str], str | None, float]:
    """Return (generic ids, drug class, confidence) for a brand or generic name."""
    gens = catalog.medicines()["generics"]
    idx = _brands().names
    c = _clean_brand(brand)
    hit = idx.get(c)
    conf = 1.0
    if hit is None:
        # brand without strength ("Glycomet" -> "Glycomet 500"), then fuzzy
        cands = [k for k in idx if k.split(" ")[0] == c.split(" ")[0]] if c else []
        if cands:
            hit, conf = idx[cands[0]], 0.85
        else:
            close = get_close_matches(c, list(idx), n=1, cutoff=0.8)
            if close:
                hit, conf = idx[close[0]], 0.7
    if hit:
        g = hit["generics"]
        return g, gens[g[0]]["class"] if g and g[0] in gens else None, conf
    text = f"{brand} {generic_hint or ''}".lower()
    found = [gid for gid, gd in gens.items() if gid in text or gd["name"].lower().split(" ")[0] in text]
    if found:
        return found, gens[found[0]]["class"], 0.75
    return [], None, 0.4


def finalize_med(m: DraftMed) -> DraftMed:
    gids, cls, conf = match_medicine(m.brand, m.generic)
    m.generics, m.drug_class = gids, cls
    if gids and not m.generic:
        gens = catalog.medicines()["generics"]
        m.generic = " + ".join(gens[g]["name"] for g in gids if g in gens)
    m.confidence = round(min(m.confidence, conf), 2)
    return m


# ---------------------------------------------------------------- offline text parser
_FLAG_TOKENS = {"h", "l", "high", "low", "*", "**", "(h)", "(l)", "↑", "↓", "a", "abnormal"}


def _lab_line(line: str) -> DraftTest | None:
    low = normalizer.clean(line)
    if len(low) < 3:
        return None
    body = re.sub(r"^[\W\d]{0,4}", "", low)  # bullets / serial numbers
    for alias, _code in normalizer.aliases_longest_first():
        if not body.startswith(alias):
            continue
        rest_start = len(alias)
        if rest_start < len(body) and body[rest_start].isalnum():
            continue  # partial word ("hb" in "hba1c")
        offset = low.find(body) + rest_start
        rest = line[offset:]
        m = re.search(r"[<>]?\s*\d+(?:\.\d+)?", rest)
        if not m:
            return None
        value_raw = m.group(0).strip()
        after = rest[m.end():]
        tokens = after.split()
        unit = None
        consumed = 0
        for i, tok in enumerate(tokens[:3]):
            if tok.lower() in _FLAG_TOKENS:
                consumed = i + 1
                continue
            if re.search(r"[A-Za-z%µμ]", tok) or tok.startswith(("x10", "10^", "×10")):
                unit = tok
                consumed = i + 1
            break
        ref_part = " ".join(tokens[consumed:])
        return DraftTest(test_name_raw=line[:offset].strip(" :\t-") or alias, value_raw=value_raw, unit_raw=unit,
                         ref_raw=ref_part or None, source_text=line.strip(), confidence=0.9)
    return None


_FREQ = re.compile(r"\b([0-2½](?:\s*-\s*[0-2½]){2}|od|bd|tds|tid|qid|hs|sos|once daily|twice daily|thrice daily|at night|morning)\b", re.I)
_DUR = re.compile(r"(?:x|for)\s*(\d+\s*(?:days?|weeks?|months?))|\b(\d+\s*(?:days?|weeks?|months?))\b", re.I)
_DOSE = re.compile(r"\b(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu))\b", re.I)


def _med_line(line: str) -> DraftMed | None:
    s = line.strip()
    if not s:
        return None
    looks_like_rx = re.match(r"^\s*(\d+[.)]\s*)?(tab|tablet|cap|capsule|syp|syrup|inj)\b\.?", s, re.I)
    name_part = re.split(r"\s{2,}|\s-\s|\t|,", re.sub(r"^\s*\d+[.)]\s*", "", s))[0]
    gids, cls, conf = match_medicine(name_part)
    if not gids and not looks_like_rx:
        return None
    brand = re.sub(r"^\s*(tab|tablet|cap|capsule|syp|syrup|inj)\.?\s+", "", name_part, flags=re.I).strip()
    freq = _FREQ.search(s)
    dur = _DUR.search(s)
    dose = _DOSE.search(s)
    return DraftMed(brand=brand, frequency=freq.group(1) if freq else None,
                    duration=(dur.group(1) or dur.group(2)) if dur else None, dose=dose.group(1) if dose else None,
                    source_text=s, confidence=0.85 if gids else 0.5)


def _header_fields(text: str, d: Draft):
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines[:6]:
        if re.search(r"diagnostic|laborator|\blabs?\b|pathology|clinic|hospital|health|medical centre|medical center", ln, re.I):
            d.lab_name = re.sub(r"\s{2,}.*", "", ln)[:150]
            break
    if not d.lab_name and lines:
        d.lab_name = lines[0][:150]
    for ln in lines[:25]:
        if re.search(r"(report(ed)?|collect(ed|ion)|sample|visit)?\s*(date|on)\b", ln, re.I):
            dt = parse_date(ln)
            if dt:
                d.report_date = dt
                break
    if not d.report_date:
        d.report_date = parse_date(text)
    doc = re.search(r"\b(Dr\.? ?[A-Z][A-Za-z.]*(?: [A-Z][A-Za-z.]*){0,2})", text)
    if doc:
        d.doctor_name = doc.group(1)


def parse_text(text: str, kind_hint: str | None = None) -> Draft:
    d = Draft(method="text-parser")
    _header_fields(text, d)
    for line in text.splitlines():
        t = _lab_line(line)
        if t:
            d.tests.append(t)
    if kind_hint == "prescription" or not d.tests or re.search(r"\b(rx|℞|prescription|tab\.?\s)", text, re.I):
        for line in text.splitlines():
            if _lab_line(line):
                continue
            m = _med_line(line)
            if m:
                d.medicines.append(m)
    d.kind = "prescription" if d.medicines and len(d.medicines) >= len(d.tests) else "lab"
    d.diagnoses = dx.extract(text)
    if kind_hint == "discharge" or dx.is_discharge(text):
        d.kind = "discharge"
        d.admission_date, d.discharge_date = dx.admission_dates(text, parse_date)
        if d.discharge_date:
            d.report_date = d.discharge_date
        if not d.medicines:  # discharge medicines are often written without "Tab."
            for line in text.splitlines():
                if not _lab_line(line):
                    m = _med_line(line)
                    if m:
                        d.medicines.append(m)
    return d


# ---------------------------------------------------------------- Claude path
_SCHEMA = {
    "type": "object",
    "properties": {
        "report_type": {"type": "string", "enum": ["lab", "prescription", "discharge", "other"]},
        "admission_date": {"type": "string", "description": "Discharge summaries only: date of admission YYYY-MM-DD, else empty string."},
        "discharge_date": {"type": "string", "description": "Discharge summaries only: date of discharge YYYY-MM-DD, else empty string."},
        "diagnoses": {"type": "array", "description": "Diagnoses exactly as written (final/provisional diagnosis, impression, Dx, K/C/O history). Empty if none.", "items": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Diagnosis as written, expanded if an abbreviation is certain (e.g. 'T2DM' -> 'Type 2 diabetes mellitus')"},
                "status": {"type": "string", "enum": ["active", "history"], "description": "history for K/C/O / past history items"},
                "source_text": {"type": "string"},
                "confidence": {"type": "number"},
            },
            "required": ["name", "status", "source_text", "confidence"],
            "additionalProperties": False,
        }},
        "lab_name": {"type": "string", "description": "Lab, clinic or hospital name. Empty string if not printed."},
        "doctor_name": {"type": "string", "description": "Doctor name if printed, else empty string."},
        "report_date": {"type": "string", "description": "Sample collection or report date as YYYY-MM-DD; empty string if absent."},
        "tests": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Test name exactly as printed"},
                "value": {"type": "string", "description": "Result exactly as printed, e.g. '1.55' or '< 5'"},
                "unit": {"type": "string", "description": "Unit as printed, empty string if none"},
                "ref_range": {"type": "string", "description": "Reference range as printed, empty string if none"},
                "source_text": {"type": "string", "description": "The full printed line or row this came from"},
                "confidence": {"type": "number", "description": "0-1: how sure you are this was read correctly (handwriting, blur, cut-off text lower it)"},
            },
            "required": ["name", "value", "unit", "ref_range", "source_text", "confidence"],
            "additionalProperties": False,
        }},
        "medicines": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "brand": {"type": "string", "description": "Medicine name as written (brand), without Tab./Cap."},
                "generic": {"type": "string", "description": "Generic / salt if written; else empty string"},
                "dose": {"type": "string"},
                "frequency": {"type": "string", "description": "e.g. 1-0-1, OD, BD, at night"},
                "duration": {"type": "string"},
                "source_text": {"type": "string"},
                "confidence": {"type": "number"},
            },
            "required": ["brand", "generic", "dose", "frequency", "duration", "source_text", "confidence"],
            "additionalProperties": False,
        }},
    },
    "required": ["report_type", "admission_date", "discharge_date", "diagnoses", "lab_name", "doctor_name", "report_date", "tests", "medicines"],
    "additionalProperties": False,
}

_SYSTEM = """You read Indian medical documents (lab reports, prescriptions, discharge summaries; printed or handwritten; English, Tamil, Hindi or mixed) and transcribe them into JSON.

Rules:
- Transcribe only what is printed or written. Never guess, infer, or calculate a value that is not on the page.
- Copy values, units and reference ranges exactly as printed (e.g. platelets '1.55' with unit 'lakhs/cumm').
- For every item include the exact source line, and a confidence from 0 to 1. Lower confidence for handwriting, blur, or ambiguous digits - the user will be asked to confirm anything below 0.8.
- Skip personal identifiers (patient name, phone, address, ID numbers); they are not needed.
- Use DD/MM order when reading Indian dates like 03/04/2025 (3 April 2025).
- Handwritten prescriptions: read each medicine line with dose and frequency (e.g. 1-0-1, BD, HS). If a word is unclear, give your best reading with a LOW confidence instead of skipping it.
- Tamil or Hindi text: keep medicine and test names in English as written; translate nothing else.
- Diagnoses: copy them as written; never add a diagnosis that is not on the page."""


def _from_ai(data: dict) -> Draft:
    d = Draft(method="ai")
    d.kind = data.get("report_type") if data.get("report_type") in ("lab", "prescription", "discharge") else "lab"
    d.admission_date = parse_date(data.get("admission_date"))
    d.discharge_date = parse_date(data.get("discharge_date"))
    for g in data.get("diagnoses", []):
        d.diagnoses.append(dx.DraftDiagnosis(name_raw=g["name"], status=g.get("status") or "active", source_text=g.get("source_text"),
                                             confidence=float(g.get("confidence", 0.8))))
    d.lab_name = data.get("lab_name") or None
    d.doctor_name = data.get("doctor_name") or None
    d.report_date = parse_date(data.get("report_date"))
    for t in data.get("tests", []):
        d.tests.append(DraftTest(test_name_raw=t["name"], value_raw=t["value"], unit_raw=t.get("unit") or None,
                                 ref_raw=t.get("ref_range") or None, source_text=t.get("source_text"),
                                 confidence=float(t.get("confidence", 0.8))))
    for m in data.get("medicines", []):
        d.medicines.append(DraftMed(brand=m["brand"], generic=m.get("generic") or None, dose=m.get("dose") or None,
                                    frequency=m.get("frequency") or None, duration=m.get("duration") or None,
                                    source_text=m.get("source_text"), confidence=float(m.get("confidence", 0.8))))
    return d


def pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        return ""


def _quality(d: Draft | None) -> tuple[int, float]:
    if d is None:
        return 0, 0.0
    items = [t.confidence for t in d.tests] + [m.confidence for m in d.medicines] + [g.confidence for g in d.diagnoses]
    return len(items), (sum(items) / len(items) if items else 0.0)


def extract(data: bytes, mime: str, sex: str | None = None, kind_hint: str | None = None) -> Draft:
    """Own models first (PDF text layer / Tesseract OCR -> dictionary NER parser). The AI is only an
    optional boost when our own reading is weak (scanned photo, very few or low-confidence items)."""
    from . import ocr

    doc = ocr.read_document(data, mime)
    text = doc["text"]
    has_text = len(text.strip()) > 40

    own: Draft | None = None
    if has_text:
        own = parse_text(text, kind_hint)
        if doc["method"] == "ocr":  # OCR can misread digits: lower confidence so these go to the review list
            own.method = "ocr+parser"
            for t in own.tests:
                t.confidence = round(min(t.confidence, 0.9) * max(0.6, min(1.0, doc["confidence"] + 0.1)), 2)
            for m in own.medicines:
                m.confidence = round(min(m.confidence, 0.85) * max(0.6, min(1.0, doc["confidence"] + 0.1)), 2)
    n_own, conf_own = _quality(own)
    weak = n_own < (1 if own is not None and own.kind == "prescription" else 2) or conf_own < 0.75 or doc["method"] in ("ocr", "none")

    draft: Draft | None = None
    redactions = 0
    if ai.enabled() and weak:
        content: list[dict] | None = None
        if has_text and doc["method"] != "ocr":
            red, redactions = pii.redact(text)
            content = [{"type": "text", "text": f"Medical document text (personal identifiers removed):\n\n{red}"},
                       {"type": "text", "text": "Transcribe this document into the JSON schema."}]
        elif mime in ("image/jpeg", "image/png", "image/webp", "image/gif") or mime == "application/pdf":
            from .. import config

            if config.AI_SEND_IMAGES:
                b64 = base64.standard_b64encode(data).decode()
                block = ({"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}}
                         if mime == "application/pdf" else
                         {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}})
                content = [block, {"type": "text", "text": "Transcribe this medical document into the JSON schema."}]
        if content:
            result = ai.structured(_SYSTEM, content, _SCHEMA, effort="medium")
            if result:
                boosted = _from_ai(result)
                if _quality(boosted)[0] >= n_own:
                    draft = boosted
                    draft.method = ai.last_engine or "ai"
    if draft is None:
        if own is not None:
            draft = own
        else:
            draft = Draft(method="manual")
            draft.warnings.append("We couldn't read text from this file. Please type the values in the review table.")
    draft.redactions = redactions
    draft.pages = doc["pages"]
    draft.reader = doc["method"]
    draft.text = text[:20000] if text else None
    if kind_hint in ("lab", "prescription") and not (draft.tests and draft.medicines):
        draft.kind = kind_hint if not (kind_hint == "lab" and draft.medicines and not draft.tests) else draft.kind
    draft.tests = [finalize_test(t, sex) for t in draft.tests]
    draft.diagnoses = [dx.finalize(g) for g in draft.diagnoses]
    draft.medicines = [finalize_med(m) for m in draft.medicines]
    if not draft.report_date:
        draft.warnings.append("Report date not found. Please set it before saving.")
    low = sum(1 for t in draft.tests if t.confidence < 0.75) + sum(1 for m in draft.medicines if m.confidence < 0.75)
    if low:
        draft.warnings.append(f"{low} item(s) need your confirmation (highlighted).")
    return draft

