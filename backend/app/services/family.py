"""Family consent rules, enforced in backend code on every request.

- Adding / requesting a member NEVER grants access. A link starts "pending".
- Only the data owner can approve, deny, change permissions or revoke (the requester can only leave).
- Revoked / denied / pending -> 403 immediately, on every endpoint, because access is re-checked per call.
- Client-supplied ids are never trusted: the link is looked up by id AND by the caller as requester.
- Responses are filtered by the owner's permission flags, and every access is written to the audit log
  (visible to both people).
"""
from __future__ import annotations

from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import FamilyLink, Profile, User

PERMISSIONS = {
    "records": "Lab reports and test values",
    "timeline": "Health timeline (reports, medicines, symptoms, checkups)",
    "summary": "Hidden-risk summary and alerts",
    "vitals": "Home readings (BP, sugar, weight, steps, sleep)",
    "medicines": "Current medicines",
    "chat": "Ask AI questions about this person (uses only the items above)",
}
ACTIVE = ("pending", "approved")


def clean_permissions(p: dict | None) -> dict[str, bool]:
    p = p or {}
    return {k: bool(p.get(k, False)) for k in PERMISSIONS}


def owner_profile(db: Session, link: FamilyLink) -> Profile:
    p = db.get(Profile, link.owner_profile_id) if link.owner_profile_id else None
    if p is None or p.user_id != link.owner_id:
        owner = db.get(User, link.owner_id) if link.owner_id else None
        p = next((x for x in owner.profiles if x.is_primary), None) if owner else None
        if p is None and owner and owner.profiles:
            p = owner.profiles[0]
    if p is None:
        raise HTTPException(404, "This person has no health profile yet")
    return p


def require_access(db: Session, link_id: int, user: User, permission: str | None) -> tuple[FamilyLink, Profile]:
    """The ONLY way family data is read. Raises 404 if the caller is not the requester, 403 if not allowed."""
    link = db.get(FamilyLink, link_id)
    if link is None or link.requester_id != user.id:
        raise HTTPException(404, "Family link not found")
    if link.status != "approved" or link.owner_id is None:
        raise HTTPException(403, f"Access is {link.status}. Only the account owner can approve access.")
    perms = clean_permissions(link.permissions)
    if permission and not perms.get(permission):
        raise HTTPException(403, f"{PERMISSIONS.get(permission, permission)}: not shared with you")
    return link, owner_profile(db, link)


def scoped_view(profile: Profile, perms: dict[str, bool]) -> SimpleNamespace:
    """A read-only, permission-filtered copy of a profile for analysis / chat (duck-types Profile)."""
    records = perms.get("records") or perms.get("summary")
    return SimpleNamespace(
        id=profile.id, name=profile.name, relation=profile.relation, sex=profile.sex, dob=profile.dob,
        height_cm=profile.height_cm, weight_kg=profile.weight_kg, conditions=profile.conditions if perms.get("summary") else [],
        reports=list(profile.reports) if records else [], results=list(profile.results) if records else [],
        medications=list(profile.medications) if perms.get("medicines") else [],
        symptoms=list(profile.symptoms) if perms.get("timeline") else [],
        vitals=list(profile.vitals) if perms.get("vitals") else [],
        checkups=list(profile.checkups) if perms.get("timeline") else [],
        chunks=[], rag_signature=None,
    )


def sections_for(perms: dict[str, bool]) -> set[str]:
    return {k for k in ("records", "timeline", "summary", "vitals", "medicines") if perms.get(k)}


def link_out(link: FamilyLink, viewer: User, db: Session) -> dict:
    other_id = link.owner_id if viewer.id == link.requester_id else link.requester_id
    other = db.get(User, other_id) if other_id else None
    return {"id": link.id, "direction": "outgoing" if viewer.id == link.requester_id else "incoming",
            "status": link.status, "relation": link.relation, "message": link.message,
            "person": {"name": other.name if other else None, "email": other.email if other else link.owner_email},
            "requested_permissions": clean_permissions(link.requested_permissions), "permissions": clean_permissions(link.permissions),
            "created_at": link.created_at.isoformat() if link.created_at else None,
            "responded_at": link.responded_at.isoformat() if link.responded_at else None,
            "revoked_at": link.revoked_at.isoformat() if link.revoked_at else None, "is_demo": bool(link.is_demo)}
