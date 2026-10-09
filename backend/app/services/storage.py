"""File storage. Every file is Fernet-encrypted on this server first, then kept either in a private
Supabase Storage bucket (path {uid}/{uuid}-{filename}) or, without Supabase, in instance/uploads.

The browser never talks to Supabase: it gets a short-lived signed URL to *our* API, which checks
the signature, fetches, decrypts and streams the file.

Stored reference format:  "sb:<bucket path>"  for Supabase, or  "<uuid>.bin"  for local files.
"""
from __future__ import annotations

import logging
import re
import uuid

import httpx

from .. import config, security

log = logging.getLogger("doc.storage")
_bucket_ready = False


def _headers(extra: dict | None = None) -> dict:
    return {"Authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}", "apikey": config.SUPABASE_SERVICE_KEY, **(extra or {})}


def _safe_name(filename: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", filename or "file").strip("._") or "file"
    return name[-80:]


def ensure_bucket():
    """Create the private bucket if it does not exist yet (idempotent)."""
    global _bucket_ready
    if _bucket_ready or not config.SUPABASE_STORAGE:
        return
    try:
        r = httpx.post(f"{config.SUPABASE_URL}/storage/v1/bucket", headers=_headers({"Content-Type": "application/json"}),
                       json={"id": config.SUPABASE_BUCKET, "name": config.SUPABASE_BUCKET, "public": False,
                             "file_size_limit": config.MAX_UPLOAD_MB * 1024 * 1024 * 2}, timeout=15)
        if r.status_code in (200, 201) or "already exists" in r.text.lower() or r.status_code == 409:
            _bucket_ready = True
        else:
            log.warning("bucket check failed: HTTP %s", r.status_code)
    except httpx.HTTPError as e:
        log.warning("bucket check failed: %s", type(e).__name__)


def save(owner_key: str, filename: str, data: bytes) -> str:
    blob = security.encrypt_bytes(data)
    if config.SUPABASE_STORAGE:
        ensure_bucket()
        path = f"{re.sub(r'[^A-Za-z0-9_-]', '', owner_key)[:64] or 'u'}/{uuid.uuid4().hex}-{_safe_name(filename)}.enc"
        for attempt in range(2):
            try:
                r = httpx.post(f"{config.SUPABASE_URL}/storage/v1/object/{config.SUPABASE_BUCKET}/{path}",
                               headers=_headers({"Content-Type": "application/octet-stream", "x-upsert": "false"}), content=blob, timeout=30)
                if r.status_code in (200, 201):
                    return f"sb:{path}"
                log.warning("upload failed: HTTP %s", r.status_code)
            except httpx.HTTPError as e:
                log.warning("upload attempt %d failed: %s", attempt + 1, type(e).__name__)
        raise RuntimeError("Could not save the file to cloud storage. Please try again.")
    name = f"{uuid.uuid4().hex}.bin"
    (config.UPLOAD_DIR / name).write_bytes(blob)
    return name


def load(ref: str) -> bytes:
    if ref.startswith("sb:"):
        r = httpx.get(f"{config.SUPABASE_URL}/storage/v1/object/{config.SUPABASE_BUCKET}/{ref[3:]}", headers=_headers(), timeout=30)
        if r.status_code != 200:
            raise FileNotFoundError(ref)
        return security.decrypt_bytes(r.content)
    path = config.UPLOAD_DIR / ref
    if not path.is_file() or path.resolve().parent != config.UPLOAD_DIR.resolve():
        raise FileNotFoundError(ref)
    return security.decrypt_bytes(path.read_bytes())


def delete(ref: str | None):
    if not ref:
        return
    if ref.startswith("sb:"):
        try:
            httpx.request("DELETE", f"{config.SUPABASE_URL}/storage/v1/object/{config.SUPABASE_BUCKET}",
                          headers=_headers({"Content-Type": "application/json"}), json={"prefixes": [ref[3:]]}, timeout=15)
        except httpx.HTTPError as e:
            log.warning("delete failed: %s", type(e).__name__)
        return
    (config.UPLOAD_DIR / ref).unlink(missing_ok=True)


def backend_name() -> str:
    return "supabase" if config.SUPABASE_STORAGE else "local-encrypted"
