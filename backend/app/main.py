"""DOC API. Run: uvicorn app.main:app --reload (from backend/)."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .database import init_db
from .routers import account, assistant, auth, doctor, insights, profiles, reports, wellness
from .services import ai

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    logging.getLogger("doc").info("AI engines: %s", " -> ".join(ai.engine_label(p) for p in ai.providers()) or "OFF - offline mode")
    yield


app = FastAPI(title="DOC API", version="1.0.0", lifespan=lifespan,
              description="AI health copilot: reads medical reports, finds hidden disease risks by combining them, and explains everything in simple words.")

app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; "
       "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; frame-src 'self' blob:; worker-src 'self'; "
       "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    else:
        response.headers.setdefault("Content-Security-Policy", CSP)
    return response


for r in (auth, profiles, reports, insights, doctor, assistant, account, wellness):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "ai_enabled": ai.enabled(), "ai_engines": ai.providers()}


# Serve the built React app (frontend/dist) when present, so one process runs everything.
if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        f = config.FRONTEND_DIST / path
        if path and f.is_file() and config.FRONTEND_DIST in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(config.FRONTEND_DIST / "index.html")
