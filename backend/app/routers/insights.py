"""Hidden Disease Finder, dashboard and medicine intelligence."""
import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import security
from ..database import get_db
from ..models import Medication, User
from ..services import catalog, extraction, records
from .profiles import profile_out
from .reports import _report_out

router = APIRouter(prefix="/api", tags=["insights"])


class MedIn(BaseModel):
    brand: str
    dose: str | None = None
    frequency: str | None = None
    start_date: date | None = None
    reason: str | None = None


class MedPatch(BaseModel):
    active: bool | None = None
    end_date: date | None = None
    dose: str | None = None
    frequency: str | None = None
    reason: str | None = None


@router.get("/profiles/{pid}/insights")
def insights(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    return records.analyze(security.owned_profile(pid, u, db))


@router.get("/profiles/{pid}/dashboard")
def dashboard(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    a = records.analyze(p)
    risks = a["hidden_risks"]
    metrics = []
    egfr = next((r for r in risks if r["id"] == "egfr"), None)
    for code in ("HBA1C", "LDL", "HB"):
        s = sorted((r for r in p.results if r.test_code == code and r.confirmed and r.value is not None), key=lambda r: r.date)
        if s:
            t = catalog.tests()[code]
            metrics.append({"code": code, "name": t["name"], "value": s[-1].value, "unit": t["unit"], "flag": s[-1].flag,
                            "date": s[-1].date.isoformat(), "spark": [x.value for x in s[-8:]]})
    if egfr:
        metrics.insert(1, {"code": "EGFR", "name": "Kidney score (eGFR)", "value": egfr["current"]["value"], "unit": "mL/min",
                           "flag": {"green": "N", "yellow": "L", "red": "L"}[egfr["status"]], "date": egfr["current"]["date"],
                           "spark": [h["value"] for h in egfr["history"][-8:]]})
    bp = next((w for w in a.get("wellness", []) if w["kind"] == "bp" and w.get("avg30")), None)
    if bp:
        metrics.insert(0, {"code": "BP", "name": "Home BP (30-day avg)", "value": bp["avg30"], "unit": "mmHg",
                           "display": f"{bp['avg30']:.0f}/{(bp.get('avg30_2') or 0):.0f}", "flag": "N" if bp["status"] == "green" else "H",
                           "date": bp["latest_at"][:10], "spark": [p["value"] for p in bp["points"][-12:]], "link": "/wellness"})
    actions = []
    for r in risks:
        if r["status"] == "red":
            actions.append({"level": "red", "title": f"{r['hidden_condition']}: {r['label']}", "text": r["next_step"], "link": "/risks"})
    for al in a["alerts"]:
        if al["level"] == "red" and len(actions) < 5:
            actions.append({"level": "red", "title": al["title"], "text": al.get("action") or al["text"], "link": "/medicines" if al["type"] in ("kidney_med", "monitoring", "iron") else "/alerts"})
    for n in a["next_tests"][:1]:
        actions.append({"level": "info", "title": f"Next best test: {n['name']} (~₹{n['price_inr']})",
                        "text": "; ".join(n["follow_ups"] + n["care_gaps"] + [f"unlocks {x}" for x in n["unlocks"]]), "link": "/risks"})
    recent = sorted(p.reports, key=lambda r: (r.report_date or date.min), reverse=True)[:3]
    return {"profile": profile_out(p), "score": a["score"], "actions": actions[:3], "alerts": a["alerts"][:6],
            "risks": [{"id": r["id"], "name": r["name"], "hidden_condition": r["hidden_condition"], "status": r["status"],
                       "label": r["label"], "value": r["current"]["value"], "organ": r["organ"],
                       "reports_combined": r["current"]["reports_combined"]} for r in risks],
            "drifts": a["drifts"][:3], "next_tests": a["next_tests"], "metrics": metrics,
            "recent_reports": [_report_out(r) for r in recent], "pending_reviews": sum(1 for r in p.reports if r.status == "review"),
            **_dashboard_extras(p, u, db)}


def _dashboard_extras(p, u: User, db: Session) -> dict:
    """Care plan, family requests and the code-rule urgent banner for the dashboard."""
    from sqlalchemy import or_

    from ..models import FamilyLink
    from ..services import safety
    from .care import due_items

    due = due_items(p)
    links = db.query(FamilyLink).filter(or_(FamilyLink.owner_id == u.id, FamilyLink.requester_id == u.id)).all()
    return {"urgent": safety.urgent_banner(p),
            "today": {"pending": due["pending"], "slots": due["slots"][:6], "checkups": due["checkups"][:3]},
            "family": {"pending_requests": sum(1 for x in links if x.owner_id == u.id and x.status == "pending"),
                       "i_can_view": sum(1 for x in links if x.requester_id == u.id and x.status == "approved"),
                       "can_view_me": sum(1 for x in links if x.owner_id == u.id and x.status == "approved")},
            "needs_review": sum(1 for r in p.results if not r.confirmed and r.confidence < 0.75)}


def _doses_per_day(freq: str | None) -> float:
    if not freq:
        return 1
    f = freq.lower()
    m = re.match(r"\s*([0-2½])\s*-\s*([0-2½])\s*-\s*([0-2½])", f)
    if m:
        return sum(0.5 if x == "½" else float(x) for x in m.groups()) or 1
    for k, v in {"qid": 4, "tds": 3, "tid": 3, "thrice": 3, "bd": 2, "twice": 2, "od": 1, "once": 1, "hs": 1, "night": 1}.items():
        if k in f:
            return v
    return 1


@router.get("/profiles/{pid}/medicines")
def medicines(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    a = records.analyze(p)
    gens = catalog.medicines()["generics"]
    brands = {extraction._clean_brand(b["brand"]): b for b in catalog.medicines()["brands"]}
    out, total_saving = [], 0.0
    for m in sorted(p.medications, key=lambda m: (not m.active, m.start_date or date.min)):
        gids, cls, _ = extraction.match_medicine(m.brand, m.generic)
        b = brands.get(extraction._clean_brand(m.brand))
        saving = None
        if b and m.active:
            per_day = _doses_per_day(m.frequency)
            saving = round((b["brand_price"] - b["generic_price"]) / 10 * per_day * 365)
            total_saving += max(saving, 0)
        related = [al for al in a["alerts"] if m.id in al.get("refs", [])]
        out.append({
            "id": m.id, "brand": m.brand, "generic": m.generic, "class": cls, "dose": m.dose, "frequency": m.frequency,
            "start_date": m.start_date.isoformat() if m.start_date else None, "active": m.active, "reason": m.reason,
            "report_id": m.report_id, "source_text": m.source_text,
            "use": " / ".join(sorted({gens[g]["use"] for g in gids if g in gens})) or None,
            "side_effects": sorted({catalog.symptoms().get(s, s) for g in gids if g in gens for s in gens[g]["side_effects"]}),
            "brand_price": b["brand_price"] if b else None, "generic_price": b["generic_price"] if b else None,
            "yearly_saving": saving, "alerts": related,
        })
    med_alerts = [al for al in a["alerts"] if al["type"] in ("kidney_med", "cascade", "side_effect", "monitoring", "iron")]
    return {"medicines": out, "yearly_saving_total": round(total_saving), "alerts": med_alerts,
            "symptom_options": [{"key": k, "label": v} for k, v in catalog.symptoms().items()],
            "price_note": "Prices are illustrative estimates. Ask your pharmacist or a Jan Aushadhi store for exact generic prices."}


@router.post("/profiles/{pid}/medicines")
def add_medicine(pid: int, body: MedIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    m = records.add_medication(db, p, None, body.brand, body.dose, body.frequency, body.start_date or date.today(), body.reason)
    db.commit()
    return {"id": m.id, "generic": m.generic, "matched": bool(m.drug_class)}


@router.patch("/medicines/{mid}")
def update_medicine(mid: int, body: MedPatch, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    m = db.get(Medication, mid)
    if not m:
        raise HTTPException(404, "Not found")
    security.owned_profile(m.profile_id, u, db)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    if body.active is False and not m.end_date:
        m.end_date = date.today()
    db.commit()
    return {"ok": True}


@router.delete("/medicines/{mid}")
def delete_medicine(mid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    m = db.get(Medication, mid)
    if not m:
        raise HTTPException(404, "Not found")
    security.owned_profile(m.profile_id, u, db)
    db.delete(m)
    db.commit()
    return {"ok": True}
