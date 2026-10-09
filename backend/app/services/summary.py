"""One-page doctor visit summary (JSON for the app / share page, PDF for printing)."""
from datetime import date, datetime

from fpdf import FPDF

from .. import config
from ..models import Profile
from . import catalog

KEY_TESTS = ["HBA1C", "FBG", "CREAT", "K", "LDL", "TG", "HDL", "AST", "ALT", "PLT", "HB", "MCV", "TSH", "B12"]


def build(profile: Profile, analysis: dict, include_name: bool = True) -> dict:
    tests = catalog.tests()
    reports = {r.id: r for r in profile.reports}
    labs = []
    for code in KEY_TESTS:
        s = sorted((r for r in profile.results if r.test_code == code and r.confirmed and r.value is not None), key=lambda r: r.date)
        if not s:
            continue
        last, prev = s[-1], (s[-2] if len(s) > 1 else None)
        trend = None
        if prev:
            trend = "up" if last.value > prev.value * 1.03 else "down" if last.value < prev.value * 0.97 else "stable"
        labs.append({"code": code, "name": tests[code]["name"], "value": last.value, "unit": last.unit, "date": last.date.isoformat(),
                     "flag": last.flag, "previous": prev.value if prev else None, "previous_date": prev.date.isoformat() if prev else None,
                     "trend": trend, "lab": reports[last.report_id].lab_name if last.report_id in reports else None})
    cutoff = date.today().toordinal() - 365
    age = (date.today() - profile.dob).days // 365 if profile.dob else None
    return {
        "patient": {"name": profile.name if include_name else profile.name.split(" ")[0], "age": age, "sex": profile.sex,
                    "conditions": profile.conditions or [], "relation": profile.relation},
        "generated_at": datetime.now().isoformat(timespec="minutes"),
        "score": analysis["score"],
        "risks": [{"name": r["name"], "condition": r["hidden_condition"], "value": r["current"]["value"], "status": r["status"],
                   "label": r["label"], "text": r["text"], "date": r["current"]["date"], "equation": r["equation"],
                   "inputs": [f"{i['name']} {i['value']:g} {i['unit']} ({i['date']}{', ' + i['lab'] if i.get('lab') else ''})" for i in r["current"]["inputs"]],
                   "trend": r["trend"], "citation": r["citation"]}
                  for r in analysis["hidden_risks"] if r["status"] != "green"],
        "alerts": [{"level": a["level"], "title": a["title"], "text": a["text"]} for a in analysis["alerts"] if a["level"] in ("red", "yellow")],
        "drifts": [{"name": d["name"], "message": d["message"]} for d in analysis["drifts"]],
        "medicines": [{"brand": m.brand, "generic": m.generic, "dose": m.dose, "frequency": m.frequency,
                       "since": m.start_date.isoformat() if m.start_date else None, "reason": m.reason}
                      for m in profile.medications if m.active],
        "symptoms": [{"label": s.label, "onset": s.onset_date.isoformat(), "notes": s.notes} for s in profile.symptoms if s.onset_date.toordinal() >= cutoff],
        "labs": labs,
        "wellness": [{"label": w["label"], "unit": w["unit"], "latest": w["latest"], "latest2": w.get("latest2"), "avg30": w.get("avg30"),
                      "avg30_2": w.get("avg30_2"), "note": w.get("note"), "status": w["status"], "count": w["count"]} for w in analysis.get("wellness", [])],
        "questions": analysis["questions"],
        "next_tests": [{"name": n["name"], "price_inr": n["price_inr"]} for n in analysis["next_tests"][:3]],
        "disclaimer": "Prepared by DOC from the patient's own records. Scores use published formulas; they support, not replace, clinical judgement.",
    }


# ---------------------------------------------------------------- PDF
_REPL = {"→": "->", "≥": ">=", "≤": "<=", "–": "-", "—": "-", "₹": "Rs.", "×": "x", "√": "sqrt", "÷": "/", "−": "-",
         "‘": "'", "’": "'", "“": '"', "”": '"', "•": "-", "…": "...", "κ": "k", "α": "a", "^": "^"}


def _t(s) -> str:
    s = "" if s is None else str(s)
    for k, v in _REPL.items():
        s = s.replace(k, v)
    return s.encode("latin-1", "replace").decode("latin-1")


class _PDF(FPDF):
    def header(self):
        self.set_fill_color(13, 148, 136)
        self.rect(0, 0, 210, 18, "F")
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 14)
        self.set_xy(10, 5)
        self.cell(0, 8, "DOC (Doctor On Call) - Doctor Visit Summary")
        self.set_text_color(0, 0, 0)
        self.ln(16)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(110, 110, 110)
        self.multi_cell(0, 3.5, _t("Generated from the patient's own uploaded records. Risk scores use published, validated formulas and are decision support only - not a diagnosis. Page ") + str(self.page_no() + getattr(self, "page_offset", 0)))


def pdf_bytes(s: dict, local: dict | None = None) -> bytes:
    pdf = _PDF()
    pdf.set_auto_page_break(True, margin=16)
    pdf.add_page()
    pt = s["patient"]
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, _t(f"{pt['name']}   |   {pt['age']} y / {pt['sex']}   |   {', '.join(pt['conditions']) or 'No conditions recorded'}"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, _t(f"Prepared {s['generated_at'].replace('T', ' ')}"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)

    def section(title):
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 10.5)
        pdf.set_fill_color(240, 253, 250)
        pdf.cell(0, 6.5, _t(title), fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)

    colors = {"red": (220, 38, 38), "yellow": (202, 138, 4), "green": (22, 163, 74), "info": (37, 99, 235)}
    if s["risks"]:
        section("Hidden risks found by combining reports")
        for r in s["risks"]:
            pdf.set_text_color(*colors[r["status"]])
            pdf.set_font("Helvetica", "B", 9)
            pdf.multi_cell(0, 4.6, _t(f"{r['name']} = {r['value']}  ({r['label']})  - {r['condition']}"), new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
            pdf.set_font("Helvetica", "", 8.5)
            pdf.multi_cell(0, 4.2, _t(f"{r['text']}  Formula: {r['equation']}. Inputs: " + "; ".join(r["inputs"])), new_x="LMARGIN", new_y="NEXT")
            if r.get("trend"):
                pdf.multi_cell(0, 4.2, _t(f"Trend: {r['trend']['first']} ({r['trend']['first_date']}) -> {r['value']} ({r['date']})"), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
    if s["alerts"]:
        section("Medicine & care alerts")
        for a in s["alerts"]:
            pdf.set_font("Helvetica", "B", 8.5)
            pdf.set_text_color(*colors[a["level"]])
            pdf.multi_cell(0, 4.4, _t(f"- {a['title']}"), new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
            pdf.set_font("Helvetica", "", 8.5)
            pdf.multi_cell(0, 4.2, _t(f"  {a['text']}"), new_x="LMARGIN", new_y="NEXT")
    if s["medicines"]:
        section("Current medicines")
        for m in s["medicines"]:
            pdf.multi_cell(0, 4.6, _t(f"- {m['brand']} ({m['generic'] or '?'}) {m['dose'] or ''} {m['frequency'] or ''}  since {m['since'] or '?'}  - {m['reason'] or ''}"), new_x="LMARGIN", new_y="NEXT")
    if s["labs"]:
        section("Key results (latest vs previous)")
        pdf.set_font("Helvetica", "B", 8.5)
        widths = [52, 34, 34, 30, 40]
        for w, h in zip(widths, ["Test", "Latest", "Previous", "Trend", "Date / lab"], strict=True):
            pdf.cell(w, 5.5, h, border="B")
        pdf.ln()
        pdf.set_font("Helvetica", "", 8.5)
        for lab in s["labs"]:
            arrow = {"up": "rising", "down": "falling", "stable": "stable", None: "-"}[lab["trend"]]
            flag = {"H": " (H)", "L": " (L)"}.get(lab["flag"], "")
            pdf.cell(widths[0], 5, _t(lab["name"]))
            pdf.cell(widths[1], 5, _t(f"{lab['value']:g} {lab['unit']}{flag}"))
            pdf.cell(widths[2], 5, _t(f"{lab['previous']:g}" if lab["previous"] is not None else "-"))
            pdf.cell(widths[3], 5, arrow)
            pdf.cell(widths[4], 5, _t(f"{lab['date']}"))
            pdf.ln()
    if s.get("wellness"):
        section("Home readings (wellness data)")
        for w in s["wellness"]:
            latest = f"{w['latest']:g}" + (f"/{w['latest2']:g}" if w.get("latest2") is not None else "")
            avg = (f"; 30-day avg {w['avg30']:g}" + (f"/{w['avg30_2']:g}" if w.get("avg30_2") else "")) if w.get("avg30") is not None else ""
            pdf.multi_cell(0, 4.4, _t(f"- {w['label']}: latest {latest} {w['unit']}{avg} ({w['count']} readings){'. ' + w['note'] if w.get('note') else ''}"), new_x="LMARGIN", new_y="NEXT")
    if s["drifts"]:
        section("Silent trends (values still 'normal' but moving)")
        for d in s["drifts"]:
            pdf.multi_cell(0, 4.4, _t(f"- {d['message']}"), new_x="LMARGIN", new_y="NEXT")
    if s["symptoms"]:
        section("Symptoms in the last 12 months")
        for sy in s["symptoms"]:
            pdf.multi_cell(0, 4.4, _t(f"- {sy['onset']}: {sy['label']}. {sy['notes'] or ''}"), new_x="LMARGIN", new_y="NEXT")
    if s["questions"]:
        section("Questions for the doctor")
        for i, q in enumerate(s["questions"], 1):
            pdf.multi_cell(0, 4.6, _t(f"{i}. {q}"), new_x="LMARGIN", new_y="NEXT")
    english = bytes(pdf.output())
    if not local:
        return english
    # The Tamil page is rendered in its own document (fpdf2 can mis-map shaped glyphs when core fonts and
    # shaped TTF fonts share one document) and then appended with PyMuPDF.
    import pymupdf

    doc = pymupdf.open(stream=english, filetype="pdf")
    tamil = _PDF()
    tamil.page_offset = doc.page_count
    tamil.set_auto_page_break(True, margin=16)
    _local_page(tamil, local)
    with pymupdf.open(stream=bytes(tamil.output()), filetype="pdf") as extra:
        doc.insert_pdf(extra)
    out = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return out


# ---------------------------------------------------------------- family page in Tamil (code templates, no AI)
_STATUS_TA = {"red": "கவனம் தேவை", "yellow": "கண்காணிக்கவும்", "green": "சரியான அளவில்"}
_TITLE = {"ta": "குடும்பத்தினருக்கான சுருக்கம் (தமிழ்)"}


def local_summary(s: dict, lang: str) -> dict | None:
    """Plain-language lines for the family in Tamil, built from curated templates."""
    if lang != "ta":
        return None
    from . import templates

    flag_word = {"L": "low", "H": "high", "N": "normal"}
    lines = [templates.t(f"flag.{flag_word.get(lab['flag'] or 'N', 'normal')}", lang, test=lab["name"], value=lab["value"], unit=lab["unit"] or "")
             for lab in s["labs"]]
    risks = [f"{r['name']} ({r['condition']}): {r['value']} - {_STATUS_TA.get(r['status'], r['label'])}" for r in s["risks"]]
    meds = [f"{m['brand']} {m['dose'] or ''} {m['frequency'] or ''}".strip() for m in s["medicines"]]
    urgent = templates.t("urgent.banner", lang) if any(r["status"] == "red" for r in s["risks"]) or any(a["level"] == "red" for a in s["alerts"]) else None
    return {"title": _TITLE[lang], "patient": f"{s['patient']['name']}  |  {s['patient']['age'] or '-'}", "urgent": urgent,
            "sections": [("சோதனை முடிவுகள்", lines), ("மறைந்திருக்கும் அபாயங்கள்", risks), ("தற்போதைய மருந்துகள்", meds)],
            "footer": [templates.disclaimer(lang), templates.t("sos.call", lang)]}


def _local_page(pdf: FPDF, local: dict):
    fonts = config.DATA_DIR / "fonts"
    pdf.add_font("NotoTamil", "", str(fonts / "NotoSansTamil-Regular.ttf"))
    pdf.add_font("NotoTamil", "B", str(fonts / "NotoSansTamil-Bold.ttf"))
    pdf.add_font("NotoSans", "", str(fonts / "NotoSans-Regular.ttf"))
    pdf.add_font("NotoSans", "B", str(fonts / "NotoSans-Bold.ttf"))
    pdf.set_fallback_fonts(["NotoSans"])
    pdf.set_text_shaping(True)
    pdf.add_page()
    pdf.set_font("NotoTamil", "B", 13)
    pdf.multi_cell(0, 8, local["title"], new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("NotoTamil", "", 10)
    pdf.multi_cell(0, 6, local["patient"], new_x="LMARGIN", new_y="NEXT")
    if local.get("urgent"):
        pdf.set_text_color(185, 28, 28)
        pdf.set_font("NotoTamil", "B", 10.5)
        pdf.multi_cell(0, 6.5, local["urgent"], new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)
    for title, lines in local["sections"]:
        if not lines:
            continue
        pdf.ln(2)
        pdf.set_font("NotoTamil", "B", 11)
        pdf.multi_cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("NotoTamil", "", 9.5)
        for ln in lines:
            pdf.multi_cell(0, 5.6, "• " + ln, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.set_font("NotoTamil", "", 8.5)
    for ln in local["footer"]:
        pdf.multi_cell(0, 5, ln, new_x="LMARGIN", new_y="NEXT")
