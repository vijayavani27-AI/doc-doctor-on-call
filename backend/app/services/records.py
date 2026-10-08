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


def seed_demo(db: Session) -> User:
    """Create (or reset) the demo account with the synthetic family from datasets/demo_family.json."""
    from ..security import hash_password

    existing = db.query(User).filter(User.email == config.DEMO_EMAIL).first()
    if existing:
        db.query(AuditLog).filter(AuditLog.user_id == existing.id).delete()
        db.delete(existing)
        db.flush()
    user = User(email=config.DEMO_EMAIL, name="Priya Raman (demo)", password_hash=hash_password(config.DEMO_PASSWORD))
    db.add(user)
    db.flush()

    data = json.loads((config.BASE_DIR.parent / "datasets" / "demo_family.json").read_text(encoding="utf-8"))
    for pd in data["profiles"]:
        p = Profile(user_id=user.id, name=pd["name"], relation=pd["relation"], sex=pd["sex"], dob=date.fromisoformat(pd["dob"]),
                    height_cm=pd.get("height_cm"), weight_kg=pd.get("weight_kg"), conditions=pd["conditions"],
                    is_primary=pd.get("is_primary", False), color=pd.get("color", "teal"))
        db.add(p)
        db.flush()
        for rd in pd["reports"]:
            d = date.fromisoformat(rd["date"])
            rep = Report(profile_id=p.id, filename=f"{rd['lab']} - {rd['date']}.pdf", kind=rd["kind"], lab_name=rd["lab"],
                         doctor_name=rd.get("doctor"), report_date=d, status="confirmed", method="demo")
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
                add_medication(db, p, rep, brand, dose, freq, date.fromisoformat(start), reason,
                               source_text=f"Tab. {brand}  {dose}  {freq}")
        for plan in pd.get("vitals_plan", []):
            for v in plan_readings(plan, seed=p.id * 31 + len(plan["kind"])):
                db.add(VitalReading(profile_id=p.id, source="demo", **v))
        for key, onset, severity, notes in pd.get("symptoms", []):
            db.add(Symptom(profile_id=p.id, key=key, label=catalog.symptoms().get(key, key), onset_date=date.fromisoformat(onset),
                           severity=severity, notes=notes))
    db.commit()
    db.refresh(user)
    return user
