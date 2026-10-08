"""Wellness data: home BP, sugar, weight, heart rate, SpO2, steps and sleep."""
import csv
import io
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import security
from ..database import get_db
from ..models import User, VitalReading
from ..services import catalog, records

router = APIRouter(prefix="/api", tags=["wellness"])

TEMPLATE = """date,kind,value,value2,context,note
2026-10-01 07:30,bp,132,84,,morning
2026-10-01 07:35,glucose,128,,fasting,
2026-10-01,weight,68.2,,,
2026-10-01,steps,5400,,,
2026-10-01,sleep,6.5,,,
2026-10-01 07:40,heart_rate,78,,,
2026-10-01 07:41,spo2,97,,,
"""


class VitalIn(BaseModel):
    kind: str
    value: float
    value2: float | None = None
    context: str | None = Field(default=None, pattern="^(fasting|after_meal|random)$")
    measured_at: datetime | None = None
    note: str | None = Field(default=None, max_length=300)


def _validate(kind: str, value: float, value2: float | None) -> None:
    meta = catalog.wellness().get(kind)
    if not meta:
        raise HTTPException(422, f"Unknown reading type '{kind}'")
    lo, hi = meta["plausible"]
    if not lo <= value <= hi:
        raise HTTPException(422, f"{meta['label']} {value:g} looks wrong (expected {lo}–{hi} {meta['unit']})")
    if meta.get("two_values"):
        if value2 is None:
            raise HTTPException(422, f"{meta['label']} needs both numbers, e.g. 130/85")
        lo2, hi2 = meta["plausible2"]
        if not lo2 <= value2 <= hi2 or value2 >= value:
            raise HTTPException(422, f"Diastolic {value2:g} looks wrong")


def _parse_when(s: str) -> datetime:
    s = s.strip()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d", "%d-%m-%Y %H:%M", "%d-%m-%Y", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    raise ValueError(f"bad date '{s}'")


@router.get("/profiles/{pid}/wellness")
def get_wellness(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    a = records.analyze(p)
    recent = sorted(p.vitals, key=lambda v: v.measured_at, reverse=True)[:30]
    return {
        "cards": a["wellness"],
        "alerts": [x for x in a["alerts"] if x["type"] == "wellness"],
        "kinds": catalog.wellness(),
        "recent": [{"id": v.id, "kind": v.kind, "value": v.value, "value2": v.value2, "context": v.context,
                    "measured_at": v.measured_at.isoformat(), "source": v.source, "note": v.note} for v in recent],
    }


@router.post("/profiles/{pid}/wellness")
def add_reading(pid: int, body: VitalIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    _validate(body.kind, body.value, body.value2)
    v = VitalReading(profile_id=p.id, kind=body.kind, value=body.value, value2=body.value2, context=body.context,
                     measured_at=body.measured_at or datetime.now(UTC), source="manual", note=body.note)
    db.add(v)
    db.commit()
    return {"id": v.id}


@router.post("/profiles/{pid}/wellness/import")
async def import_csv(pid: int, file: UploadFile = File(...), u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    """Import readings from a CSV (columns: date, kind, value, value2, context, note)."""
    p = security.owned_profile(pid, u, db)
    raw = await file.read()
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(413, "CSV must be under 2 MB")
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="replace")))
    added, errors = 0, []
    for i, row in enumerate(reader, start=2):
        try:
            kind = (row.get("kind") or "").strip().lower()
            value = float(row["value"])
            value2 = float(row["value2"]) if (row.get("value2") or "").strip() else None
            context = (row.get("context") or "").strip() or None
            _validate(kind, value, value2)
            db.add(VitalReading(profile_id=p.id, kind=kind, value=value, value2=value2,
                                context=context if context in ("fasting", "after_meal", "random") else None,
                                measured_at=_parse_when(row["date"]), source="csv", note=(row.get("note") or "").strip() or None))
            added += 1
        except (KeyError, ValueError, HTTPException) as e:
            errors.append(f"row {i}: {getattr(e, 'detail', None) or e}")
        if len(errors) > 50:
            break
    db.commit()
    return {"added": added, "errors": errors[:20]}


@router.get("/wellness/template.csv", response_class=PlainTextResponse)
def template():
    return PlainTextResponse(TEMPLATE, media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="doc-wellness-template.csv"'})


@router.delete("/wellness/{vid}")
def delete_reading(vid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    v = db.get(VitalReading, vid)
    if not v:
        raise HTTPException(404, "Not found")
    security.owned_profile(v.profile_id, u, db)
    db.delete(v)
    db.commit()
    return {"ok": True}
