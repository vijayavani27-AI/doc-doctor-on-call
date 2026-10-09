"""Sign-in. Production: Firebase (Google or email) -> our session token. Dev/tests: local email + password."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from .. import config, security
from ..database import get_db
from ..models import Profile, User
from ..services import ai, firebase_auth, records

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(max_length=128)
    sex: str = Field(default="F", pattern="^[FM]$")


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class FirebaseIn(BaseModel):
    id_token: str = Field(min_length=20, max_length=4096)
    name: str | None = Field(default=None, max_length=120)
    sex: str | None = Field(default=None, pattern="^[FM]$")


class MeIn(BaseModel):
    name: str | None = None
    language: str | None = Field(default=None, pattern="^(en|hi|ta)$")


def user_out(u: User) -> dict:
    primary = next((p for p in u.profiles if p.is_primary), None)
    return {"id": u.id, "email": u.email, "name": u.name, "language": u.language, "auth_provider": u.auth_provider or "local",
            "email_verified": bool(u.email_verified), "is_demo": u.email == config.DEMO_EMAIL or bool(u.is_demo),
            "profile_incomplete": bool(primary and primary.profile_incomplete),
            "ai_enabled": ai.enabled(), "ai_engine": ai.engine_label()}


def _session(u: User) -> dict:
    return {"access_token": security.create_token(u.id), "token_type": "bearer", "user": user_out(u)}


@router.get("/config")
def auth_config():
    """Public sign-in settings for the web app (Firebase web config is public by design)."""
    return {"mode": config.AUTH_MODE, "firebase": config.FIREBASE_WEB_CONFIG if config.AUTH_MODE == "firebase" else None}


@router.post("/firebase")
def firebase_login(body: FirebaseIn, request: Request, db: Session = Depends(get_db)):
    """Exchange a verified Firebase ID token (Google or email sign-in) for a DOC session."""
    key = security.client_ip(request)
    security.login_limiter.check(f"fb|{key}")
    try:
        ident = firebase_auth.verify(body.id_token)
    except firebase_auth.FirebaseTokenError as e:
        security.login_limiter.hit(f"fb|{key}")
        raise HTTPException(401, str(e)) from None
    u, created = security.upsert_firebase_user(db, ident, body.name, body.sex)
    security.audit(db, u.id, "register" if created else "login", f"firebase ({ident.provider or 'unknown'})", request)
    db.commit()
    db.refresh(u)
    return {**_session(u), "created": created}


def _local_only():
    if config.AUTH_MODE == "firebase":
        raise HTTPException(410, "Please use 'Continue with Google' or email sign-in")


@router.post("/register")
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    _local_only()
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "An account with this email already exists")
    problems = security.password_problems(body.password)
    if problems:
        raise HTTPException(422, "Password needs " + ", ".join(problems))
    u = User(email=email, name=body.name.strip(), password_hash=security.hash_password(body.password), auth_provider="local")
    db.add(u)
    db.flush()
    db.add(Profile(user_id=u.id, name=u.name, relation="self", sex=body.sex, is_primary=True))
    security.attach_pending_invites(db, u)
    security.audit(db, u.id, "register", None, request)
    db.commit()
    return _session(u)


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    _local_only()
    key = f"{body.email.lower()}|{security.client_ip(request)}"
    security.login_limiter.check(key)
    u = db.query(User).filter(User.email == body.email.lower()).first()
    if not u or not security.verify_password(body.password, u.password_hash):
        security.login_limiter.hit(key)
        raise HTTPException(401, "Wrong email or password")
    security.login_limiter.reset(key)
    security.audit(db, u.id, "login", "password", request)
    db.commit()
    return _session(u)


@router.get("/me")
def me(u: User = Depends(security.current_user)):
    return user_out(u)


@router.patch("/me")
def update_me(body: MeIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    if body.name:
        u.name = body.name.strip()
    if body.language:
        u.language = body.language
    db.commit()
    return user_out(u)


@router.post("/demo")
def demo_login(request: Request, db: Session = Depends(get_db)):
    """One-click demo: a shared account with a synthetic family (all data is_demo=true)."""
    u = db.query(User).filter(User.email == config.DEMO_EMAIL).first()
    if u is None or records.demo_outdated(u):
        u = records.seed_demo(db)
    security.audit(db, u.id, "login", "demo", request)
    db.commit()
    return _session(u)
