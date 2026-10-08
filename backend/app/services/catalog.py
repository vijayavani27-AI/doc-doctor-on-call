"""Loads the JSON datasets in backend/data once and exposes lookup helpers."""
import json
from functools import lru_cache

from ..config import DATA_DIR


def _load(name: str) -> dict:
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


@lru_cache
def tests() -> dict[str, dict]:
    return {t["code"]: t for t in _load("lab_tests.json")["tests"]}


@lru_cache
def panels() -> dict[str, dict]:
    return {p["code"]: p for p in _load("panels.json")["panels"]}


@lru_cache
def panel_of_test() -> dict[str, str]:
    return {code: p["code"] for p in panels().values() for code in p["tests"]}


@lru_cache
def formulas() -> dict[str, dict]:
    return {f["id"]: f for f in _load("formulas.json")["formulas"]}


@lru_cache
def medicines() -> dict:
    return _load("medicines.json")


@lru_cache
def rules() -> dict:
    return _load("rules.json")


@lru_cache
def symptoms() -> dict[str, str]:
    return {s["key"]: s["label"] for s in _load("symptoms.json")["symptoms"]}


@lru_cache
def wellness() -> dict[str, dict]:
    return _load("wellness.json")["kinds"]


def ref_range(code: str, sex: str | None) -> tuple[float | None, float | None]:
    t = tests().get(code)
    if not t:
        return None, None
    ref = t.get("ref", {})
    rng = ref.get(sex or "") or ref.get("all") or ref.get("F")
    return (rng[0], rng[1]) if rng else (None, None)
