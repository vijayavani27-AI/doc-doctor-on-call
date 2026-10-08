from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from .. import config, security
from ..database import get_db
from ..models import Profile, User
from ..services import ai, records

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(max_length=128)
    sex: str = Field(default="F", pattern="^[FM]$")


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class VerifyIn(BaseModel):
    challenge_token: str
    code: str


class CodeIn(BaseModel):
    code: str


class DisableIn(BaseModel):
    password: str
    code: str


class MeIn(BaseModel):
    name: str | None = None
    language: str | None = Field(default=None, pattern="^(en|hi|ta)$")


def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "language": u.language, "totp_enabled": u.totp_enabled,
            "backup_codes_left": len(u.backup_codes or []), "is_demo": u.email == config.DEMO_EMAIL, "ai_enabled": ai.enabled(), "ai_engine": ai.engine_label()}


def _session(u: User) -> dict:
    return {"access_token": security.create_token(u.id), "token_type": "bearer", "user": user_out(u)}


@router.post("/register")
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "An account with this email already exists")
    problems = security.password_problems(body.password)
    if problems:
        raise HTTPException(422, "Password needs " + ", ".join(problems))
    u = User(email=email, name=body.name.strip(), password_hash=security.hash_password(body.password))
    db.add(u)
    db.flush()
    db.add(Profile(user_id=u.id, name=u.name, relation="self", sex=body.sex, is_primary=True))
    security.audit(db, u.id, "register", None, request)
    db.commit()
    return _session(u)


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    key = f"{body.email.lower()}|{security.client_ip(request)}"
    security.login_limiter.check(key)
    u = db.query(User).filter(User.email == body.email.lower()).first()
    if not u or not security.verify_password(body.password, u.password_hash):
        security.login_limiter.hit(key)
        raise HTTPException(401, "Wrong email or password")
    security.login_limiter.reset(key)
    if u.totp_enabled:
        return {"requires_2fa": True, "challenge_token": security.create_token(u.id, "2fa")}
    security.audit(db, u.id, "login", "password", request)
    db.commit()
    return _session(u)


@router.post("/2fa/verify")
def verify_2fa(body: VerifyIn, request: Request, db: Session = Depends(get_db)):
    uid = security.decode_token(body.challenge_token, "2fa")
    security.otp_limiter.check(str(uid))
    u = db.get(User, uid)
    if not u or not u.totp_enabled or not u.totp_secret_enc:
        raise HTTPException(400, "Two-factor authentication is not enabled")
    secret = security.decrypt_str(u.totp_secret_enc)
    method = "totp"
    if not security.verify_totp(secret, body.code):
        if security.use_backup_code(u, body.code):
            method = "backup code"
        else:
            security.otp_limiter.hit(str(uid))
            raise HTTPException(401, "Invalid code")
    security.otp_limiter.reset(str(uid))
    security.audit(db, u.id, "login", f"password + {method}", request)
    db.commit()
    return _session(u)


@router.post("/2fa/setup")
def setup_2fa(u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    if u.totp_enabled:
        raise HTTPException(400, "Two-factor authentication is already on")
    secret = security.new_totp_secret()
    u.totp_secret_enc = security.encrypt_str(secret)
    db.commit()
    uri = security.totp_uri(secret, u.email)
    return {"secret": secret, "otpauth_uri": uri, "qr": security.qr_svg_data_uri(uri)}


@router.post("/2fa/enable")
def enable_2fa(body: CodeIn, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    if not u.totp_secret_enc:
        raise HTTPException(400, "Start setup first")
    security.otp_limiter.check(f"enable-{u.id}")
    if not security.verify_totp(security.decrypt_str(u.totp_secret_enc), body.code):
        security.otp_limiter.hit(f"enable-{u.id}")
        raise HTTPException(401, "That code didn't match. Check your phone's time is correct and try the newest code.")
    plain, hashed = security.new_backup_codes()
    u.totp_enabled, u.backup_codes = True, hashed
    security.audit(db, u.id, "2fa_enabled", None, request)
    db.commit()
    return {"backup_codes": plain, "user": user_out(u)}


@router.post("/2fa/disable")
def disable_2fa(body: DisableIn, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    if not u.totp_enabled:
        raise HTTPException(400, "Two-factor authentication is not on")
    if not security.verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Wrong password")
    if not (security.verify_totp(security.decrypt_str(u.totp_secret_enc), body.code) or security.use_backup_code(u, body.code)):
        raise HTTPException(401, "Invalid code")
    u.totp_enabled, u.totp_secret_enc, u.backup_codes = False, None, []
    security.audit(db, u.id, "2fa_disabled", None, request)
    db.commit()
    return {"user": user_out(u)}


@router.post("/2fa/backup-codes")
def regenerate_backup_codes(body: CodeIn, request: Request, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    if not u.totp_enabled or not security.verify_totp(security.decrypt_str(u.totp_secret_enc), body.code):
        raise HTTPException(401, "Invalid code")
    plain, hashed = security.new_backup_codes()
    u.backup_codes = hashed
    security.audit(db, u.id, "backup_codes_regenerated", None, request)
    db.commit()
    return {"backup_codes": plain}


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
    """One-click demo: logs into a shared demo account with a synthetic family (no 2FA)."""
    u = db.query(User).filter(User.email == config.DEMO_EMAIL).first()
    if u is None or not any(p.vitals for p in u.profiles):  # missing, or seeded before wellness data existed
        u = records.seed_demo(db)
    if u.totp_enabled:  # someone turned 2FA on for the shared demo; keep the demo open for others
        u.totp_enabled, u.totp_secret_enc, u.backup_codes = False, None, []
    security.audit(db, u.id, "login", "demo", request)
    db.commit()
    return _session(u)
