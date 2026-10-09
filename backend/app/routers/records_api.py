"""Spec-style record endpoints: /api/records, corrections, signed file URLs, FHIR R4 export, /api/me.

These sit next to the profile-scoped endpoints used by the web app and share the same rules.
`profile_id` defaults to the account's own profile and must always belong to the caller.
"""
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import config, security
from ..database import get_db
from ..models import AuditLog, LabResult, User
from ..services import extraction, fhir, records, storage, templates
from .profiles import bmi_info, profile_out
from .reports import _owned_report, _report_out, plain_summary, timeline_events, trends, upload_report

router = APIRouter(prefix="/api", tags=["records"])


# ---------------------------------------------------------------- /me
class MeUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    language: str | None = Field(default=None, pattern="^(en|hi|ta)$")
    sex: str | None = Field(default=None, pattern="^[FM]$")
    dob: date | None = None
    height_cm: float | None = Field(default=None, gt=30, lt=260)
    weight_kg: float | None = Field(default=None, gt=2, lt=400)
    blood_group: str | None = Field(default=None, pattern="^(A|B|AB|O)[+-]$")
    allergies: list[str] | None = None
    conditions: list[str] | None = None
    emergency_name: str | None = Field(default=None, max_length=120)
    emergency_phone: str | None = Field(default=None, pattern=r"^\+?[0-9 -]{6,18}$")


@router.get("/me")
def get_me(u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    from .auth import user_out

    p = security.primary_profile(u, None, db)
    bmi, cat = bmi_info(p.height_cm, p.weight_kg)
    return {"user": user_out(u), "profile": profile_out(p), "bmi": {"value": bmi, "category": cat, "scale": "WHO Asia-Pacific"}}


@router.put("/me")
def put_me(body: MeUpdate, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.primary_profile(u, None, db)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        u.name = p.name = data.pop("name").strip()
    if "language" in data and data["language"]:
        u.language = data.pop("language")
    for k, v in data.items():
        setattr(p, k, v)
    if "sex" in data or "dob" in data:
        p.profile_incomplete = False
    db.commit()
    return get_me(u, db)


@router.delete("/me")
def delete_me(request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    """Delete the account and ALL its data (files in storage too). Cannot be undone."""
    if u.email == config.DEMO_EMAIL or u.is_demo:
        raise HTTPException(400, "The shared demo account can't be deleted. Use 'Reset demo data' instead.")
    for p in u.profiles:
        for r in p.reports:
            storage.delete(r.stored_name)
        for w in p.wounds:
            storage.delete(w.stored_name)
    db.query(AuditLog).filter(AuditLog.user_id == u.id).delete()
    db.delete(u)
    db.commit()
    return {"ok": True, "deleted": True}


# ---------------------------------------------------------------- records
class ItemFix(BaseModel):
    id: int
    test_code: str | None = None
    test_name_raw: str | None = Field(default=None, max_length=160)
    value_raw: str | None = Field(default=None, max_length=40)
    unit_raw: str | None = Field(default=None, max_length=40)
    ref_low: float | None = None
    ref_high: float | None = None


class RecordFix(BaseModel):
    report_date: date | None = None
    lab_name: str | None = Field(default=None, max_length=160)
    items: list[ItemFix] = []
    delete_item_ids: list[int] = []


@router.get("/records")
def list_records(profile_id: int | None = None, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.primary_profile(u, profile_id, db)
    return [_report_out(r) for r in sorted(p.reports, key=lambda r: (r.report_date or date.min, r.id), reverse=True)]


@router.post("/records/upload")
async def upload_record(request: Request, file: UploadFile = File(...), kind: str = Form("auto"), profile_id: int | None = Form(None),
                        u: User = Depends(security.ai_rate_limit), db: Session = Depends(get_db)):
    p = security.primary_profile(u, profile_id, db)
    return await upload_report(p.id, request, file, kind, u, db)


@router.get("/records/{rid}")
def get_record(rid: int, lang: str = Query("en", pattern="^(en|hi|ta)$"), u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    rep = _owned_report(rid, u, db)
    out = _report_out(rep, full=True)
    out["summary"] = plain_summary(rep, lang)
    if lang != "ta":
        out["summary_ta"] = plain_summary(rep, "ta")
    out["fhir_url"] = f"/api/records/{rid}/fhir"
    return out


@router.put("/records/{rid}")
def correct_record(rid: int, body: RecordFix, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    """Person corrects values after reading: value/unit/range are re-normalised and flags recomputed in code."""
    rep = _owned_report(rid, u, db)
    p = security.owned_profile(rep.profile_id, u, db)
    by_id = {r.id: r for r in rep.results}
    if body.report_date:
        rep.report_date = body.report_date
        for r in rep.results:
            r.date = body.report_date
    if body.lab_name is not None:
        rep.lab_name = body.lab_name or None
    for rid_del in body.delete_item_ids:
        r = by_id.get(rid_del)
        if r is None:
            raise HTTPException(404, f"Item {rid_del} is not in this record")
        db.delete(r)
    changed = 0
    for fix in body.items:
        r = by_id.get(fix.id)
        if r is None:
            raise HTTPException(404, f"Item {fix.id} is not in this record")
        name = fix.test_name_raw or r.test_name_raw
        t = extraction.finalize_test(extraction.DraftTest(test_name_raw=name, value_raw=fix.value_raw or r.value_raw or "",
                                                          unit_raw=fix.unit_raw if fix.unit_raw is not None else r.unit_raw,
                                                          source_text=r.source_text, confidence=1.0), p.sex, fix.test_code or r.test_code)
        if t.value is None:
            raise HTTPException(422, f"'{fix.value_raw}' is not a number we can read for {name}")
        r.test_name_raw, r.test_code, r.value, r.unit = name[:160], t.test_code, t.value, t.unit
        r.value_raw, r.unit_raw = fix.value_raw or r.value_raw, fix.unit_raw if fix.unit_raw is not None else r.unit_raw
        r.ref_low = fix.ref_low if fix.ref_low is not None else t.ref_low if fix.test_code or fix.unit_raw else r.ref_low
        r.ref_high = fix.ref_high if fix.ref_high is not None else t.ref_high if fix.test_code or fix.unit_raw else r.ref_high
        r.flag = records.result_flag(r.value, r.ref_low, r.ref_high)
        r.confidence, r.user_verified, r.confirmed = 1.0, True, True
        changed += 1
    rep.user_verified = True
    security.audit(db, u.id, "record_corrected", f"report {rep.id}: {changed} item(s) fixed, {len(body.delete_item_ids)} removed", request)
    db.commit()
    db.refresh(rep)
    return _report_out(rep, full=True)


@router.delete("/records/{rid}")
def delete_record(rid: int, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    rep = _owned_report(rid, u, db)
    storage.delete(rep.stored_name)
    security.audit(db, u.id, "report_deleted", rep.filename, request)
    db.delete(rep)
    db.commit()
    return {"ok": True}


@router.get("/records/{rid}/file-url")
def file_url(rid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    rep = _owned_report(rid, u, db)
    if not rep.stored_name:
        raise HTTPException(404, "No original file for this record (demo data)")
    return {"url": f"/api/files/{security.file_token(u.id, 'report', rep.id)}", "expires_in": 300}


@router.get("/files/{token}")
def signed_file(token: str, request: Request, db: Session = Depends(get_db)):
    """Signed, 5-minute URL: no login header needed (works in <img> / new tab), but only for that one file."""
    payload = security.decode_payload(token, "file")
    kind, _, oid = str(payload.get("obj", "")).partition(":")
    uid = int(payload["sub"])
    u = db.get(User, uid)
    if u is None or not oid.isdigit():
        raise HTTPException(404, "File not found")
    if kind == "report":
        obj = _owned_report(int(oid), u, db)
    elif kind == "wound":
        from ..models import WoundScan

        obj = db.get(WoundScan, int(oid))
        if obj is None:
            raise HTTPException(404, "File not found")
        security.owned_profile(obj.profile_id, u, db)
    else:
        raise HTTPException(404, "File not found")
    try:
        data = storage.load(obj.stored_name)
    except (FileNotFoundError, TypeError):
        raise HTTPException(404, "The original file is no longer available") from None
    security.audit(db, u.id, "file_viewed", f"{kind} {oid} (signed url)", request)
    db.commit()
    return Response(data, media_type=obj.mime or "application/octet-stream",
                    headers={"Content-Disposition": "inline", "Cache-Control": "private, no-store"})


@router.get("/records/{rid}/summary")
def record_summary(rid: int, lang: str = Query("en", pattern="^(en|hi|ta)$"), u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    return plain_summary(_owned_report(rid, u, db), lang)


# ---------------------------------------------------------------- FHIR
def _fhir_response(data: dict, filename: str) -> JSONResponse:
    return JSONResponse(data, media_type="application/fhir+json", headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.get("/records/{rid}/fhir")
def record_fhir(rid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    rep = _owned_report(rid, u, db)
    p = security.owned_profile(rep.profile_id, u, db)
    return _fhir_response(fhir.bundle(p, reports=[rep]), f"doc-record-{rid}.fhir.json")


@router.get("/fhir")
def combined_fhir(request: Request, profile_id: int | None = None, download: bool = False,
                  u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.primary_profile(u, profile_id, db)
    security.audit(db, u.id, "fhir_exported", f"profile {p.id}", request)
    db.commit()
    resp = _fhir_response(fhir.bundle(p), f"doc-{p.name.replace(' ', '_')}.fhir.json")
    if download:
        resp.headers["Content-Disposition"] = f'attachment; filename="doc-{p.id}.fhir.json"'
    return resp


# ---------------------------------------------------------------- timeline (spec alias)
@router.get("/timeline")
def timeline_spec(profile_id: int | None = None, lang: str = Query("en", pattern="^(en|hi|ta)$"),
                  u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.primary_profile(u, profile_id, db)
    t = trends(p.id, lang, u, db)
    return {"events": timeline_events(p), "trends": [{k: s[k] for k in ("code", "name", "unit", "points", "change_percent", "direction",
                                                                       "trend_sentence", "latest_flag_computed")} for s in t["series"]],
            "disclaimer": templates.disclaimer(lang)}


@router.get("/results/{result_id}")
def one_result(result_id: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    r = db.get(LabResult, result_id)
    if r is None:
        raise HTTPException(404, "Result not found")
    security.owned_profile(r.profile_id, u, db)
    from .reports import _result_out

    return _result_out(r)
