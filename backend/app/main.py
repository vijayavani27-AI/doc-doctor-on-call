"""DOC API. Run: uvicorn app.main:app --reload (from backend/)."""
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config
from .database import init_db
from .routers import (
    account,
    assistant,
    auth,
    care,
    doctor,
    family,
    features,
    insights,
    profiles,
    records_api,
    reports,
    wellness,
)
from .services import ai, ocr, storage


class JsonFormatter(logging.Formatter):
    """Structured logs. Never log request bodies, query strings, names, emails or health values (no PHI)."""

    def format(self, record: logging.LogRecord) -> str:
        out = {"t": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"), "level": record.levelname, "logger": record.name, "msg": record.getMessage()}
        out.update(getattr(record, "extra_fields", {}))
        if record.exc_info:
            out["exc"] = record.exc_info[0].__name__ if record.exc_info[0] else None
        return json.dumps(out)


_handler = logging.StreamHandler()
_handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler], force=True)
log = logging.getLogger("doc")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    storage.ensure_bucket()
    log.info("started", extra={"extra_fields": {
        "ai_engines": [ai.engine_label(p) for p in ai.providers()] or ["offline"], "auth": config.AUTH_MODE,
        "db": "postgres" if config.IS_POSTGRES else "sqlite", "storage": storage.backend_name(), "ocr": ocr.available()}})
    yield


app = FastAPI(title="DOC API", version="2.0.0", lifespan=lifespan,
              description="DOC (Doctor On Call): reads medical reports with our own OCR + parser, finds hidden disease risks by combining "
                          "them, and explains everything in simple words. Never diagnoses, never prescribes.")

app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"])


CSP = ("default-src 'self'; script-src 'self' https://apis.google.com https://www.gstatic.com; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; "
       "img-src 'self' data: blob: https://*.googleusercontent.com https://tile.openstreetmap.org; "
       "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://identitytoolkit.googleapis.com "
       "https://securetoken.googleapis.com https://www.googleapis.com https://overpass-api.de https://overpass.kumi.systems https://nominatim.openstreetmap.org; "
       "frame-src 'self' blob: https://*.firebaseapp.com https://accounts.google.com https://apis.google.com; worker-src 'self'; "
       "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")


_SLUGS = {400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed", 409: "conflict",
          410: "gone", 413: "payload_too_large", 415: "unsupported_media_type", 422: "unprocessable_entity", 429: "too_many_requests",
          500: "internal_error", 503: "service_unavailable"}


def _slug(status: int) -> str:
    if status in _SLUGS:
        return _SLUGS[status]
    try:
        return HTTPStatus(status).phrase.lower().replace(" ", "_").replace("-", "_")
    except ValueError:
        return "error"


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    return JSONResponse({"error": _slug(exc.status_code), "detail": exc.detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    detail = [{"loc": [str(x) for x in e.get("loc", [])], "msg": e.get("msg", "invalid")} for e in exc.errors()]
    return JSONResponse({"error": "validation_error", "detail": detail}, status_code=422)


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    rid = getattr(request.state, "request_id", "-")
    log.error("unhandled", exc_info=exc, extra={"extra_fields": {"request_id": rid, "error_type": type(exc).__name__}})
    return JSONResponse({"error": "internal_error", "detail": f"Something went wrong on our side. Please try again. (ref {rid})"}, status_code=500)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    rid = uuid.uuid4().hex[:12]
    request.state.request_id = rid
    t0 = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self)")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
        route = request.scope.get("route")
        log.info("request", extra={"extra_fields": {"request_id": rid, "method": request.method,
                                                    "route": getattr(route, "path", "unmatched"), "status": response.status_code,
                                                    "ms": round((time.perf_counter() - t0) * 1000)}})
    else:
        response.headers.setdefault("Content-Security-Policy", CSP)
    return response


for r in (auth, profiles, reports, records_api, insights, doctor, assistant, account, wellness, family, care, features):
    app.include_router(r.router)


@app.get("/api/health")
@app.get("/health", include_in_schema=False)
def health():
    return {"status": "ok", "version": app.version, "ai_enabled": ai.enabled(), "ai_engines": ai.providers(), "auth": config.AUTH_MODE,
            "database": "postgres" if config.IS_POSTGRES else "sqlite", "storage": storage.backend_name(), "ocr": ocr.available()}


# Serve the built React app (frontend/dist) when present, so one process runs everything.
if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"error": "not_found", "detail": "Not found"}, status_code=404)
        f = config.FRONTEND_DIST / path
        if path and f.is_file() and config.FRONTEND_DIST in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(config.FRONTEND_DIST / "index.html")
