import math

import pytest

from app.services import extraction, formulas, normalizer, pii, units


# ------------------------------------------------------------ formulas (hand-checked values)
def test_fib4_matches_published_equation():
    # (58.3 * 55) / (155 * sqrt(50)) = 2.926
    assert formulas.fib4(58.3, 55, 50, 155) == pytest.approx(2.926, abs=0.005)
    assert formulas.classify("fib4", 2.93, 58)["status"] == "red"
    assert formulas.classify("fib4", 1.1, 58)["status"] == "green"
    assert formulas.classify("fib4", 1.8, 58)["status"] == "yellow"


def test_fib4_uses_age_65_cutoff():
    # 1.6 is grey-zone under 65 but low-risk at 65+ (McPherson 2017)
    assert formulas.classify("fib4", 1.6, 50)["status"] == "yellow"
    assert formulas.classify("fib4", 1.6, 70)["status"] == "green"


@pytest.mark.parametrize("scr,age,sex,expected", [
    (0.7, 50, "F", 105.3),   # min(Scr/k,1)=1 branch
    (1.2, 60, "M", 69.2),    # matches NKF online calculator (69)
    (1.1, 58.2, "F", 58.2),
])
def test_egfr_ckd_epi_2021(scr, age, sex, expected):
    assert formulas.egfr_ckd_epi_2021(scr, age, sex) == pytest.approx(expected, abs=0.3)


def test_egfr_stages():
    assert formulas.egfr_stage(95) == "G1"
    assert formulas.egfr_stage(58) == "G3a"
    assert formulas.egfr_stage(31) == "G3b"
    assert formulas.egfr_stage(10) == "G5"


def test_mentzer_tyg_apri_corrected_calcium():
    assert formulas.mentzer(66, 5.6) == pytest.approx(11.79, abs=0.01)
    assert formulas.classify("mentzer", 11.79)["status"] == "red"
    assert formulas.tyg(150, 90) == pytest.approx(math.log(6750), abs=1e-9)
    assert formulas.apri(55, 155) == pytest.approx(0.887, abs=0.002)
    assert formulas.corrected_calcium(8.2, 3.0) == pytest.approx(9.0)
    assert formulas.classify("corr_ca", 9.0)["status"] == "green"
    assert formulas.classify("egfr", 58)["status"] == "yellow"


# ------------------------------------------------------------ unit harmonisation
@pytest.mark.parametrize("code,value,unit,expected", [
    ("PLT", 2.6, "lakhs/cumm", 260),
    ("PLT", 210, "x10^3/uL", 210),
    ("PLT", 180000, "/cumm", 180),
    ("PLT", 265, "10³/µL", 265),
    ("CREAT", 79.6, "umol/L", 0.9),
    ("FBG", 7.4, "mmol/L", 133.3),
    ("TC", 5.4, "mmol/L", 208.8),
    ("RBC", 4.3, "mill/cumm", 4.3),
    ("HBA1C", 59, "mmol/mol", 7.55),
    ("WBC", 7200, "/cumm", 7.2),
])
def test_unit_conversion(code, value, unit, expected):
    assert units.convert(code, value, unit).value == pytest.approx(expected, abs=0.1)


def test_platelet_unit_inferred_from_magnitude():
    c = units.convert("PLT", 1.55, None)
    assert c.value == pytest.approx(155) and c.confidence < 0.8


# ------------------------------------------------------------ test-name normaliser
@pytest.mark.parametrize("raw,code", [
    ("SGPT (ALT)", "ALT"), ("S.G.O.T", "AST"), ("Serum Creatinine", "CREAT"), ("Glycosylated Hemoglobin", "HBA1C"),
    ("HDL Cholesterol", "HDL"), ("Total Cholesterol", "TC"), ("Platelet Count", "PLT"), ("Glucose Fasting", "FBG"),
    ("Total Leucocyte Count", "WBC"), ("Haemoglobin", "HB"), ("HbA1c (Glycated Haemoglobin)", "HBA1C"),
])
def test_normaliser(raw, code):
    assert normalizer.match(raw)[0] == code


# ------------------------------------------------------------ offline report parser
SAMPLE = """Sunrise Diagnostics
Patient Name : Mrs. Lakshmi R     Age/Sex : 58 Y / F
Mobile No : 9876543210     UHID : SD-2026-11873
Collected On : 05-Oct-2026
Test Name   Result   Unit   Bio. Ref. Interval
SGOT (AST)   58   U/L   0 - 40
Platelet Count   1.55   lakhs/cumm   1.5 - 4.1
HbA1c   7.4   %   4.0 - 5.6
HDL Cholesterol   42 L  mg/dL   > 50
"""


def test_parse_text_reads_values_units_ranges_and_date():
    d = extraction.parse_text(SAMPLE)
    by = {extraction.finalize_test(t, "F").test_code: t for t in d.tests}
    assert d.report_date.isoformat() == "2026-10-05"
    assert d.lab_name == "Sunrise Diagnostics"
    assert by["AST"].value == 58 and by["AST"].ref_high == 40
    assert by["PLT"].value == pytest.approx(155) and by["PLT"].ref_low == pytest.approx(150)
    assert by["HBA1C"].value == 7.4
    assert by["HDL"].value == 42 and by["HDL"].ref_low == 50


def test_dates():
    assert extraction.parse_date("Reported: 03/04/2025").isoformat() == "2025-04-03"  # Indian DD/MM
    assert extraction.parse_date("2026-05-18").isoformat() == "2026-05-18"
    assert extraction.parse_date("12 Mar 2026").isoformat() == "2026-03-12"


def test_pii_redaction_keeps_medical_data():
    red, n = pii.redact(SAMPLE)
    assert "Lakshmi" not in red and "9876543210" not in red and "SD-2026-11873" not in red
    assert "Platelet Count   1.55" in red and "58 Y / F" in red and n >= 3


def test_medicine_matching():
    gids, cls, conf = extraction.match_medicine("Tab. Glycomet 500")
    assert gids == ["metformin"] and cls == "biguanide" and conf == 1.0
    gids, cls, _ = extraction.match_medicine("Zerodol-P")
    assert "aceclofenac" in gids and cls == "nsaid"
