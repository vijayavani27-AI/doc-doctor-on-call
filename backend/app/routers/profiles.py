from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import security
from ..database import get_db
from ..models import Profile, Symptom, User
from ..services import catalog

router = APIRouter(prefix="/api", tags=["profiles"])

CONDITIONS = ["diabetes", "hypertension", "hypothyroidism", "ckd", "heart_disease", "asthma", "pcos", "fatty_liver"]


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    relation: str = "self"
    sex: str = Field(default="F", pattern="^[FM]$")
    dob: date | None = None
    height_cm: float | None = Field(default=None, gt=30, lt=260)
    weight_kg: float | None = Field(default=None, gt=2, lt=400)
    conditions: list[str] = []
    color: str = "teal"


class ProfilePatch(BaseModel):
    name: str | None = None
    relation: str | None = None
    sex: str | None = Field(default=None, pattern="^[FM]$")
    dob: date | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    conditions: list[str] | None = None
    color: str | None = None


class SymptomIn(BaseModel):
    key: str
    onset_date: date
    severity: int = Field(default=2, ge=1, le=3)
    notes: str | None = None


def profile_out(p: Profile) -> dict:
    age = (date.today() - p.dob).days // 365 if p.dob else None
    bmi = round(p.weight_kg / ((p.height_cm / 100) ** 2), 1) if p.height_cm and p.weight_kg else None
    return {"id": p.id, "name": p.name, "relation": p.relation, "sex": p.sex, "dob": p.dob.isoformat() if p.dob else None,
            "age": age, "height_cm": p.height_cm, "weight_kg": p.weight_kg, "bmi": bmi, "conditions": p.conditions or [],
            "is_primary": p.is_primary, "color": p.color,
            "counts": {"reports": len(p.reports), "results": sum(1 for r in p.results if r.confirmed), "medicines": sum(1 for m in p.medications if m.active)}}


@router.get("/profiles")
def list_profiles(u: User = Depends(security.current_user)):
    return [profile_out(p) for p in sorted(u.profiles, key=lambda p: (not p.is_primary, p.id))]


@router.post("/profiles")
def create_profile(body: ProfileIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    if len(u.profiles) >= 10:
        raise HTTPException(400, "Up to 10 family profiles are supported")
    p = Profile(user_id=u.id, **body.model_dump(), is_primary=False)
    db.add(p)
    db.commit()
    db.refresh(p)
    return profile_out(p)


@router.get("/profiles/{pid}")
def get_profile(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    return profile_out(security.owned_profile(pid, u, db))


@router.patch("/profiles/{pid}")
def update_profile(pid: int, body: ProfilePatch, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    return profile_out(p)


@router.delete("/profiles/{pid}")
def delete_profile(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    if p.is_primary:
        raise HTTPException(400, "The main profile cannot be deleted. Delete the account from Settings instead.")
    db.delete(p)
    security.audit(db, u.id, "profile_deleted", p.name)
    db.commit()
    return {"ok": True}


@router.get("/profiles/{pid}/symptoms")
def list_symptoms(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    return [{"id": s.id, "key": s.key, "label": s.label, "onset_date": s.onset_date.isoformat(), "severity": s.severity, "notes": s.notes}
            for s in sorted(p.symptoms, key=lambda s: s.onset_date, reverse=True)]


@router.post("/profiles/{pid}/symptoms")
def add_symptom(pid: int, body: SymptomIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    label = catalog.symptoms().get(body.key)
    if label is None:
        raise HTTPException(422, "Unknown symptom")
    s = Symptom(profile_id=p.id, key=body.key, label=label, onset_date=body.onset_date, severity=body.severity, notes=body.notes)
    db.add(s)
    db.commit()
    return {"id": s.id}


@router.delete("/symptoms/{sid}")
def delete_symptom(sid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    s = db.get(Symptom, sid)
    if not s:
        raise HTTPException(404, "Not found")
    security.owned_profile(s.profile_id, u, db)
    db.delete(s)
    db.commit()
    return {"ok": True}
