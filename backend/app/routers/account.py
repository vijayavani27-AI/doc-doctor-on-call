"""Catalogue metadata, consent/audit log, data export and account deletion."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from .. import config, security
from ..database import get_db
from ..models import AuditLog, ContactMessage, User
from ..services import ai, catalog, records
from .profiles import CONDITIONS, profile_out
from .reports import _report_out, _result_out

router = APIRouter(prefix="/api", tags=["account"])


class DeleteIn(BaseModel):
    confirm: str = Field(default="", max_length=20)  # type DELETE
    password: str | None = None  # older clients (local accounts)


@router.get("/meta")
def meta():
    return {
        "ai_enabled": ai.enabled(), "model": ai.engine_label(), "ai_engines": [ai.engine_label(p) for p in ai.providers()],
        "tests": [{"code": t["code"], "name": t["name"], "unit": t["unit"], "category": t["category"], "loinc": t.get("loinc")} for t in catalog.tests().values()],
        "formulas": [{"id": f["id"], "name": f["name"], "hidden_condition": f["hidden_condition"], "equation": f["equation"], "citation": f["citation"]} for f in catalog.formulas().values()],
        "conditions": CONDITIONS,
        "symptoms": [{"key": k, "label": v} for k, v in catalog.symptoms().items()],
        "demo": {"email": config.DEMO_EMAIL},
    }


SAMPLE_SETS = {
    "test_kit": ("Test kit: Ravi Kumar (with answer key)", config.BASE_DIR.parent / "datasets" / "test_kit"),
    "samples": ("Extra samples", config.BASE_DIR.parent / "datasets" / "sample_reports"),
}


@router.get("/samples")
def list_samples():
    """Fictional sample reports anyone can download to try the upload flow."""
    out = []
    for key, (title, folder) in SAMPLE_SETS.items():
        files = sorted(p.name for p in folder.glob("*") if p.suffix in (".pdf", ".md")) if folder.exists() else []
        out.append({"set": key, "title": title, "files": [{"name": n, "url": f"/api/samples/{key}/{n}"} for n in files]})
    return out


@router.get("/samples/{set_key}/{name}")
def get_sample(set_key: str, name: str):
    if set_key not in SAMPLE_SETS:
        raise HTTPException(404, "Not found")
    folder = SAMPLE_SETS[set_key][1]
    allowed = {p.name for p in folder.glob("*") if p.suffix in (".pdf", ".md")} if folder.exists() else set()
    if name not in allowed:  # whitelist: no path traversal
        raise HTTPException(404, "Not found")
    media = "application/pdf" if name.endswith(".pdf") else "text/markdown; charset=utf-8"
    return FileResponse(folder / name, media_type=media, filename=name)


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    topic: str = Field(default="general", pattern="^(general|feedback|bug|partnership|hackathon)$")
    message: str = Field(min_length=5, max_length=3000)


contact_limiter = security.RateLimiter(5, 60 * 60)


@router.post("/contact")
def contact(body: ContactIn, request: Request, db: Session = Depends(get_db)):
    ip = security.client_ip(request)
    contact_limiter.check(ip)
    contact_limiter.hit(ip)
    db.add(ContactMessage(name=body.name.strip(), email=body.email.lower(), topic=body.topic, message=body.message.strip(), ip=ip))
    db.commit()
    return {"ok": True}


@router.get("/audit")
def audit_log(u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    from sqlalchemy import or_

    rows = (db.query(AuditLog).filter(or_(AuditLog.user_id == u.id, AuditLog.subject_user_id == u.id))
            .order_by(AuditLog.created_at.desc()).limit(150).all())
    names = {x.id: x.name for x in db.query(User).filter(User.id.in_({r.user_id for r in rows if r.user_id and r.user_id != u.id})).all()}
    return [{"action": r.action, "detail": r.detail, "ip": r.ip if r.user_id == u.id else None, "at": r.created_at.isoformat(),
             "by": "you" if r.user_id == u.id else names.get(r.user_id, "family member")} for r in rows]


@router.get("/export")
def export(request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    data = {"account": {"email": u.email, "name": u.name}, "profiles": []}
    for p in u.profiles:
        data["profiles"].append({
            **profile_out(p),
            "reports": [_report_out(r, full=True) for r in p.reports],
            "results": [_result_out(r) for r in p.results],
            "symptoms": [{"label": s.label, "onset": s.onset_date.isoformat(), "notes": s.notes} for s in p.symptoms],
            "insights": records.analyze(p),
            "vitals": [{"kind": v.kind, "value": v.value, "value2": v.value2, "context": v.context, "at": v.measured_at.isoformat(), "source": v.source} for v in p.vitals],
            "checkups": [{"title": c.title, "due": c.due_date.isoformat() if c.due_date else None, "done": c.done_date.isoformat() if c.done_date else None} for c in p.checkups],
            "reminders": [{"title": r.title, "times": r.times, "active": r.active} for r in p.reminders],
            "meals": [{"at": m.eaten_at.isoformat(), "items": m.items, "totals": m.totals} for m in p.meals],
            "wound_scans": [{"label": w.label, "at": w.created_at.isoformat(), "metrics": w.metrics, "result": w.result} for w in p.wounds],
        })
    security.audit(db, u.id, "data_exported", "JSON", request)
    db.commit()
    return JSONResponse(data, headers={"Content-Disposition": 'attachment; filename="doc-export.json"'})


@router.post("/account/delete")
def delete_account(body: DeleteIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    if u.email == config.DEMO_EMAIL:
        raise HTTPException(400, "The shared demo account can't be deleted. Use 'Reset demo data' instead.")
    if body.confirm.strip().upper() != "DELETE" and not (body.password and security.verify_password(body.password, u.password_hash)):
        raise HTTPException(400, "Type DELETE to confirm")
    from ..services import storage

    for p in u.profiles:
        for r in p.reports:
            storage.delete(r.stored_name)
        for w in p.wounds:
            storage.delete(w.stored_name)
    db.query(AuditLog).filter(AuditLog.user_id == u.id).delete()
    db.delete(u)
    db.commit()
    return {"ok": True}


@router.post("/demo/reset")
def reset_demo(u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    if u.email != config.DEMO_EMAIL:
        raise HTTPException(400, "Only the demo account can be reset")
    user = records.seed_demo(db)
    return {"access_token": security.create_token(user.id)}
