"""Passwords (bcrypt), JWT sessions, TOTP two-factor auth, field encryption and login rate limiting."""
import io
import secrets
import time
from collections import defaultdict
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
import pyotp
import qrcode
import qrcode.image.svg
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import config
from .database import get_db
from .models import AuditLog, Profile, User

_fernet = Fernet(config.ENCRYPTION_KEY.encode())
_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------- encryption
def encrypt_bytes(data: bytes) -> bytes:
    return _fernet.encrypt(data)


def decrypt_bytes(token: bytes) -> bytes:
    return _fernet.decrypt(token)


def encrypt_str(s: str) -> str:
    return _fernet.encrypt(s.encode()).decode()


def decrypt_str(s: str) -> str:
    return _fernet.decrypt(s.encode()).decode()


# ---------------------------------------------------------------- passwords
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
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
def create_token(user_id: int, kind: str = "access", minutes: int | None = None) -> str:
    minutes = minutes or (config.ACCESS_TOKEN_MINUTES if kind == "access" else config.CHALLENGE_TOKEN_MINUTES)
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "typ": kind, "iat": now, "exp": now + timedelta(minutes=minutes), "jti": secrets.token_hex(8)}
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")


def decode_token(token: str, kind: str = "access") -> int:
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, please log in again") from None
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session") from None
    if payload.get("typ") != kind:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")
    return int(payload["sub"])


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    user = db.get(User, decode_token(creds.credentials))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def owned_profile(profile_id: int, user: User, db: Session) -> Profile:
    p = db.get(Profile, profile_id)
    if p is None or p.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return p


# ---------------------------------------------------------------- TOTP 2FA
def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="DOC - Doctor On Call")


def qr_svg_data_uri(text: str) -> str:
    img = qrcode.make(text, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf)
    import base64

    return "data:image/svg+xml;base64," + base64.b64encode(buf.getvalue()).decode()


def verify_totp(secret: str, code: str) -> bool:
    code = (code or "").replace(" ", "")
    return code.isdigit() and len(code) == 6 and pyotp.TOTP(secret).verify(code, valid_window=1)


def new_backup_codes(n: int = 8) -> tuple[list[str], list[str]]:
    plain = [f"{secrets.token_hex(2)}-{secrets.token_hex(2)}" for _ in range(n)]
    hashed = [bcrypt.hashpw(c.encode(), bcrypt.gensalt(rounds=10)).decode() for c in plain]
    return plain, hashed


def use_backup_code(user: User, code: str) -> bool:
    code = (code or "").strip().lower()
    remaining = list(user.backup_codes or [])
    for h in remaining:
        if bcrypt.checkpw(code.encode(), h.encode()):
            remaining.remove(h)
            user.backup_codes = remaining
            return True
    return False


# ---------------------------------------------------------------- rate limiting
class RateLimiter:
    """In-memory sliding window. Good enough for a single-instance deployment."""

    def __init__(self, max_attempts: int, window_seconds: int):
        self.max, self.window = max_attempts, window_seconds
        self.hits: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str):
        now = time.time()
        self.hits[key] = [t for t in self.hits[key] if now - t < self.window]
        if len(self.hits[key]) >= self.max:
            wait = int(self.window - (now - self.hits[key][0]))
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"Too many attempts. Try again in {wait // 60 + 1} minutes.")

    def hit(self, key: str):
        self.hits[key].append(time.time())

    def reset(self, key: str):
        self.hits.pop(key, None)


login_limiter = RateLimiter(5, 15 * 60)
otp_limiter = RateLimiter(5, 10 * 60)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def audit(db: Session, user_id: int | None, action: str, detail: str | None = None, request: Request | None = None):
    db.add(AuditLog(user_id=user_id, action=action, detail=detail, ip=client_ip(request) if request else None))
