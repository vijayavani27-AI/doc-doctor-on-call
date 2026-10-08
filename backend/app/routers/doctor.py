"""Doctor visit summary: JSON, printable PDF, and expiring share links."""
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import security
from ..database import get_db
from ..models import ShareLink, User
from ..services import records, summary

router = APIRouter(prefix="/api", tags=["doctor"])


class ShareIn(BaseModel):
    hours: int = Field(default=24, ge=1, le=168)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


@router.get("/profiles/{pid}/doctor-summary")
def doctor_summary(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    return summary.build(p, records.analyze(p))


@router.get("/profiles/{pid}/doctor-summary.pdf")
def doctor_summary_pdf(pid: int, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    data = summary.pdf_bytes(summary.build(p, records.analyze(p)))
    security.audit(db, u.id, "summary_exported", f"PDF for profile {p.id}", request)
    db.commit()
    fname = f"DOC-summary-{p.name.split(' ')[0]}.pdf"
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}"'})


@router.post("/profiles/{pid}/shares")
def create_share(pid: int, body: ShareIn, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    link = ShareLink(profile_id=p.id, token=secrets.token_urlsafe(24), expires_at=datetime.now(UTC) + timedelta(hours=body.hours))
    db.add(link)
    security.audit(db, u.id, "share_created", f"profile {p.id}, {body.hours}h", request)
    db.commit()
    return {"id": link.id, "token": link.token, "expires_at": link.expires_at.isoformat()}


@router.get("/profiles/{pid}/shares")
def list_shares(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    now = datetime.now(UTC)
    return [{"id": s.id, "token": s.token, "expires_at": _aware(s.expires_at).isoformat(), "views": s.views,
             "active": not s.revoked and _aware(s.expires_at) > now, "revoked": s.revoked}
            for s in sorted(p.shares, key=lambda s: s.created_at, reverse=True)]


@router.delete("/shares/{sid}")
def revoke_share(sid: int, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    s = db.get(ShareLink, sid)
    if not s:
        raise HTTPException(404, "Not found")
    security.owned_profile(s.profile_id, u, db)
    s.revoked = True
    security.audit(db, u.id, "share_revoked", f"link {s.id}", request)
    db.commit()
    return {"ok": True}


@router.get("/public/share/{token}")
def public_share(token: str, request: Request, db: Session = Depends(get_db)):
    s = db.query(ShareLink).filter(ShareLink.token == token).first()
    if not s or s.revoked or _aware(s.expires_at) < datetime.now(UTC):
        raise HTTPException(404, "This link has expired or was revoked")
    s.views += 1
    security.audit(db, s.profile.user_id, "share_viewed", f"link {s.id}", request)
    db.commit()
    data = summary.build(s.profile, records.analyze(s.profile), include_name=False)
    data["expires_at"] = _aware(s.expires_at).isoformat()
    return data
