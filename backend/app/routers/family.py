"""Family sharing with explicit, revocable consent. All rules live in services/family.py."""
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import config, security
from ..database import get_db
from ..models import FamilyLink, User
from ..services import catalog, family, records, templates
from .profiles import profile_out
from .reports import _report_out, timeline_events

router = APIRouter(prefix="/api/family", tags=["family"])


class RequestIn(BaseModel):
    email: EmailStr
    relation: str = Field(default="family", max_length=40)
    message: str | None = Field(default=None, max_length=300)
    permissions: dict[str, bool] = Field(default_factory=lambda: {"summary": True, "records": True, "timeline": True})


class RespondIn(BaseModel):
    approve: bool
    permissions: dict[str, bool] | None = None  # what the owner actually grants (defaults to what was asked)
    profile_id: int | None = None  # which of the owner's profiles to share (default: their own)


class PermissionsIn(BaseModel):
    permissions: dict[str, bool]


def _owned_link(db: Session, link_id: int, u: User) -> FamilyLink:
    link = db.get(FamilyLink, link_id)
    if link is None or link.owner_id != u.id:
        raise HTTPException(404, "Family link not found")
    return link


@router.get("/permissions")
def permission_list():
    return family.PERMISSIONS


@router.post("/request")
def request_access(body: RequestIn, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    email = body.email.lower()
    if email == u.email:
        raise HTTPException(400, "You can't send a request to yourself")
    if email == config.DEMO_EMAIL:
        raise HTTPException(400, "The demo account can't be added")
    owner = db.query(User).filter(User.email == email).first()
    if owner is not None and owner.is_demo:
        raise HTTPException(400, "Demo family accounts can't receive requests")
    dup = db.query(FamilyLink).filter(FamilyLink.requester_id == u.id, FamilyLink.owner_email == email,
                                      FamilyLink.status.in_(family.ACTIVE)).first()
    if dup:
        raise HTTPException(409, f"You already have a {dup.status} request for this person")
    link = FamilyLink(requester_id=u.id, owner_id=owner.id if owner else None, owner_email=email, relation=body.relation.strip() or "family",
                      message=body.message, status="pending", requested_permissions=family.clean_permissions(body.permissions), permissions={})
    db.add(link)
    db.flush()
    security.audit(db, u.id, "family_request_sent", f"link {link.id}", request, subject_user_id=owner.id if owner else None)
    db.commit()
    # Same answer whether or not the email has an account (no account discovery); the request waits for them.
    return {"ok": True, "status": "pending", "link": family.link_out(link, u, db),
            "note": "They need to approve it in DOC (Family → Requests). Nothing is shared until they do."}


@router.get("/incoming")
def incoming(u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    rows = db.query(FamilyLink).filter(FamilyLink.owner_id == u.id).order_by(FamilyLink.created_at.desc()).all()
    return [family.link_out(x, u, db) for x in rows]


@router.get("/outgoing")
def outgoing(u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    rows = db.query(FamilyLink).filter(FamilyLink.requester_id == u.id).order_by(FamilyLink.created_at.desc()).all()
    return [family.link_out(x, u, db) for x in rows]


@router.get("/members")
def members(u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    rows = db.query(FamilyLink).filter(FamilyLink.status == "approved",
                                       or_(FamilyLink.requester_id == u.id, FamilyLink.owner_id == u.id)).all()
    return {"i_can_view": [family.link_out(x, u, db) for x in rows if x.requester_id == u.id],
            "can_view_me": [family.link_out(x, u, db) for x in rows if x.owner_id == u.id]}


@router.post("/{link_id}/respond")
def respond(link_id: int, body: RespondIn, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    link = _owned_link(db, link_id, u)  # only the owner; the requester gets 404 here (cannot self-approve)
    if link.status != "pending":
        raise HTTPException(409, f"This request is already {link.status}")
    link.responded_at = datetime.now(UTC)
    if body.approve:
        if body.profile_id is not None:
            security.owned_profile(body.profile_id, u, db)
        link.owner_profile_id = body.profile_id
        link.permissions = family.clean_permissions(body.permissions if body.permissions is not None else link.requested_permissions)
        link.status = "approved"
    else:
        link.status, link.permissions = "denied", {}
    security.audit(db, u.id, f"family_{link.status}", f"link {link.id}", request, subject_user_id=link.requester_id)
    db.commit()
    return family.link_out(link, u, db)


@router.put("/{link_id}/permissions")
def set_permissions(link_id: int, body: PermissionsIn, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    link = _owned_link(db, link_id, u)
    if link.status != "approved":
        raise HTTPException(409, f"This link is {link.status}")
    link.permissions = family.clean_permissions(body.permissions)
    security.audit(db, u.id, "family_permissions_changed", f"link {link.id}: " + ",".join(k for k, v in link.permissions.items() if v), request,
                   subject_user_id=link.requester_id)
    db.commit()
    return family.link_out(link, u, db)


@router.post("/{link_id}/revoke")
def revoke(link_id: int, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    """The owner revokes access, or the requester withdraws / leaves. Takes effect on the very next request."""
    link = db.get(FamilyLink, link_id)
    if link is None or u.id not in (link.owner_id, link.requester_id):
        raise HTTPException(404, "Family link not found")
    if link.status in ("revoked", "denied"):
        return family.link_out(link, u, db)
    link.status, link.permissions, link.revoked_at = "revoked", {}, datetime.now(UTC)
    other = link.requester_id if u.id == link.owner_id else link.owner_id
    security.audit(db, u.id, "family_revoked", f"link {link.id}", request, subject_user_id=other)
    db.commit()
    return family.link_out(link, u, db)


# ---------------------------------------------------------------- reading a family member's data
def _log(db, u: User, link: FamilyLink, what: str, request: Request):
    security.audit(db, u.id, "family_access", f"link {link.id}: {what}", request, subject_user_id=link.owner_id)
    db.commit()


@router.get("/{link_id}/profile")
def member_profile(link_id: int, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    link, p = family.require_access(db, link_id, u, None)
    perms = family.clean_permissions(link.permissions)
    _log(db, u, link, "profile", request)
    base = profile_out(p)
    keep = {"id", "name", "relation", "sex", "age", "color"}
    out = {k: v for k, v in base.items() if k in keep}
    if perms["summary"]:
        out["conditions"] = base.get("conditions", [])
    return {"link_id": link.id, "relation": link.relation, "permissions": perms, "profile": out}


@router.get("/{link_id}/records")
def member_records(link_id: int, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    link, p = family.require_access(db, link_id, u, "records")
    _log(db, u, link, "records", request)
    reps = sorted((r for r in p.reports if r.status == "confirmed"), key=lambda r: (r.report_date or date.min), reverse=True)
    perms = family.clean_permissions(link.permissions)
    out = []
    for r in reps:
        d = _report_out(r, full=True)
        d.pop("draft_medicines", None)
        d.pop("redactions", None)
        if not perms["medicines"]:
            d["medicines"], d["n_medicines"] = [], 0
        out.append(d)
    return out


@router.get("/{link_id}/timeline")
def member_timeline(link_id: int, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    link, p = family.require_access(db, link_id, u, "timeline")
    _log(db, u, link, "timeline", request)
    perms = family.clean_permissions(link.permissions)
    view = family.scoped_view(p, perms)
    return timeline_events(view, include_insights=perms["summary"])


@router.get("/{link_id}/summary")
def member_summary(link_id: int, request: Request, lang: str = "en", u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    link, p = family.require_access(db, link_id, u, "summary")
    _log(db, u, link, "summary", request)
    perms = family.clean_permissions(link.permissions)
    view = family.scoped_view(p, perms)
    a = records.analyze(view)
    tests = catalog.tests()
    latest = {}
    for r in sorted(view.results, key=lambda r: (r.date or date.min)):
        if r.confirmed and r.test_code in ("HBA1C", "FBG", "LDL", "CREAT", "HB", "TSH") and r.value is not None:
            latest[r.test_code] = {"name": tests[r.test_code]["name"], "value": r.value, "unit": r.unit, "date": r.date.isoformat(), "flag": r.flag}
    out = {"link_id": link.id, "name": p.name, "relation": link.relation, "permissions": perms,
           "hidden_risks": [{"id": r["id"], "name": r["name"], "hidden_condition": r["hidden_condition"], "status": r["status"],
                             "label": r["label"], "value": r["current"]["value"], "date": r["current"]["date"]} for r in a["hidden_risks"]],
           "alerts": [{"level": x["level"], "title": x["title"], "text": x["text"]} for x in a["alerts"]
                      if perms["medicines"] or x["type"] not in ("kidney_med", "monitoring", "cascade", "triple_whammy")][:8],
           "drifts": a["drifts"][:3], "latest": list(latest.values()), "score": a["score"], "disclaimer": templates.disclaimer(lang)}
    if perms["vitals"]:
        out["wellness"] = [{k: w.get(k) for k in ("kind", "label", "latest", "latest2", "unit", "latest_at", "avg30", "avg30_2", "status")} for w in a["wellness"]]
    if perms["medicines"]:
        out["medicines"] = [{"brand": m.brand, "generic": m.generic, "dose": m.dose, "frequency": m.frequency, "active": m.active}
                            for m in view.medications if m.active]
    return out
