"""Care plan: vitals (spec types), checkups, reminders, analysis, ML risk screening, devices (simulated),
ABHA (mock) and the SOS emergency card."""
import json
from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import config, security
from ..database import get_db
from ..models import Checkup, Device, LabResult, Profile, Reminder, Report, User, VitalReading
from ..services import care, catalog, extraction, records, risk, safety, templates
from .profiles import profile_out
from .reports import plain_summary, trend_change

router = APIRouter(prefix="/api", tags=["care"])


def _p(pid: int | None, u: User, db: Session) -> Profile:
    return security.primary_profile(u, pid, db)


# ================================================================ vitals (spec)
class VitalSpecIn(BaseModel):
    profile_id: int | None = None
    type: str = Field(pattern="^(" + "|".join(care.VITAL_TYPES) + ")$")
    value: float
    value2: float | None = None
    measured_at: datetime | None = None
    note: str | None = Field(default=None, max_length=300)


def _vital_out(v: VitalReading) -> dict:
    return {"id": v.id, "type": care.vital_type(v.kind, v.context), "kind": v.kind, "value": v.value, "value2": v.value2,
            "context": v.context, "measured_at": v.measured_at.isoformat(), "source": v.source, "note": v.note, "is_demo": bool(v.is_demo)}


@router.get("/vitals")
def list_vitals(profile_id: int | None = None, type: str | None = None, from_: date | None = Query(None, alias="from"),
                to: date | None = None, limit: int = Query(500, le=2000), u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = _p(profile_id, u, db)
    q = db.query(VitalReading).filter(VitalReading.profile_id == p.id)
    if type:
        if type not in care.VITAL_TYPES:
            raise HTTPException(422, f"Unknown type. Use one of: {', '.join(care.VITAL_TYPES)}")
        kind, ctx = care.VITAL_TYPES[type]
        q = q.filter(VitalReading.kind == kind)
        if ctx:
            q = q.filter(VitalReading.context == ctx)
    if from_:
        q = q.filter(VitalReading.measured_at >= datetime.combine(from_, time.min, tzinfo=UTC))
    if to:
        q = q.filter(VitalReading.measured_at <= datetime.combine(to, time.max, tzinfo=UTC))
    rows = q.order_by(VitalReading.measured_at.desc()).limit(limit).all()
    return {"items": [_vital_out(v) for v in rows], "types": list(care.VITAL_TYPES)}


@router.post("/vitals")
def add_vital(body: VitalSpecIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    from .wellness import _validate

    p = _p(body.profile_id, u, db)
    kind, ctx = care.VITAL_TYPES[body.type]
    _validate(kind, body.value, body.value2)
    v = VitalReading(profile_id=p.id, kind=kind, value=body.value, value2=body.value2, context=ctx,
                     measured_at=body.measured_at or datetime.now(UTC), source="manual", note=body.note)
    db.add(v)
    db.commit()
    return {"reading": _vital_out(v), "urgent": safety.urgent_banner(p)}


# ================================================================ checkups
class CheckupIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    kind: str = Field(default="lab", pattern="^(lab|doctor|screening|dental|eye|vaccine|other)$")
    due_date: date | None = None
    done_date: date | None = None
    repeat_months: int | None = Field(default=None, ge=1, le=60)
    provider: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=1000)


class CheckupPatch(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    kind: str | None = Field(default=None, pattern="^(lab|doctor|screening|dental|eye|vaccine|other)$")
    due_date: date | None = None
    done_date: date | None = None
    repeat_months: int | None = Field(default=None, ge=1, le=60)
    provider: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=1000)


def _checkup_out(c: Checkup) -> dict:
    today = date.today()
    status = "done" if c.done_date else ("overdue" if c.due_date and c.due_date < today else "due_soon" if c.due_date and c.due_date <= today + timedelta(days=14) else "planned")
    return {"id": c.id, "title": c.title, "kind": c.kind, "due_date": c.due_date.isoformat() if c.due_date else None,
            "done_date": c.done_date.isoformat() if c.done_date else None, "repeat_months": c.repeat_months, "provider": c.provider,
            "notes": c.notes, "status": status, "is_demo": bool(c.is_demo)}


def _owned_checkup(cid: int, u: User, db: Session) -> Checkup:
    c = db.get(Checkup, cid)
    if c is None:
        raise HTTPException(404, "Checkup not found")
    security.owned_profile(c.profile_id, u, db)
    return c


@router.get("/profiles/{pid}/checkups")
def list_checkups(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    items = sorted(p.checkups, key=lambda c: (c.done_date is not None, c.due_date or date.max))
    return {"items": [_checkup_out(c) for c in items], "suggestions": care.checkup_suggestions(records.analyze(p), p)}


@router.post("/profiles/{pid}/checkups")
def add_checkup(pid: int, body: CheckupIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    c = Checkup(profile_id=p.id, **body.model_dump())
    db.add(c)
    db.commit()
    return _checkup_out(c)


@router.patch("/checkups/{cid}")
def update_checkup(cid: int, body: CheckupPatch, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    c = _owned_checkup(cid, u, db)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    return _checkup_out(c)


@router.post("/checkups/{cid}/done")
def checkup_done(cid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    """Mark done; if it repeats, the next one is planned automatically."""
    c = _owned_checkup(cid, u, db)
    c.done_date = date.today()
    nxt = None
    if c.repeat_months:
        m = c.done_date.month - 1 + c.repeat_months
        due = date(c.done_date.year + m // 12, m % 12 + 1, min(c.done_date.day, 28))
        nxt = Checkup(profile_id=c.profile_id, title=c.title, kind=c.kind, due_date=due, repeat_months=c.repeat_months, provider=c.provider)
        db.add(nxt)
    db.commit()
    return {"done": _checkup_out(c), "next": _checkup_out(nxt) if nxt else None}


@router.delete("/checkups/{cid}")
def delete_checkup(cid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    c = _owned_checkup(cid, u, db)
    db.delete(c)
    db.commit()
    return {"ok": True}


# ================================================================ reminders
class ReminderIn(BaseModel):
    kind: str = Field(default="medicine", pattern="^(medicine|checkup|reading|water|custom)$")
    title: str = Field(min_length=1, max_length=160)
    detail: str | None = Field(default=None, max_length=300)
    times: list[str] = Field(default_factory=lambda: ["08:00"], max_length=8)
    days: list[int] = Field(default_factory=list, max_length=7)
    start_date: date | None = None
    end_date: date | None = None
    active: bool = True
    medication_id: int | None = None


class ReminderPatch(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    detail: str | None = Field(default=None, max_length=300)
    times: list[str] | None = Field(default=None, max_length=8)
    days: list[int] | None = Field(default=None, max_length=7)
    start_date: date | None = None
    end_date: date | None = None
    active: bool | None = None


class DoneIn(BaseModel):
    slot: str = Field(pattern=r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$")


def _check_times(times: list[str] | None, days: list[int] | None):
    for t in times or []:
        try:
            datetime.strptime(t, "%H:%M")
        except ValueError:
            raise HTTPException(422, f"Time '{t}' should look like 08:30") from None
    if days and any(d < 0 or d > 6 for d in days):
        raise HTTPException(422, "Days are 0 (Monday) to 6 (Sunday)")


def _reminder_out(r: Reminder) -> dict:
    return {"id": r.id, "kind": r.kind, "title": r.title, "detail": r.detail, "times": sorted(r.times or []), "days": r.days or [],
            "start_date": r.start_date.isoformat() if r.start_date else None, "end_date": r.end_date.isoformat() if r.end_date else None,
            "active": r.active, "medication_id": r.medication_id, "today": care.slots_today(r), "is_demo": bool(r.is_demo)}


def _owned_reminder(rid: int, u: User, db: Session) -> Reminder:
    r = db.get(Reminder, rid)
    if r is None:
        raise HTTPException(404, "Reminder not found")
    security.owned_profile(r.profile_id, u, db)
    return r


@router.get("/profiles/{pid}/reminders")
def list_reminders(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    have = {r.medication_id for r in p.reminders if r.medication_id}
    suggestions = [{"kind": "medicine", "title": f"Take {m.brand}", "detail": " ".join(x for x in (m.dose, m.frequency) if x) or None,
                    "times": care.times_for_frequency(m.frequency), "medication_id": m.id}
                   for m in p.medications if m.active and m.id not in have]
    return {"items": [_reminder_out(r) for r in sorted(p.reminders, key=lambda r: (not r.active, r.id))], "suggestions": suggestions}


@router.post("/profiles/{pid}/reminders")
def add_reminder(pid: int, body: ReminderIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    _check_times(body.times, body.days)
    if body.medication_id is not None and not any(m.id == body.medication_id for m in p.medications):
        raise HTTPException(404, "Medicine not found")
    r = Reminder(profile_id=p.id, **body.model_dump())
    db.add(r)
    db.commit()
    return _reminder_out(r)


@router.patch("/reminders/{rid}")
def update_reminder(rid: int, body: ReminderPatch, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    r = _owned_reminder(rid, u, db)
    data = body.model_dump(exclude_unset=True)
    _check_times(data.get("times"), data.get("days"))
    for k, v in data.items():
        setattr(r, k, v)
    db.commit()
    return _reminder_out(r)


@router.post("/reminders/{rid}/done")
def reminder_done(rid: int, body: DoneIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    r = _owned_reminder(rid, u, db)
    log = [x for x in (r.done_log or []) if x != body.slot] + [body.slot]
    r.done_log = log[-60:]
    db.commit()
    return _reminder_out(r)


@router.delete("/reminders/{rid}")
def delete_reminder(rid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    r = _owned_reminder(rid, u, db)
    db.delete(r)
    db.commit()
    return {"ok": True}


def due_items(p: Profile) -> dict:
    now = datetime.now()
    slots = []
    for r in p.reminders:
        for s in care.slots_today(r):
            slots.append({"reminder_id": r.id, "kind": r.kind, "title": r.title, "detail": r.detail, **s,
                          "overdue": not s["done"] and s["time"] < now.strftime("%H:%M")})
    slots.sort(key=lambda s: s["time"])
    checkups = [_checkup_out(c) for c in p.checkups if not c.done_date and c.due_date and c.due_date <= date.today() + timedelta(days=14)]
    return {"date": date.today().isoformat(), "slots": slots, "pending": sum(1 for s in slots if not s["done"]),
            "checkups": sorted(checkups, key=lambda c: c["due_date"])}


@router.get("/profiles/{pid}/reminders/due")
def reminders_due(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    return due_items(security.owned_profile(pid, u, db))


@router.get("/reminders/due")
def reminders_due_spec(profile_id: int | None = None, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    return due_items(_p(profile_id, u, db))


# ================================================================ analysis + ML risk
def _risk_block(p: Profile, kind: str, answers: dict | None = None) -> dict:
    if not risk.available():
        return {"kind": kind, "available": False, "error": "Risk models are not installed on this server.", "disclaimer": templates.disclaimer()}
    values, notes = care.risk_features(kind, p, answers)
    try:
        out = risk.predict(kind, values)
    except ValueError as e:
        return {"kind": kind, "available": True, "error": str(e), "sources": notes, "disclaimer": templates.disclaimer(),
                "needed": "Add your date of birth, height & weight, and home BP or a sugar / cholesterol test."}
    out["available"] = True
    out["sources"] = notes
    out["summary"] = templates.t(f"risk.{out['band']}", "en", risk=f"{kind} screening", value=f"{out['percent']}%")
    diagnosed = {"diabetes": "diabetes", "heart": "heart_disease"}[kind] in (p.conditions or [])
    out["applies"] = not diagnosed
    if diagnosed:
        label = "Diabetes" if kind == "diabetes" else "Heart disease"
        out["summary"] = (f"{label} is already recorded for this person, so this screening estimate does not apply. "
                          "It is shown only to explain how the model works. Follow your doctor's care plan.")
    return out


@router.get("/profiles/{pid}/risk/{kind}")
def risk_score(pid: int, kind: str, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    if kind not in ("diabetes", "heart"):
        raise HTTPException(404, "Use diabetes or heart")
    return _risk_block(security.owned_profile(pid, u, db), kind)


class RiskAnswers(BaseModel):
    answers: dict[str, float | None] = {}


@router.post("/profiles/{pid}/risk/{kind}")
def risk_score_with_answers(pid: int, kind: str, body: RiskAnswers, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    if kind not in ("diabetes", "heart"):
        raise HTTPException(404, "Use diabetes or heart")
    allowed = set(risk.model_info(kind)["features"]) if risk.available() else set()
    return _risk_block(security.owned_profile(pid, u, db), kind, {k: v for k, v in body.answers.items() if k in allowed})


@router.get("/risk/{kind}")
def risk_spec(kind: str, profile_id: int | None = None, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    return risk_score(_p(profile_id, u, db).id, kind, u, db)


@router.get("/risk-models")
def risk_models():
    if not risk.available():
        return {"available": False}
    return {"available": True, "models": {k: risk.model_info(k) for k in ("diabetes", "heart")}}


def run_analysis(p: Profile, lang: str = "en") -> dict:
    a = records.analyze(p)
    trends = []
    by: dict[str, list[LabResult]] = {}
    for r in p.results:
        if r.confirmed and r.test_code and r.value is not None and r.date:
            by.setdefault(r.test_code, []).append(r)
    for code, rs in by.items():
        if len(rs) < 2:
            continue
        rs.sort(key=lambda r: r.date)
        t = catalog.tests()[code]
        ch = trend_change(t["name"], t["unit"], rs[0].value, rs[-1].value, rs[0].date, rs[-1].date, lang)
        if ch["direction"] and ch["direction"] != "stable":
            trends.append({"code": code, "name": t["name"], **ch})
    latest_report = max((r for r in p.reports if r.status == "confirmed" and r.kind == "lab"), key=lambda r: (r.report_date or date.min, r.id), default=None)
    return {"profile_id": p.id, "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "score": a["score"], "hidden_risks": a["hidden_risks"], "drifts": a["drifts"], "alerts": a["alerts"], "next_tests": a["next_tests"],
            "questions": a.get("questions", []), "wellness": a["wellness"], "trends": trends,
            "screening": {k: _risk_block(p, k) for k in ("diabetes", "heart")},
            "latest_report_summary": plain_summary(latest_report, lang) if latest_report else None,
            "urgent": safety.urgent_banner(p, lang=lang), "disclaimer": templates.disclaimer(lang)}


@router.post("/profiles/{pid}/analysis/run")
def analysis_run(pid: int, lang: str = Query("en", pattern="^(en|hi|ta)$"), u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    return run_analysis(security.owned_profile(pid, u, db), lang)


@router.post("/analysis/run")
def analysis_run_spec(profile_id: int | None = None, lang: str = Query("en", pattern="^(en|hi|ta)$"),
                      u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    return run_analysis(_p(profile_id, u, db), lang)


# ================================================================ devices (simulated)
class DeviceIn(BaseModel):
    kind: str = Field(pattern="^(" + "|".join(care.DEVICE_KINDS) + ")$")


def _device_out(d: Device) -> dict:
    return {"id": d.id, "kind": d.kind, "name": d.name, "reads": care.DEVICE_KINDS[d.kind]["reads"],
            "connected_at": d.connected_at.isoformat(), "last_sync_at": d.last_sync_at.isoformat() if d.last_sync_at else None,
            "is_demo": True, "note": "Simulated device for the demo. Readings are marked source=device_demo."}


@router.get("/profiles/{pid}/devices")
def list_devices(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    return {"items": [_device_out(d) for d in p.devices], "available": [{"kind": k, **v} for k, v in care.DEVICE_KINDS.items()]}


@router.post("/profiles/{pid}/devices")
def connect_device(pid: int, body: DeviceIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    if any(d.kind == body.kind for d in p.devices):
        raise HTTPException(409, "This device is already connected")
    d = Device(profile_id=p.id, kind=body.kind, name=care.DEVICE_KINDS[body.kind]["name"], is_demo=True)
    db.add(d)
    db.commit()
    return _device_out(d)


@router.post("/devices/{did}/sync")
def sync_device(did: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    d = db.get(Device, did)
    if d is None:
        raise HTTPException(404, "Device not found")
    p = security.owned_profile(d.profile_id, u, db)
    now = datetime.now(UTC)
    since = d.last_sync_at or (now - timedelta(days=7))
    if since.tzinfo is None:
        since = since.replace(tzinfo=UTC)
    rows = care.simulate_readings(d.kind, p, since, now, seed=d.id * 1000 + int(now.timestamp() // 86400))
    for r in rows:
        db.add(VitalReading(profile_id=p.id, kind=r["kind"], value=r["value"], value2=r.get("value2"), context=r.get("context"),
                            measured_at=r["at"], source="device_demo", is_demo=True))
    d.last_sync_at = now
    db.commit()
    return {"device": _device_out(d), "added": len(rows)}


@router.delete("/devices/{did}")
def remove_device(did: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    d = db.get(Device, did)
    if d is None:
        raise HTTPException(404, "Device not found")
    security.owned_profile(d.profile_id, u, db)
    db.delete(d)
    db.commit()
    return {"ok": True}


# ================================================================ ABHA (mock ABDM)
class AbhaIn(BaseModel):
    abha_number: str | None = Field(default=None, max_length=20)
    abha_address: str | None = Field(default=None, max_length=80)


@router.post("/profiles/{pid}/abha/link")
def abha_link(pid: int, body: AbhaIn, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    """MOCK: validates the format only. A real link needs ABDM sandbox credentials and OTP consent."""
    p = security.owned_profile(pid, u, db)
    try:
        num, addr = care.normalise_abha_number(body.abha_number), care.normalise_abha_address(body.abha_address)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    if not num and not addr:
        raise HTTPException(422, "Enter an ABHA number (12-3456-7890-1234) or an ABHA address (name@abdm)")
    p.abha_number, p.abha_address, p.abha_linked_at = num, addr, datetime.now(UTC)
    security.audit(db, u.id, "abha_linked", "mock", request)
    db.commit()
    return {"mock": True, "profile": profile_out(p),
            "note": "Demo link: we checked the format only. Real ABDM linking needs government sandbox access and your OTP consent."}


@router.delete("/profiles/{pid}/abha")
def abha_unlink(pid: int, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    p.abha_number = p.abha_address = p.abha_linked_at = None
    security.audit(db, u.id, "abha_unlinked", None, request)
    db.commit()
    return {"ok": True, "profile": profile_out(p)}


@router.post("/profiles/{pid}/abha/import")
def abha_import(pid: int, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    """MOCK import of a record 'from a linked facility'. The record is clearly flagged is_demo=true."""
    p = security.owned_profile(pid, u, db)
    if not (p.abha_number or p.abha_address):
        raise HTTPException(409, "Link an ABHA first")
    data = json.loads((config.BASE_DIR.parent / "datasets" / "abha_mock.json").read_text(encoding="utf-8"))
    rec = data["record"]
    d = date.today() - timedelta(days=rec.get("days_ago", 20))
    if any(r.lab_name == rec["lab"] and r.is_demo and r.report_date == d for r in p.reports):
        raise HTTPException(409, "This mock record was already imported")
    rep = Report(profile_id=p.id, filename=f"ABDM import (demo) - {rec['lab']}.json", kind="lab", lab_name=rec["lab"], report_date=d,
                 status="confirmed", method="abha-mock", is_demo=True, notes=json.dumps({"warnings": ["Demo data from a simulated ABDM health locker."]}))
    db.add(rep)
    db.flush()
    for name, value, unit, ref in rec["results"]:
        t = extraction.finalize_test(extraction.DraftTest(test_name_raw=name, value_raw=value, unit_raw=unit, ref_raw=ref,
                                                          source_text=f"ABDM FHIR Observation: {name} {value} {unit}", confidence=1.0), p.sex)
        db.add(LabResult(report_id=rep.id, profile_id=p.id, test_code=t.test_code, test_name_raw=name, value=t.value, unit=t.unit,
                         value_raw=value, unit_raw=unit, ref_low=t.ref_low, ref_high=t.ref_high,
                         flag=records.result_flag(t.value, t.ref_low, t.ref_high), date=d, confidence=1.0, source_text=t.source_text, confirmed=True))
    security.audit(db, u.id, "abha_import", "mock record", request)
    db.commit()
    return {"mock": True, "imported_report_id": rep.id, "results": len(rec["results"])}


# ================================================================ SOS
@router.get("/profiles/{pid}/sos")
def sos(pid: int, request: Request, lang: str = Query("en", pattern="^(en|hi|ta)$"), u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    security.audit(db, u.id, "sos_opened", None, request)
    db.commit()
    a = records.analyze(p)
    return {"numbers": safety.EMERGENCY_NUMBERS + [safety.MENTAL_HEALTH],
            "card": {"name": p.name, "age": profile_out(p)["age"], "sex": p.sex, "blood_group": p.blood_group, "allergies": p.allergies or [],
                     "conditions": p.conditions or [], "emergency_contact": {"name": p.emergency_name, "phone": p.emergency_phone},
                     "medicines": [f"{m.brand} ({m.generic or '?'}) {m.dose or ''} {m.frequency or ''}".strip() for m in p.medications if m.active],
                     "red_risks": [f"{r['hidden_condition']}: {r['label']}" for r in a["hidden_risks"] if r["status"] == "red"]},
            "urgent": safety.urgent_banner(p, lang=lang),
            "share_message": templates.t("sos.message", lang, name=p.name, location="{location}"),
            "disclaimer": "DOC is not an emergency service. In an emergency call 112 (or 108 for an ambulance) right away.",
            "steps": ["Call 112 (or 108 for an ambulance) and say where you are.", "Stay with the person; keep them still and comfortable.",
                      "Show this card to the ambulance team or doctor.", "Do not give food, drink or extra medicine unless a doctor tells you."]}
