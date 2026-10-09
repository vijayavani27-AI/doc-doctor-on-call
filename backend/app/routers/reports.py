"""Upload -> AI reading -> confirm step, plus records, trends and timeline."""
import json
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import config, security
from ..database import get_db
from ..models import LabResult, Report, User
from ..services import catalog, extraction, flags, records, storage, templates

router = APIRouter(prefix="/api", tags=["reports"])

ALLOWED = {"application/pdf": b"%PDF", "image/jpeg": b"\xff\xd8", "image/png": b"\x89PNG", "image/webp": b"RIFF"}


class ConfirmTest(BaseModel):
    test_code: str | None = None
    test_name_raw: str
    value_raw: str
    unit_raw: str | None = None
    ref_raw: str | None = None  # range as printed (report units)
    ref_low: float | None = None  # or: range already in canonical units (from the review screen)
    ref_high: float | None = None
    source_text: str | None = None
    confidence: float = 1.0


class ConfirmMed(BaseModel):
    brand: str
    dose: str | None = None
    frequency: str | None = None
    start_date: date | None = None
    reason: str | None = None
    source_text: str | None = None
    confidence: float = 1.0


class ConfirmIn(BaseModel):
    kind: str = "lab"
    lab_name: str | None = None
    doctor_name: str | None = None
    report_date: date
    tests: list[ConfirmTest] = []
    medicines: list[ConfirmMed] = []


def _result_out(r: LabResult) -> dict:
    t = catalog.tests().get(r.test_code or "")
    fc = flags.flag_for(r.test_code, r.value, r.ref_low, r.ref_high)
    return {"flag_computed": fc, "needs_review": not r.confirmed and flags.needs_review(r.confidence, r.user_verified),
            "user_verified": bool(r.user_verified), "id": r.id, "report_id": r.report_id, "test_code": r.test_code, "test_name": t["name"] if t else r.test_name_raw,
            "test_name_raw": r.test_name_raw, "category": t["category"] if t else "Other", "value": r.value, "unit": r.unit,
            "value_raw": r.value_raw, "unit_raw": r.unit_raw, "ref_low": r.ref_low, "ref_high": r.ref_high, "flag": r.flag,
            "date": r.date.isoformat() if r.date else None, "confidence": r.confidence, "source_text": r.source_text,
            "confirmed": r.confirmed, "loinc": t.get("loinc") if t else None}


def _report_out(r: Report, full: bool = False) -> dict:
    out = {"id": r.id, "filename": r.filename, "kind": r.kind, "lab_name": r.lab_name, "doctor_name": r.doctor_name,
           "report_date": r.report_date.isoformat() if r.report_date else None, "status": r.status, "method": r.method,
           "has_file": bool(r.stored_name), "mime": r.mime, "created_at": r.created_at.isoformat(),
           "n_results": len(r.results), "n_abnormal": sum(1 for x in r.results if x.flag in ("H", "L")),
           "n_medicines": len(r.medications), "pages": r.pages, "user_verified": bool(r.user_verified), "is_demo": bool(r.is_demo),
           "n_critical": sum(1 for x in r.results if flags.flag_for(x.test_code, x.value, x.ref_low, x.ref_high) in ("critical_low", "critical_high")),
           "n_needs_review": sum(1 for x in r.results if not x.confirmed and flags.needs_review(x.confidence, x.user_verified))}
    if full:
        out["results"] = [_result_out(x) for x in r.results]
        out["medicines"] = [{"id": m.id, "brand": m.brand, "generic": m.generic, "dose": m.dose, "frequency": m.frequency,
                             "start_date": m.start_date.isoformat() if m.start_date else None, "reason": m.reason,
                             "confidence": m.confidence, "source_text": m.source_text} for m in r.medications]
        meta = json.loads(r.notes) if r.notes else {}
        out["draft_medicines"] = meta.get("draft_medicines", []) if r.status == "review" else []
        out["warnings"] = meta.get("warnings", [])
        out["redactions"] = meta.get("redactions", 0)
        out["reader"] = meta.get("reader")
        out["needs_review"] = [x["id"] for x in out["results"] if x["needs_review"]]
    return out


def plain_summary(r: Report, lang: str = "en") -> dict:
    """Code-generated plain-language summary of one report (no AI): a headline + one sentence per value."""
    tests = catalog.tests()
    lines = []
    abnormal = 0
    for x in r.results:
        if x.value is None:
            continue
        f = flags.flag_for(x.test_code, x.value, x.ref_low, x.ref_high) or "normal"
        abnormal += f != "normal"
        name = tests.get(x.test_code or "", {}).get("name", x.test_name_raw)
        lines.append({"result_id": x.id, "flag": f, "text": templates.t(f"flag.{f}", lang, test=name, value=x.value, unit=x.unit or "")})
    lines.sort(key=lambda z: z["flag"] == "normal")
    n = len(lines)
    head = templates.t("summary.header", lang, name=r.lab_name or r.doctor_name or r.filename,
                       date=r.report_date.isoformat() if r.report_date else "-")
    overview = (templates.t("summary.no_abnormal", lang, count=n) if abnormal == 0
                else templates.t("summary.n_abnormal", lang, count=n, abnormal=abnormal))
    return {"language": lang, "headline": f"{head}. {overview}" if n else head, "lines": lines, "disclaimer": templates.disclaimer(lang)}


def _owned_report(rid: int, u: User, db: Session) -> Report:
    r = db.get(Report, rid)
    if not r:
        raise HTTPException(404, "Report not found")
    security.owned_profile(r.profile_id, u, db)
    return r


@router.post("/profiles/{pid}/reports")
async def upload_report(pid: int, request: Request, file: UploadFile = File(...), kind: str = Form("auto"),
                        u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    data = await file.read()
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File is larger than {config.MAX_UPLOAD_MB} MB")
    mime = file.content_type or ""
    if mime not in ALLOWED:
        raise HTTPException(415, "Please upload a PDF, JPG, PNG or WEBP file")
    magic = ALLOWED[mime]
    if magic and not data.startswith(magic):
        raise HTTPException(415, "The file content does not match its type")

    if mime == "application/pdf":
        from ..services import ocr

        if ocr.pdf_page_count(data) > 20:
            raise HTTPException(413, "This PDF has too many pages. Please upload the report pages only (we read the first 4).")
    try:
        stored = storage.save(u.firebase_uid or f"u{u.id}", file.filename or "report", data)  # encrypted, then stored
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from None

    draft = extraction.extract(data, mime, p.sex, kind if kind in ("lab", "prescription") else None)
    rep = Report(profile_id=p.id, filename=file.filename or "report", stored_name=stored, mime=mime, kind=draft.kind,
                 lab_name=draft.lab_name, doctor_name=draft.doctor_name, report_date=draft.report_date, status="review",
                 method=draft.method, pages=draft.pages, ocr_text=draft.text,
                 notes=json.dumps({"warnings": draft.warnings, "redactions": draft.redactions, "reader": draft.reader,
                                   "draft_medicines": [{"brand": m.brand, "generic": m.generic, "dose": m.dose, "frequency": m.frequency,
                                                        "duration": m.duration, "source_text": m.source_text, "confidence": m.confidence,
                                                        "matched": bool(m.generics)} for m in draft.medicines]}))
    db.add(rep)
    db.flush()
    for t in draft.tests:
        db.add(LabResult(report_id=rep.id, profile_id=p.id, test_code=t.test_code, test_name_raw=t.test_name_raw[:160], value=t.value,
                         unit=t.unit, value_raw=t.value_raw, unit_raw=t.unit_raw, ref_low=t.ref_low, ref_high=t.ref_high,
                         flag=records.result_flag(t.value, t.ref_low, t.ref_high), date=draft.report_date, confidence=t.confidence,
                         source_text=t.source_text, confirmed=False))
    security.audit(db, u.id, "report_uploaded", f"{file.filename} -> profile {p.id} ({draft.method})", request)
    db.commit()
    db.refresh(rep)
    return _report_out(rep, full=True)


@router.post("/reports/{rid}/confirm")
def confirm_report(rid: int, body: ConfirmIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    rep = _owned_report(rid, u, db)
    p = security.owned_profile(rep.profile_id, u, db)
    rep.kind, rep.lab_name, rep.doctor_name, rep.report_date = body.kind, body.lab_name, body.doctor_name, body.report_date
    for r in list(rep.results):
        db.delete(r)
    for m in list(rep.medications):
        db.delete(m)
    db.flush()
    for ct in body.tests:
        t = extraction.finalize_test(extraction.DraftTest(test_name_raw=ct.test_name_raw, value_raw=ct.value_raw, unit_raw=ct.unit_raw,
                                                          ref_raw=ct.ref_raw, source_text=ct.source_text, confidence=1.0), p.sex, ct.test_code)
        if ct.ref_low is not None or ct.ref_high is not None:
            t.ref_low, t.ref_high = ct.ref_low, ct.ref_high
        db.add(LabResult(report_id=rep.id, profile_id=p.id, test_code=t.test_code, test_name_raw=ct.test_name_raw[:160], value=t.value,
                         unit=t.unit, value_raw=ct.value_raw, unit_raw=ct.unit_raw, ref_low=t.ref_low, ref_high=t.ref_high,
                         flag=records.result_flag(t.value, t.ref_low, t.ref_high), date=body.report_date,
                         confidence=1.0, source_text=ct.source_text, confirmed=True))
    for cm in body.medicines:
        records.add_medication(db, p, rep, cm.brand, cm.dose, cm.frequency, cm.start_date or body.report_date, cm.reason,
                               source_text=cm.source_text)
    meta = json.loads(rep.notes) if rep.notes else {}
    meta.pop("draft_medicines", None)
    rep.notes = json.dumps(meta)
    rep.status = "confirmed"
    db.commit()
    db.refresh(rep)
    return _report_out(rep, full=True)


@router.get("/profiles/{pid}/reports")
def list_reports(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    return [_report_out(r) for r in sorted(p.reports, key=lambda r: (r.report_date or date.min, r.id), reverse=True)]


@router.get("/reports/{rid}")
def get_report(rid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    return _report_out(_owned_report(rid, u, db), full=True)


@router.get("/reports/{rid}/file")
def get_report_file(rid: int, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    rep = _owned_report(rid, u, db)
    if not rep.stored_name:
        raise HTTPException(404, "No original file for this report (demo data)")
    try:
        data = storage.load(rep.stored_name)
    except FileNotFoundError:
        raise HTTPException(404, "The original file is no longer available") from None
    security.audit(db, u.id, "file_viewed", rep.filename, request)
    db.commit()
    return Response(data, media_type=rep.mime or "application/octet-stream",
                    headers={"Content-Disposition": f'inline; filename="{rep.filename}"', "Cache-Control": "no-store"})


@router.delete("/reports/{rid}")
def delete_report(rid: int, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    rep = _owned_report(rid, u, db)
    storage.delete(rep.stored_name)
    security.audit(db, u.id, "report_deleted", rep.filename, request)
    db.delete(rep)
    db.commit()
    return {"ok": True}


@router.get("/profiles/{pid}/results")
def list_results(pid: int, code: str | None = None, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    rs = [r for r in p.results if r.confirmed and (code is None or r.test_code == code)]
    return [_result_out(r) for r in sorted(rs, key=lambda r: (r.date or date.min), reverse=True)]


def trend_change(name: str, unit: str, first: float, last: float, d0: date, d1: date, lang: str = "en") -> dict:
    """change_percent, direction (up / down / stable; under 3% counts as stable) and a neutral sentence."""
    if d0 == d1:
        return {"change_percent": None, "direction": None, "trend_sentence": None}
    pct = round((last - first) / first * 100, 1) if first else None
    direction = "stable" if pct is None or abs(pct) < 3 else ("up" if pct > 0 else "down")
    sentence = templates.t(f"trend.{direction}", lang, test=name, from_value=round(first, 2), to_value=round(last, 2), unit=unit,
                           change_percent=f"{pct:+g}" if pct is not None else "0", from_date=d0.strftime("%b %Y"), to_date=d1.strftime("%b %Y"))
    return {"change_percent": pct, "direction": direction, "trend_sentence": sentence}


@router.get("/profiles/{pid}/trends")
def trends(pid: int, lang: str = "en", u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    reports = {r.id: r for r in p.reports}
    tests = catalog.tests()
    by_code: dict[str, list[LabResult]] = {}
    for r in p.results:
        if r.confirmed and r.test_code and r.value is not None and r.date:
            by_code.setdefault(r.test_code, []).append(r)
    series = []
    for code, rs in by_code.items():
        rs.sort(key=lambda r: r.date)
        t = tests[code]
        lo, hi = catalog.ref_range(code, p.sex)
        pts, changes, prev_lab = [], [], None
        for r in rs:
            lab = reports[r.report_id].lab_name if r.report_id in reports else None
            if prev_lab is not None and lab != prev_lab:
                changes.append({"date": r.date.isoformat(), "from": prev_lab, "to": lab})
            prev_lab = lab
            pts.append({"date": r.date.isoformat(), "value": r.value, "lab": lab, "result_id": r.id, "flag": r.flag,
                        "value_raw": r.value_raw, "unit_raw": r.unit_raw})
        series.append({"code": code, "name": t["name"], "unit": t["unit"], "category": t["category"], "ref_low": lo, "ref_high": hi,
                       "points": pts, "lab_changes": changes, "latest_flag": rs[-1].flag, "simple": t["simple"],
                       "latest_flag_computed": flags.flag_for(code, rs[-1].value, rs[-1].ref_low, rs[-1].ref_high),
                       **trend_change(t["name"], t["unit"], rs[0].value, rs[-1].value, rs[0].date, rs[-1].date, lang)})
    order = ["Diabetes", "Kidney", "Liver", "Blood count", "Heart", "Thyroid", "Vitamins"]
    series.sort(key=lambda s: (order.index(s["category"]) if s["category"] in order else 99, -len(s["points"])))
    analysis = records.analyze(p)
    derived = [{"id": r["id"], "name": r["name"], "status": r["status"], "points": [{"date": h["date"], "value": h["value"], "status": h["status"]} for h in r["history"]]}
               for r in analysis["hidden_risks"]]
    return {"series": series, "derived": derived}


@router.get("/profiles/{pid}/timeline")
def timeline(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    return timeline_events(security.owned_profile(pid, u, db))


def timeline_events(p, include_insights: bool = True) -> list[dict]:
    """Reports, medicines, symptoms, checkups and insight milestones, newest first. Works on a Profile
    or on a permission-filtered view of one (family sharing)."""
    events = []
    for r in p.reports:
        if r.report_date:
            abn = [x for x in r.results if x.flag in ("H", "L")]
            events.append({"date": r.report_date.isoformat(), "type": "report", "kind": r.kind, "title": r.lab_name or r.filename,
                           "subtitle": (f"{len(r.results)} tests, {len(abn)} outside range" if r.kind == "lab" else
                                        f"Prescription by {r.doctor_name or 'doctor'}: " + ", ".join(m.brand for m in r.medications)),
                           "report_id": r.id, "abnormal": [catalog.tests().get(x.test_code or "", {}).get("name", x.test_name_raw) for x in abn][:4]})
    for m in p.medications:
        if m.start_date:
            events.append({"date": m.start_date.isoformat(), "type": "medicine", "title": f"Started {m.brand}",
                           "subtitle": f"{m.generic or ''} {m.dose or ''} {m.frequency or ''}".strip() + (f": {m.reason}" if m.reason else "")})
    for s in p.symptoms:
        events.append({"date": s.onset_date.isoformat(), "type": "symptom", "title": s.label, "subtitle": s.notes or ""})
    for c in getattr(p, "checkups", []):
        when = c.done_date or c.due_date
        if when:
            events.append({"date": when.isoformat(), "type": "checkup", "title": ("Done: " if c.done_date else "Due: ") + c.title,
                           "subtitle": c.provider or c.kind})
    analysis = records.analyze(p) if include_insights else {"hidden_risks": []}
    for r in analysis["hidden_risks"]:
        first_bad = next((h for h in r["history"] if h["status"] != "green"), None)
        if first_bad:
            events.append({"date": first_bad["date"], "type": "insight", "title": f"{r['name']} entered {first_bad['label'].lower()}",
                           "subtitle": f"{r['hidden_condition']}: {first_bad['value']} (found by combining {first_bad['reports_combined']} report(s))",
                           "status": first_bad["status"]})
    events.sort(key=lambda e: e["date"], reverse=True)
    return events
