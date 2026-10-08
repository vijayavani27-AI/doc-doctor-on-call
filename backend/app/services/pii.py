"""Removes personal identifiers from report text before it is sent to the AI.

The AI only needs test names, values, units, ranges and dates - never the patient's name,
phone number, address or ID numbers.
"""
import re

_PATTERNS = [
    # labelled fields: "Patient Name : Mrs. Lakshmi R", "Mobile No: 98xxxxxx", "UHID: 123"
    # (the label must start a line or a column, so "Test Name" headers are left alone)
    (re.compile(r"(?im)(^|\s{2,}|\|)\s*(patient\s*name|name\s+of\s+patient|pt\.?\s*name|name|father'?s?\s*name|husband'?s?\s*name|guardian)\s*[:\-]\s*([^\n|]+?)(?=\s{2,}|\||$)"), r"\1\2: [NAME]"),
    (re.compile(r"(?im)\b(mobile|phone|ph|contact|tel)(\s*no\.?)?\s*[:\-]?\s*(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b"), r"\1: [PHONE]"),
    (re.compile(r"(?im)\b(uhid|mrn|patient\s*id|pid|reg(istration)?\.?\s*no\.?|lab\s*no\.?|sample\s*id|abha(\s*(no|number|id))?)\s*[:\-]?\s*[A-Za-z0-9\-/]{3,}"), r"\1: [ID]"),
    (re.compile(r"(?im)(^|\s{2,}|\|)\s*(address)\s*[:\-]\s*([^\n|]+?)(?=\s{2,}|\||$)"), r"\1\2: [ADDRESS]"),
    (re.compile(r"\b(\+?91[\s-]?)?[6-9]\d{9}\b"), "[PHONE]"),
    (re.compile(r"\b\d{4}\s\d{4}\s\d{4}\b"), "[AADHAAR]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[EMAIL]"),
]


def redact(text: str) -> tuple[str, int]:
    count = 0
    for pattern, repl in _PATTERNS:
        text, n = pattern.subn(repl, text)
        count += n
    return text, count
