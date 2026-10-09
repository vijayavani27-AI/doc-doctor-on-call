"""Our own 1024-dimension text embedding (no external model, ~0 MB, deterministic).

Feature hashing over: words, medical synonyms mapped to canonical test codes (so "sugar",
"HbA1c" and "glycated haemoglobin" land on the same feature), word bigrams and character
3-grams (robust to spelling like haemoglobin/hemoglobin). Signed hashing (blake2b) with
log term-frequency weights, L2-normalised, so cosine similarity = dot product. Works the same
in Python (SQLite) and in Postgres pgvector (`<=>` cosine distance).
"""
from __future__ import annotations

import hashlib
import math
import re
from functools import lru_cache

from .. import config

DIM = config.EMBED_DIM
_WORD = re.compile(r"[a-z0-9஀-௿ऀ-ॿ]+(?:[.\-][a-z0-9]+)*")
_STOP = set("a an the of in on at to for is are was were be been my me i you your it this that what how why when which do does did "
            "and or with from by about can could should would will am has have had any there their them they he she his her".split())
_TOPIC = {"sugar": "HBA1C", "diabetes": "HBA1C", "glucose": "FBG", "kidney": "CREAT", "kidneys": "CREAT", "renal": "CREAT",
          "liver": "ALT", "cholesterol": "LDL", "lipid": "LDL", "heart": "LDL", "thyroid": "TSH", "anaemia": "HB", "anemia": "HB",
          "blood": "HB", "iron": "FERRITIN", "bp": "V_BP", "pressure": "V_BP", "weight": "V_WEIGHT", "sleep": "V_SLEEP",
          "steps": "V_STEPS", "walking": "V_STEPS", "oxygen": "V_SPO2", "pulse": "V_HR", "medicine": "MEDS", "tablet": "MEDS",
          "tablets": "MEDS", "drug": "MEDS", "pill": "MEDS", "medicines": "MEDS"}


@lru_cache
def _aliases() -> list[tuple[str, str]]:
    from . import normalizer

    return [(a, c) for a, c in normalizer.aliases_longest_first() if len(a) >= 3]


def _h(feature: str) -> tuple[int, float]:
    d = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
    n = int.from_bytes(d, "little")
    return n % DIM, (1.0 if (n >> 63) & 1 else -1.0)


def features(text: str) -> dict[str, float]:
    t = (text or "").lower()
    words = [w for w in _WORD.findall(t) if w not in _STOP]
    feats: dict[str, float] = {}

    def add(f: str, w: float):
        feats[f] = feats.get(f, 0.0) + w

    for w in words:
        add("w:" + w, 1.0)
        if w in _TOPIC:
            add("c:" + _TOPIC[w], 2.0)
        if len(w) >= 5:
            padded = f"#{w}#"
            for i in range(len(padded) - 2):
                add("g:" + padded[i:i + 3], 0.25)
    for a, b in zip(words, words[1:], strict=False):
        add(f"b:{a}_{b}", 0.7)
    for alias, code in _aliases():
        if alias in t and re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", t):
            add("c:" + code, 3.0)
    return feats


def embed(text: str) -> list[float]:
    vec = [0.0] * DIM
    for f, tf in features(text).items():
        i, sign = _h(f)
        vec[i] += sign * (1.0 + math.log(tf)) if tf >= 1 else sign * tf
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=False))
