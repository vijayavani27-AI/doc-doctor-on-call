"""Generate the DOC test kit: 6 PDFs for one fictional patient with a known answer key.

Patient: Ravi Kumar (fictional), Male, DOB 10-05-1972. Reports come from 3 fictional labs over
2+ years, in mixed unit systems, plus 2 prescriptions. See datasets/test_kit/ANSWER_KEY.md for what
the app should find and the hand calculations.

Run from backend/:  python scripts/make_test_kit.py
"""
from pathlib import Path

from fpdf import FPDF

OUT = Path(__file__).resolve().parents[2] / "datasets" / "test_kit"
PATIENT = ("Mr. Ravi Kumar", "M", "10-05-1972")


def _header(pdf: FPDF, lab: str, address: str, date: str):
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 8, lab, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, address, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Patient Name : {PATIENT[0]}     Age/Sex : {PATIENT[1]}     DOB : {PATIENT[2]}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, "Mobile No : 9123456780     UHID : TK-55021", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Collected On : {date}     Reported On : {date}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)


def lab(path: Path, lab_name: str, address: str, date: str, sections: dict[str, list[tuple]]):
    pdf = FPDF()
    _header(pdf, lab_name, address, date)
    for title, rows in sections.items():
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "B", 9)
        for w, h in zip((70, 30, 35, 50), ("Test Name", "Result", "Unit", "Bio. Ref. Interval"), strict=True):
            pdf.cell(w, 6, h, border="B")
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for row in rows:
            for w, v in zip((70, 30, 35, 50), row, strict=True):
                pdf.cell(w, 6, v)
            pdf.ln()
        pdf.ln(3)
    pdf.set_font("Helvetica", "I", 8)
    pdf.multi_cell(0, 4, "*** End of Report ***  SAMPLE report from a fictional laboratory, made for testing DOC (Doctor On Call).")
    pdf.output(str(path))


def rx(path: Path, clinic: str, doctor: str, date: str, lines: list[str], advice: str):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 15)
    pdf.cell(0, 8, clinic, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, f"{doctor}  |  (fictional clinic for testing)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Name : {PATIENT[0]}     Age/Sex : 54/{PATIENT[1]}     Date : {date}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, "Rx", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    for line in lines:
        pdf.cell(0, 7, line, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.multi_cell(0, 5, f"Advice: {advice}")
    pdf.output(str(path))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    lab(OUT / "01_lotus_lab_2024-01-15.pdf", "Lotus Health Lab", "21 Park Street, Chennai (fictional lab)", "15-Jan-2024", {
        "COMPLETE BLOOD COUNT": [("Haemoglobin", "14.8", "g/dL", "13.5 - 17.5"), ("RBC Count", "5.0", "million/cumm", "4.5 - 5.9"),
                                 ("MCV", "88", "fL", "80 - 100"), ("Platelet Count", "2.4", "lakhs/cumm", "1.5 - 4.1"),
                                 ("Total WBC Count", "7400", "cells/cumm", "4000 - 11000")],
        "LIVER FUNCTION TEST": [("SGOT (AST)", "32", "U/L", "0 - 40"), ("SGPT (ALT)", "38", "U/L", "0 - 40"), ("Serum Albumin", "4.4", "g/dL", "3.5 - 5.0")],
        "KIDNEY FUNCTION TEST": [("Serum Creatinine", "1.0", "mg/dL", "0.7 - 1.3"), ("Blood Urea", "28", "mg/dL", "15 - 40"), ("Serum Potassium", "4.4", "mmol/L", "3.5 - 5.1")],
        "DIABETES": [("Fasting Blood Sugar", "104", "mg/dL", "70 - 99"), ("HbA1c", "5.9", "%", "4.0 - 5.6")],
        "LIPID PROFILE": [("Total Cholesterol", "212", "mg/dL", "< 200"), ("HDL Cholesterol", "38", "mg/dL", "> 40"),
                          ("LDL Cholesterol", "140", "mg/dL", "< 100"), ("Triglycerides", "190", "mg/dL", "< 150")],
    })
    lab(OUT / "02_metro_lab_2025-02-20_mmol_units.pdf", "Metro Path Labs", "4 Ring Road, Bengaluru (fictional lab)", "20/02/2025", {
        "BIOCHEMISTRY": [("Glucose Fasting", "6.0", "mmol/L", "3.9 - 5.5"), ("HbA1c", "6.1", "%", "4.0 - 5.6"),
                         ("Creatinine", "106", "umol/L", "62 - 115"), ("Potassium", "4.7", "mmol/L", "3.5 - 5.1")],
        "LIPID PROFILE": [("Cholesterol Total", "5.6", "mmol/L", "< 5.2"), ("HDL", "0.95", "mmol/L", "> 1.0"),
                          ("LDL", "3.7", "mmol/L", "< 2.6"), ("Triglycerides", "2.3", "mmol/L", "< 1.7")],
    })
    lab(OUT / "03_lotus_lab_2026-03-10.pdf", "Lotus Health Lab", "21 Park Street, Chennai (fictional lab)", "10-Mar-2026", {
        "LIVER FUNCTION TEST": [("SGOT (AST)", "52", "U/L", "0 - 40"), ("SGPT (ALT)", "45", "U/L", "0 - 40"), ("Serum Albumin", "4.1", "g/dL", "3.5 - 5.0")],
        "KIDNEY FUNCTION TEST": [("Serum Creatinine", "1.3", "mg/dL", "0.7 - 1.3"), ("Blood Urea", "34", "mg/dL", "15 - 40"), ("Serum Potassium", "5.0", "mmol/L", "3.5 - 5.1")],
        "DIABETES": [("Fasting Blood Sugar", "112", "mg/dL", "70 - 99"), ("HbA1c", "6.3", "%", "4.0 - 5.6")],
    })
    lab(OUT / "04_citycare_cbc_2026-04-25.pdf", "CityCare Pathology", "9 Mount Road, Chennai (fictional lab)", "25/04/2026", {
        "COMPLETE BLOOD COUNT": [("Hemoglobin", "14.2", "g/dL", "13.5 - 17.5"), ("RBC", "4.9", "x10^6/uL", "4.5 - 5.9"),
                                 ("MCV", "87", "fL", "80 - 100"), ("Platelets", "155", "x10^3/uL", "150 - 410"),
                                 ("Total WBC Count", "6.9", "x10^3/uL", "4.0 - 11.0")],
    })
    rx(OUT / "05_prescription_2026-04-28.pdf", "Rao Heart & BP Clinic", "Dr. A. Rao, MD (Medicine)", "28/04/2026",
       ["1. Tab. Telma 40   40 mg   1-0-0   x 30 days", "2. Tab. Amlong 5   5 mg   1-0-0   x 30 days", "3. Tab. Atorva 10   10 mg   0-0-1   x 30 days"],
       "Low salt diet. Walk 30 minutes daily. Review in 1 month.")
    rx(OUT / "06_prescription_2026-06-10.pdf", "Quick Care Clinic", "Dr. S. Iyer, MBBS", "10/06/2026",
       ["1. Tab. Lasix 20   20 mg   1-0-0   x 15 days", "2. Tab. Brufen 400   400 mg   1-0-1   x 10 days"],
       "For leg swelling and back pain.")
    print("Wrote test kit to", OUT)


if __name__ == "__main__":
    main()
