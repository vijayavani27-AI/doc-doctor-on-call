"""Sessions, Firebase sign-in, field/file encryption, rate limiting and the audit log.

Sign-in is done by Firebase (Google or email). The browser sends us the Firebase ID token once;
we verify it and issue our own short session JWT. All authorization (who may see which profile)
is enforced here in backend code, never by the database or the client.
"""
import secrets
import time
from collections import defaultdict
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import config
from .database import get_db
from .models import AuditLog, FamilyLink, Profile, User
from .services import firebase_auth

_fernet = Fernet(config.ENCRYPTION_KEY.encode())
_bearer = HTTPBearer(auto_error=False)


def reload_keys():
    """Re-read the encryption key (it may be loaded from the database at start-up)."""
    global _fernet
    _fernet = Fernet(config.ENCRYPTION_KEY.encode())


# ---------------------------------------------------------------- encryption
def encrypt_bytes(data: bytes) -> bytes:
    return _fernet.encrypt(data)


def decrypt_bytes(token: bytes) -> bytes:
    return _fernet.decrypt(token)


def encrypt_str(s: str) -> str:
    return _fernet.encrypt(s.encode()).decode()


def decrypt_str(s: str) -> str:
    return _fernet.decrypt(s.encode()).decode()


# ---------------------------------------------------------------- passwords (local dev mode only)
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def password_problems(password: str) -> list[str]:
    problems = []
    if len(password) < 8:
        problems.append("at least 8 characters")
    if not any(c.isalpha() for c in password):
        problems.append("a letter")
    if not any(c.isdigit() for c in password):
        problems.append("a number")
    return problems


# ---------------------------------------------------------------- tokens
def create_token(user_id: int, kind: str = "access", minutes: int | None = None, **extra) -> str:
    minutes = minutes or (config.ACCESS_TOKEN_MINUTES if kind == "access" else config.CHALLENGE_TOKEN_MINUTES)
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "typ": kind, "iat": now, "exp": now + timedelta(minutes=minutes), "jti": secrets.token_hex(8), **extra}
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")


def decode_payload(token: str, kind: str = "access") -> dict:
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, please log in again") from None
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session") from None
    if payload.get("typ") != kind:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")
    return payload


def decode_token(token: str, kind: str = "access") -> int:
    return int(decode_payload(token, kind)["sub"])


def file_token(user_id: int, kind: str, obj_id: int, minutes: int = 5) -> str:
    """Short-lived signed URL token for one stored file (report or wound photo)."""
    return create_token(user_id, "file", minutes, obj=f"{kind}:{obj_id}")


# ---------------------------------------------------------------- accounts
def attach_pending_invites(db: Session, user: User):
    """Family requests sent to this email before the person had an account now reach them (still pending)."""
    if user.email:
        for link in db.query(FamilyLink).filter(FamilyLink.owner_email == user.email, FamilyLink.owner_id.is_(None)).all():
            link.owner_id = user.id


def upsert_firebase_user(db: Session, ident: firebase_auth.FirebaseIdentity, name: str | None = None, sex: str | None = None) -> tuple[User, bool]:
    """Find or create the DOC account for a verified Firebase identity. Returns (user, created)."""
    u = db.query(User).filter(User.firebase_uid == ident.uid).first()
    if u:
        if ident.email_verified and not u.email_verified:
            u.email_verified = True
        return u, False
    email = ident.email or f"{ident.uid}@users.firebase.local"
    u = db.query(User).filter(User.email == email).first()
    if u:
        if u.is_demo or u.email == config.DEMO_EMAIL:
            raise HTTPException(409, "This email is reserved")
        if not ident.email_verified:
            raise HTTPException(409, "An account with this email already exists. Sign in with Google, or verify your email first.")
        u.firebase_uid, u.auth_provider, u.email_verified = ident.uid, ident.provider, True  # verified email: safe to link
        return u, False
    display = (name or ident.name or email.split("@")[0]).strip()[:120] or "Me"
    u = User(email=email, name=display, password_hash="", firebase_uid=ident.uid, auth_provider=ident.provider,
             email_verified=ident.email_verified)
    db.add(u)
    db.flush()
    db.add(Profile(user_id=u.id, name=display, relation="self", sex=sex if sex in ("F", "M") else "F", is_primary=True,
                   profile_incomplete=sex not in ("F", "M")))
    attach_pending_invites(db, u)
    return u, True


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    token = creds.credentials
    if firebase_auth.enabled() and firebase_auth.looks_like_firebase(token):  # API clients may send the Firebase token directly
        try:
            ident = firebase_auth.verify(token)
        except firebase_auth.FirebaseTokenError as e:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from None
        user, created = upsert_firebase_user(db, ident)
        if created:
            db.commit()
        return user
    user = db.get(User, decode_token(token))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def owned_profile(profile_id: int, user: User, db: Session) -> Profile:
    p = db.get(Profile, profile_id)
    if p is None or p.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return p


def primary_profile(user: User, profile_id: int | None, db: Session) -> Profile:
    """The profile a spec-style endpoint acts on: ?profile_id=… (must be owned) or the account's own profile."""
    if profile_id is not None:
        return owned_profile(profile_id, user, db)
    p = next((x for x in user.profiles if x.is_primary), None) or (user.profiles[0] if user.profiles else None)
    if p is None:
        raise HTTPException(404, "No profile yet")
    return p


# ---------------------------------------------------------------- rate limiting
class RateLimiter:
    """In-memory sliding window. Good enough for a single-instance deployment."""

    def __init__(self, max_attempts: int, window_seconds: int, message: str | None = None):
        self.max, self.window, self.message = max_attempts, window_seconds, message
        self.hits: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str):
        now = time.time()
        self.hits[key] = [t for t in self.hits[key] if now - t < self.window]
        if len(self.hits[key]) >= self.max:
            wait = int(self.window - (now - self.hits[key][0])) + 1
            msg = self.message or "Too many attempts. Try again in {minutes} minutes."
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, msg.format(minutes=wait // 60 + 1, seconds=wait))

    def hit(self, key: str):
        self.hits[key].append(time.time())

    def reset(self, key: str):
        self.hits.pop(key, None)

    def take(self, key: str):
        self.check(key)
        self.hit(key)


login_limiter = RateLimiter(5, 15 * 60)
ai_limiter = RateLimiter(config.AI_RATE_PER_MIN, 60, "You're asking very quickly. Please wait {seconds} seconds and try again.")


def ai_rate_limit(u: User = Depends(current_user)) -> User:
    """Dependency for AI / heavy endpoints (chat, upload, scans): per-user limit."""
    ai_limiter.take(f"u{u.id}")
    return u


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def audit(db: Session, user_id: int | None, action: str, detail: str | None = None, request: Request | None = None,
          subject_user_id: int | None = None):
    db.add(AuditLog(user_id=user_id, action=action, detail=detail, ip=client_ip(request) if request else None,
                    subject_user_id=subject_user_id))
