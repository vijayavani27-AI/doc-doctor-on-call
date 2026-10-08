"""Generate realistic sample report PDFs (fictional labs and people) for testing uploads.

Run from backend/:  python scripts/make_sample_reports.py
Output: ../datasets/sample_reports/*.pdf
"""
from pathlib import Path

from fpdf import FPDF

OUT = Path(__file__).resolve().parents[2] / "datasets" / "sample_reports"


def lab_pdf(path: Path, lab: str, address: str, patient: str, age_sex: str, date: str, sections: dict[str, list[tuple]]):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 8, lab, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, address, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Patient Name : {patient}     Age/Sex : {age_sex}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, "Mobile No : 9876543210     UHID : SD-2026-11873", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Ref. By : Dr. S. Kumar     Collected On : {date}     Reported On : {date}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    for title, rows in sections.items():
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "B", 9)
        for w, h in zip((70, 30, 35, 50), ("Test Name", "Result", "Unit", "Bio. Ref. Interval"), strict=True):
            pdf.cell(w, 6, h, border="B")
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for name, value, unit, ref in rows:
            pdf.cell(70, 6, name)
            pdf.cell(30, 6, value)
            pdf.cell(35, 6, unit)
            pdf.cell(50, 6, ref)
            pdf.ln()
        pdf.ln(3)
    pdf.set_font("Helvetica", "I", 8)
    pdf.multi_cell(0, 4, "*** End of Report ***  This is a computer generated SAMPLE report from a fictional laboratory for software testing.")
    pdf.output(str(path))


def rx_pdf(path: Path):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 15)
    pdf.cell(0, 8, "Kumar Diabetes Clinic", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, "Dr. S. Kumar, MD (Diabetology)  |  12 Lake View Road, Chennai (fictional)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, "Name : Mrs. Lakshmi R     Age/Sex : 58/F     Date : 06/10/2026", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, "Rx", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    for line in ["1. Tab. Glycomet 500   500 mg   1-0-1   x 30 days",
                 "2. Tab. Telma 40   40 mg   1-0-0   x 30 days",
                 "3. Tab. Rosuvas 10   10 mg   0-0-1   x 30 days",
                 "4. Tab. Methylcobal 500   500 mcg   1-0-0   x 30 days"]:
        pdf.cell(0, 7, line, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.multi_cell(0, 5, "Advice: Walk 30 minutes daily. Review with HbA1c and urine ACR after 3 months.")
    pdf.output(str(path))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    lab_pdf(OUT / "sample_lab_report_sunrise_2026-10.pdf", "Sunrise Diagnostics", "45 Anna Salai, Chennai (fictional lab)",
            "Mrs. Lakshmi R", "58 Y / F", "05-Oct-2026", {
                "LIVER FUNCTION TEST": [("SGOT (AST)", "58", "U/L", "0 - 40"), ("SGPT (ALT)", "52", "U/L", "0 - 40"),
                                        ("Alkaline Phosphatase", "112", "U/L", "44 - 147"), ("Serum Albumin", "3.9", "g/dL", "3.5 - 5.0")],
                "KIDNEY FUNCTION TEST": [("Serum Creatinine", "1.15", "mg/dL", "0.5 - 1.1"), ("Blood Urea", "34", "mg/dL", "15 - 40"),
                                         ("Serum Potassium", "5.0", "mmol/L", "3.5 - 5.1")],
                "DIABETES": [("Fasting Blood Sugar", "148", "mg/dL", "70 - 99"), ("HbA1c", "7.4", "%", "4.0 - 5.6")],
                "VITAMINS": [("Vitamin B12", "168", "pg/mL", "200 - 900")],
            })
    lab_pdf(OUT / "sample_cbc_greenleaf_mixed_units.pdf", "GreenLeaf Labs", "8 MG Road, Bengaluru (fictional lab)",
            "Ms. Priya R", "30 Y / F", "02/10/2026", {
                "COMPLETE BLOOD COUNT": [("Hemoglobin", "10.9", "g/dL", "12.0 - 15.5"), ("RBC Count", "5.5", "x10^6/uL", "4.0 - 5.2"),
                                         ("MCV", "67", "fL", "80 - 100"), ("MCH", "21", "pg", "27 - 33"),
                                         ("Platelet Count", "265", "x10^3/uL", "150 - 410"), ("Total WBC Count", "6800", "cells/cumm", "4000 - 11000")],
                "IRON STUDIES": [("Serum Ferritin", "48", "ng/mL", "15 - 150")],
                "SPECIAL TESTS": [("HbA2", "5.2", "%", "1.5 - 3.5")],
            })
    rx_pdf(OUT / "sample_prescription_kumar_clinic.pdf")
    print("Wrote sample reports to", OUT)


if __name__ == "__main__":
    main()
