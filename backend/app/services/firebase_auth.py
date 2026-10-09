"""Verify Firebase ID tokens (Google / email sign-in) without a service-account key.

Firebase ID tokens are RS256 JWTs signed by Google. We check the signature against Google's
public keys, plus audience = project id, issuer, expiry and auth_time, as documented in
https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import jwt

from .. import config

JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
_jwks: jwt.PyJWKClient | None = None


class FirebaseTokenError(Exception):
    pass


@dataclass
class FirebaseIdentity:
    uid: str
    email: str | None
    email_verified: bool
    name: str | None
    provider: str | None


def enabled() -> bool:
    return config.AUTH_MODE == "firebase"


def looks_like_firebase(token: str) -> bool:
    try:
        h = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError:
        return False
    return h.get("alg") == "RS256" and "kid" in h


def verify(id_token: str) -> FirebaseIdentity:
    """Raises FirebaseTokenError if the token is not a valid, current token for our project."""
    global _jwks
    if not enabled():
        raise FirebaseTokenError("Firebase sign-in is not configured on this server")
    pid = config.FIREBASE_PROJECT_ID
    try:
        if _jwks is None:
            _jwks = jwt.PyJWKClient(JWKS_URL, cache_keys=True, lifespan=3600, timeout=10)
        key = _jwks.get_signing_key_from_jwt(id_token).key
        claims = jwt.decode(id_token, key, algorithms=["RS256"], audience=pid, issuer=f"https://securetoken.google.com/{pid}",
                            options={"require": ["exp", "iat", "sub", "aud", "iss"]}, leeway=30)
    except jwt.ExpiredSignatureError:
        raise FirebaseTokenError("Your sign-in has expired. Please sign in again.") from None
    except (jwt.InvalidTokenError, jwt.PyJWKClientError) as e:
        raise FirebaseTokenError(f"Invalid sign-in token ({type(e).__name__})") from None
    return identity_from_claims(claims)


def identity_from_claims(claims: dict) -> FirebaseIdentity:
    sub = claims.get("sub")
    if not sub or len(sub) > 128:
        raise FirebaseTokenError("Invalid sign-in token (subject)")
    if claims.get("auth_time", 0) > time.time() + 30:
        raise FirebaseTokenError("Invalid sign-in token (auth_time)")
    fb = claims.get("firebase") or {}
    return FirebaseIdentity(uid=sub, email=(claims.get("email") or "").lower() or None,
                            email_verified=bool(claims.get("email_verified")), name=claims.get("name"),
                            provider=fb.get("sign_in_provider"))
