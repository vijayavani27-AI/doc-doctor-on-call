"""Bridges the database and the insight engine, and seeds the demo family."""
import json
from datetime import UTC, date

from sqlalchemy.orm import Session

from .. import config
from ..models import AuditLog, LabResult, Medication, Profile, Report, Symptom, User, VitalReading
from . import catalog, engine, extraction, wellness


def to_patient(profile: Profile, today: date | None = None) -> engine.Patient:
    reports = {r.id: r for r in profile.reports}
    obs = []
    for r in profile.results:
        if not r.confirmed or r.test_code is None or r.value is None or r.date is None:
            continue
        rep = reports.get(r.report_id)
        obs.append(engine.Obs(code=r.test_code, value=r.value, date=r.date, result_id=r.id, report_id=r.report_id,
                              lab_name=rep.lab_name if rep else None, source_text=r.source_text,
                              ref_low=r.ref_low, ref_high=r.ref_high))
    meds = []
    for m in profile.medications:
        gids, _, _ = extraction.match_medicine(m.brand, m.generic)
        meds.append(engine.Med(id=m.id, brand=m.brand, generics=gids, start=m.start_date, end=m.end_date, active=m.active))
    syms = [engine.SymptomEvt(key=s.key, onset=s.onset_date, label=s.label) for s in profile.symptoms]
    vitals = [wellness.Vital(kind=v.kind, value=v.value, value2=v.value2, at=v.measured_at, context=v.context, id=v.id) for v in profile.vitals]
    return engine.Patient(sex=profile.sex, dob=profile.dob, conditions=profile.conditions or [], obs=obs, meds=meds,
                          symptoms=syms, today=today or date.today(), vitals=vitals, height_cm=profile.height_cm)


def analyze(profile: Profile) -> dict:
    return engine.analyze(to_patient(profile))


def result_flag(value: float | None, lo: float | None, hi: float | None) -> str | None:
    if value is None:
        return None
    if lo is not None and value < lo:
        return "L"
    if hi is not None and value > hi:
        return "H"
    return "N"


def add_medication(db: Session, profile: Profile, report: Report | None, brand: str, dose: str | None,
                   frequency: str | None, start: date | None, reason: str | None = None,
                   confidence: float = 1.0, source_text: str | None = None, generic: str | None = None) -> Medication:
    gids, cls, conf = extraction.match_medicine(brand, generic)
    gens = catalog.medicines()["generics"]
    m = Medication(profile_id=profile.id, report_id=report.id if report else None, brand=brand,
                   generic=generic or (" + ".join(gens[g]["name"] for g in gids if g in gens) or None),
                   drug_class=cls, dose=dose, frequency=frequency, start_date=start, active=True, reason=reason,
                   confidence=min(confidence, conf), source_text=source_text)
    db.add(m)
    return m


def plan_readings(plan: dict, seed: int) -> list[dict]:
    """Expand a compact demo plan into realistic, reproducible readings."""
    import random
    from datetime import datetime, time, timedelta

    rng = random.Random(seed)
    start, end = date.fromisoformat(plan["from"]), date.fromisoformat(plan["to"])
    change = date.fromisoformat(plan["change_on"]) if plan.get("change_on") else None
    out, d, i = [], start, 0
    while d <= end:
        mean = plan["mean_after"] if change and d >= change else plan["mean"]
        drift = plan.get("drift_per_30d", 0) * ((d - start).days / 30)
        vals = [round(rng.gauss(m + drift, sd), 1) for m, sd in zip(mean, plan["sd"], strict=True)]
        if plan["kind"] in ("bp", "heart_rate", "glucose", "steps", "spo2"):
            vals = [round(v) for v in vals]
        if plan["kind"] == "spo2":
            vals = [min(100, v) for v in vals]
        hour = 7 if plan["kind"] in ("bp", "glucose", "weight", "heart_rate", "spo2") else 22
        out.append({"kind": plan["kind"], "value": vals[0], "value2": vals[1] if len(vals) > 1 else None,
                    "context": plan.get("context"), "measured_at": datetime.combine(d, time(hour, rng.randint(0, 59)), tzinfo=UTC)})
        i += 1
        d = start + timedelta(days=plan["every_days"] * i)
    return out


def _seed_reports(db: Session, p: Profile, reports: list[dict]):
    for rd in reports:
        d = date.fromisoformat(rd["date"])
        rep = Report(profile_id=p.id, filename=f"{rd['lab']} - {rd['date']}.pdf", kind=rd.get("kind", "lab"), lab_name=rd["lab"],
                     doctor_name=rd.get("doctor"), report_date=d, status="confirmed", method="demo", is_demo=True)
        db.add(rep)
        db.flush()
        for name, value, unit, ref in rd.get("results", []):
            t = extraction.finalize_test(extraction.DraftTest(test_name_raw=name, value_raw=value, unit_raw=unit, ref_raw=ref,
                                                              source_text=f"{name}    {value}    {unit}    {ref}", confidence=1.0), p.sex)
            db.add(LabResult(report_id=rep.id, profile_id=p.id, test_code=t.test_code, test_name_raw=name, value=t.value,
                             unit=t.unit, value_raw=value, unit_raw=unit, ref_low=t.ref_low, ref_high=t.ref_high,
                             flag=result_flag(t.value, t.ref_low, t.ref_high), date=d, confidence=t.confidence,
                             source_text=t.source_text, page=1, confirmed=True))
        for brand, dose, freq, start, reason in rd.get("medicines", []):
            m = add_medication(db, p, rep, brand, dose, freq, date.fromisoformat(start), reason, source_text=f"Tab. {brand}  {dose}  {freq}")
            m.is_demo = True


def demo_outdated(u: User) -> bool:
    """Re-seed demos created by older versions (no wellness data / no care plan / no family links)."""
    return not any(p.vitals for p in u.profiles) or not any(p.checkups for p in u.profiles) or not any(p.is_demo for p in u.profiles)


def seed_demo(db: Session) -> User:
    """Create (or reset) the demo account: the synthetic family from datasets/demo_family.json plus the care plan and
    consent-based family links from datasets/demo_extras.json. Everything is flagged is_demo=true."""
    from datetime import datetime, timedelta

    from ..models import Checkup, Device, FamilyLink, MealLog, Reminder
    from ..security import hash_password
    from . import care, nutrition

    root = config.BASE_DIR.parent / "datasets"
    extras = json.loads((root / "demo_extras.json").read_text(encoding="utf-8"))
    emails = [config.DEMO_EMAIL] + [a["email"] for a in extras["linked_accounts"]]
    for old in db.query(User).filter(User.email.in_(emails)).all():
        db.query(AuditLog).filter(AuditLog.user_id == old.id).delete()
        db.query(FamilyLink).filter((FamilyLink.requester_id == old.id) | (FamilyLink.owner_id == old.id)).delete(synchronize_session=False)
        db.delete(old)
    db.flush()
    user = User(email=config.DEMO_EMAIL, name="Priya Raman (demo)", password_hash=hash_password(config.DEMO_PASSWORD),
                auth_provider="demo", is_demo=True, email_verified=True)
    db.add(user)
    db.flush()

    data = json.loads((root / "demo_family.json").read_text(encoding="utf-8"))
    today = date.today()
    for pd in data["profiles"]:
        extra = extras["care"].get(pd["name"], {})
        p = Profile(user_id=user.id, name=pd["name"], relation=pd["relation"], sex=pd["sex"], dob=date.fromisoformat(pd["dob"]),
                    height_cm=pd.get("height_cm"), weight_kg=pd.get("weight_kg"), conditions=pd["conditions"],
                    is_primary=pd.get("is_primary", False), color=pd.get("color", "teal"), is_demo=True, **extra.get("profile", {}))
        db.add(p)
        db.flush()
        _seed_reports(db, p, pd["reports"])
        for plan in pd.get("vitals_plan", []):
            for v in plan_readings(plan, seed=p.id * 31 + len(plan["kind"])):
                db.add(VitalReading(profile_id=p.id, source="demo", is_demo=True, **v))
        for key, onset, severity, notes in pd.get("symptoms", []):
            db.add(Symptom(profile_id=p.id, key=key, label=catalog.symptoms().get(key, key), onset_date=date.fromisoformat(onset),
                           severity=severity, notes=notes))
        db.flush()
        for c in extra.get("checkups", []):
            db.add(Checkup(profile_id=p.id, title=c["title"], kind=c["kind"], repeat_months=c.get("repeat_months"), provider=c.get("provider"),
                           due_date=today + timedelta(days=c["due_in_days"]) if "due_in_days" in c else None,
                           done_date=today - timedelta(days=c["done_days_ago"]) if "done_days_ago" in c else None, is_demo=True))
        meds = {m.brand: m for m in p.medications}
        for r in extra.get("reminders", []):
            db.add(Reminder(profile_id=p.id, kind=r["kind"], title=r["title"], detail=r.get("detail"), times=r["times"],
                            medication_id=meds[r["brand"]].id if r.get("brand") in meds else None, is_demo=True))
        for kind in extra.get("devices", []):
            db.add(Device(profile_id=p.id, kind=kind, name=care.DEVICE_KINDS[kind]["name"], is_demo=True,
                          last_sync_at=datetime.combine(today, datetime.min.time()).replace(tzinfo=UTC)))
        for m in extra.get("meals", []):
            items = [nutrition.item(k, s) for k, s in m["items"] if k in nutrition.foods()]
            at = datetime.combine(today - timedelta(days=m["days_ago"]), datetime.min.time()).replace(
                hour={"breakfast": 8, "lunch": 13, "snack": 17, "dinner": 20}.get(m["meal_type"], 12), tzinfo=UTC)
            db.add(MealLog(profile_id=p.id, meal_type=m["meal_type"], items=items, totals=nutrition.totals(items), eaten_at=at,
                           source="manual", is_demo=True))

    for acc in extras["linked_accounts"]:
        other = User(email=acc["email"], name=acc["name"], password_hash="", auth_provider="demo", is_demo=True, email_verified=True)
        db.add(other)
        db.flush()
        op = Profile(user_id=other.id, name=acc["name"], relation="self", sex=acc["sex"], dob=date.fromisoformat(acc["dob"]),
                     height_cm=acc.get("height_cm"), weight_kg=acc.get("weight_kg"), conditions=acc.get("conditions", []), is_primary=True, is_demo=True)
        db.add(op)
        db.flush()
        _seed_reports(db, op, acc.get("reports", []))
        demo_views = acc["direction"] == "demo_views_them"
        approved = acc["status"] == "approved"
        db.add(FamilyLink(requester_id=user.id if demo_views else other.id, owner_id=other.id if demo_views else user.id,
                          owner_email=acc["email"] if demo_views else config.DEMO_EMAIL, relation=acc["relation_to_demo"],
                          message=acc.get("message"), status=acc["status"], requested_permissions=acc["permissions"],
                          permissions=acc["permissions"] if approved else {}, is_demo=True,
                          responded_at=datetime.now(UTC) if approved else None))
    db.commit()
    db.refresh(user)
    return user
