"""Validated clinical formulas. Plain deterministic code - the AI never does this maths.

Every function takes canonical units (see data/lab_tests.json):
AST/ALT U/L, platelets 10^9/L, MCV fL, RBC 10^12/L, lipids & glucose mg/dL,
creatinine mg/dL, calcium mg/dL, albumin g/dL.
"""
import math

from . import catalog


def fib4(age: float, ast: float, alt: float, plt: float) -> float:
    """Sterling 2006: (age x AST) / (platelets x sqrt(ALT))."""
    return (age * ast) / (plt * math.sqrt(alt))


def apri(ast: float, plt: float, ast_uln: float = 40.0) -> float:
    """Wai 2003: ((AST / ULN) x 100) / platelets."""
    return ((ast / ast_uln) * 100.0) / plt


def mentzer(mcv: float, rbc: float) -> float:
    """Mentzer 1973: MCV / RBC count."""
    return mcv / rbc


def tyg(tg: float, fbg: float) -> float:
    """Simental-Mendia 2008: ln(TG [mg/dL] x FPG [mg/dL] / 2)."""
    return math.log(tg * fbg / 2.0)


def tg_hdl(tg: float, hdl: float) -> float:
    return tg / hdl


def non_hdl(tc: float, hdl: float) -> float:
    return tc - hdl


def corrected_calcium(ca: float, alb: float) -> float:
    """Payne 1973: Ca + 0.8 x (4 - albumin)."""
    return ca + 0.8 * (4.0 - alb)


def egfr_ckd_epi_2021(scr: float, age: float, sex: str) -> float:
    """Inker 2021 (race-free CKD-EPI creatinine equation), mL/min/1.73m2."""
    female = sex.upper() == "F"
    kappa = 0.7 if female else 0.9
    alpha = -0.241 if female else -0.302
    ratio = scr / kappa
    value = 142 * (min(ratio, 1) ** alpha) * (max(ratio, 1) ** -1.200) * (0.9938 ** age)
    if female:
        value *= 1.012
    return value


def egfr_stage(egfr: float) -> str:
    for limit, stage in ((90, "G1"), (60, "G2"), (45, "G3a"), (30, "G3b"), (15, "G4")):
        if egfr >= limit:
            return stage
    return "G5"


def classify(formula_id: str, value: float, age: float | None = None) -> dict:
    """Map a score to its band (status green/yellow/red + label + text) from formulas.json."""
    meta = catalog.formulas()[formula_id]
    bands = meta["bands"]
    if formula_id == "fib4" and age is not None and age >= 65:
        # McPherson 2017: low cut-off of 2.0 for age >= 65
        bands = [dict(bands[0], max=2.0), bands[1], bands[2]]
    if formula_id == "egfr":
        for b in bands:
            if b["min"] is None or value >= b["min"]:
                return b
    if formula_id == "corr_ca":
        lo, hi = bands[0]["range"]
        return bands[0] if lo <= value <= hi else bands[1]
    for b in bands:
        if b.get("max") is None or value < b["max"]:
            return b
    return bands[-1]
