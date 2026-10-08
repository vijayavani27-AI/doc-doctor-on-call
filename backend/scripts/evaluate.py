"""Reproducible evaluation of the DOC pipeline (offline mode, no API key needed).

1. Report reading: generates synthetic lab reports with randomised Indian lab styles
   (test-name aliases, unit systems, column spacing, H/L flags, date formats), renders them
   to PDF, runs the real upload pipeline (PDF text -> parser -> normaliser -> unit converter)
   and scores every value against ground truth.
2. Formula engine: checks every formula against hand-calculated reference values.

Run from backend/:  python scripts/evaluate.py [n_reports]
"""
import random
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fpdf import FPDF  # noqa: E402

from app.services import extraction, formulas  # noqa: E402

# (code, aliases as printed by different labs, [(unit as printed, factor from canonical)], canonical range)
TESTS = [
    ("HB", ["Haemoglobin", "Hemoglobin", "Hb", "HGB"], [("g/dL", 1), ("gm/dL", 1), ("g/L", 10)], (8, 17)),
    ("RBC", ["RBC Count", "Total RBC Count", "Red Blood Cell Count"], [("million/cumm", 1), ("x10^6/uL", 1), ("10^12/L", 1)], (3.5, 6.2)),
    ("MCV", ["MCV", "Mean Corpuscular Volume"], [("fL", 1)], (60, 100)),
    ("PLT", ["Platelet Count", "Platelets", "PLT"], [("lakhs/cumm", 0.01), ("x10^3/uL", 1), ("/cumm", 1000), ("10^9/L", 1)], (90, 420)),
    ("WBC", ["Total WBC Count", "TLC", "Total Leucocyte Count"], [("cells/cumm", 1000), ("x10^3/uL", 1)], (3, 14)),
    ("AST", ["SGOT (AST)", "AST", "S.G.O.T", "Aspartate Aminotransferase"], [("U/L", 1), ("IU/L", 1)], (12, 90)),
    ("ALT", ["SGPT (ALT)", "ALT", "S.G.P.T", "Alanine Aminotransferase"], [("U/L", 1), ("IU/L", 1)], (10, 95)),
    ("ALB", ["Serum Albumin", "Albumin"], [("g/dL", 1), ("g/L", 10)], (3.0, 5.0)),
    ("CREAT", ["Serum Creatinine", "Creatinine", "S. Creatinine"], [("mg/dL", 1), ("umol/L", 88.4)], (0.5, 2.2)),
    ("UREA", ["Blood Urea", "Urea"], [("mg/dL", 1)], (12, 60)),
    ("K", ["Serum Potassium", "Potassium"], [("mmol/L", 1), ("mEq/L", 1)], (3.3, 5.8)),
    ("NA", ["Serum Sodium", "Sodium"], [("mmol/L", 1), ("mEq/L", 1)], (130, 147)),
    ("FBG", ["Fasting Blood Sugar", "Glucose Fasting", "FBS", "Fasting Plasma Glucose"], [("mg/dL", 1), ("mmol/L", 1 / 18.016)], (75, 220)),
    ("HBA1C", ["HbA1c", "Glycated Haemoglobin", "Glycosylated Hemoglobin", "HbA1c (Glycated Haemoglobin)"], [("%", 1)], (4.8, 11)),
    ("TC", ["Total Cholesterol", "Cholesterol Total", "Serum Cholesterol"], [("mg/dL", 1), ("mmol/L", 1 / 38.67)], (130, 280)),
    ("HDL", ["HDL Cholesterol", "HDL", "HDL-C"], [("mg/dL", 1), ("mmol/L", 1 / 38.67)], (28, 80)),
    ("LDL", ["LDL Cholesterol", "LDL", "LDL-C"], [("mg/dL", 1), ("mmol/L", 1 / 38.67)], (60, 190)),
    ("TG", ["Triglycerides", "Serum Triglycerides", "TG"], [("mg/dL", 1), ("mmol/L", 1 / 88.57)], (70, 400)),
    ("TSH", ["TSH", "Thyroid Stimulating Hormone", "TSH (Ultrasensitive)"], [("uIU/mL", 1), ("mIU/L", 1)], (0.3, 9)),
    ("B12", ["Vitamin B12", "Vit B12"], [("pg/mL", 1)], (120, 900)),
]
LABS = ["Sunrise Diagnostics", "GreenLeaf Labs", "CityCare Pathology", "Lotus Health Lab", "Metro Path Labs"]
DATE_STYLES = [lambda d: d.strftime("%d-%b-%Y"), lambda d: d.strftime("%d/%m/%Y"), lambda d: d.strftime("%Y-%m-%d"), lambda d: d.strftime("%d %B %Y")]


def make_report(rng: random.Random):
    d = date(2023, 1, 1) + timedelta(days=rng.randint(0, 1300))
    chosen = rng.sample(TESTS, rng.randint(5, 10))
    rows, truth = [], {}
    for code, aliases, unit_opts, (lo, hi) in chosen:
        canonical = round(rng.uniform(lo, hi), 2 if hi < 20 else 1)
        unit, factor = rng.choice(unit_opts)
        printed = canonical * factor
        printed_s = f"{printed:.2f}".rstrip("0").rstrip(".") if printed < 100 else f"{printed:.0f}"
        flag = rng.choice(["", "", "", "H", "L"])
        rows.append((rng.choice(aliases), printed_s + (f" {flag}" if flag else ""), unit, "-"))
        truth[code] = float(printed_s) / factor
    return d, rng.choice(LABS), rows, truth


def render(d, lab, rows, rng) -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, lab, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, "Patient Name : Test Patient     Age/Sex : 50 Y / F", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Collected On : {rng.choice(DATE_STYLES)(d)}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, "Test Name    Result    Unit    Reference", new_x="LMARGIN", new_y="NEXT")
    widths = rng.choice([(70, 30, 35, 40), (60, 25, 40, 40), (80, 35, 30, 40)])
    for r in rows:
        for w, v in zip(widths, r, strict=True):
            pdf.cell(w, 6, v)
        pdf.ln()
    return bytes(pdf.output())


def evaluate_reading(n: int):
    rng = random.Random(42)
    total = recog = value_ok = 0
    dates_ok = 0
    misses = []
    for _ in range(n):
        d, lab, rows, truth = make_report(rng)
        draft = extraction.extract(render(d, lab, rows, rng), "application/pdf", "F")
        dates_ok += draft.report_date == d
        got = {t.test_code: t for t in draft.tests if t.test_code}
        for code, true_v in truth.items():
            total += 1
            t = got.get(code)
            if t is None:
                misses.append(code)
                continue
            recog += 1
            if t.value is not None and abs(t.value - true_v) <= max(0.011 * abs(true_v), 0.011):
                value_ok += 1
            else:
                misses.append(f"{code}:{t.value}!={true_v:.2f}")
    return {"reports": n, "values": total, "test_recognised": recog / total, "value_and_unit_correct": value_ok / total,
            "report_date_correct": dates_ok / n, "sample_misses": misses[:8]}


FORMULA_CASES = [
    ("FIB-4 (Sterling 2006)", formulas.fib4(58.3, 55, 50, 155), 2.926),
    ("APRI (Wai 2003)", formulas.apri(55, 155), 0.887),
    ("Mentzer (1973)", formulas.mentzer(66, 5.6), 11.786),
    ("TyG (Simental-Mendia 2008)", formulas.tyg(150, 90), 8.817),
    ("eGFR CKD-EPI 2021, F 50y Scr 0.7", formulas.egfr_ckd_epi_2021(0.7, 50, "F"), 105.3),
    ("eGFR CKD-EPI 2021, M 60y Scr 1.2", formulas.egfr_ckd_epi_2021(1.2, 60, "M"), 69.2),
    ("Corrected calcium (Payne 1973)", formulas.corrected_calcium(8.2, 3.0), 9.0),
    ("TG/HDL", formulas.tg_hdl(180, 45), 4.0),
    ("Non-HDL", formulas.non_hdl(210, 45), 165),
]


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    r = evaluate_reading(n)
    print("\n=== Report reading (offline parser, synthetic Indian-style PDFs) ===")
    print(f"Reports: {r['reports']}   Values: {r['values']}")
    print(f"Test name recognised (LOINC-mapped code): {r['test_recognised']:.1%}")
    print(f"Value + unit conversion correct (±1%):    {r['value_and_unit_correct']:.1%}")
    print(f"Report date correct:                      {r['report_date_correct']:.1%}")
    if r["sample_misses"]:
        print("Sample misses:", ", ".join(r["sample_misses"]))
    print("\n=== Formula engine vs hand-calculated references ===")
    ok = 0
    for name, got, want in FORMULA_CASES:
        good = abs(got - want) <= max(0.005 * abs(want), 0.005)
        ok += good
        print(f"{'PASS' if good else 'FAIL'}  {name:36} got {got:8.3f}  expected {want}")
    print(f"{ok}/{len(FORMULA_CASES)} formulas match\n")


if __name__ == "__main__":
    main()
