"""App settings, read from environment variables (or backend/.env)."""
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
load_dotenv(BASE_DIR / ".env")

INSTANCE_DIR = Path(os.getenv("DOC_INSTANCE_DIR") or os.getenv("CARETHREAD_INSTANCE_DIR") or BASE_DIR / "instance")
INSTANCE_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = INSTANCE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"


def _persistent_secret(name: str, env_var: str, factory, legacy_env: str | None = None) -> str:
    """Use the env var if set, otherwise generate once and keep it in instance/."""
    value = os.getenv(env_var) or (os.getenv(legacy_env) if legacy_env else None)
    if value:
        return value
    path = INSTANCE_DIR / name
    if path.exists():
        return path.read_text().strip()
    value = factory()
    path.write_text(value)
    return value


def _fernet_key() -> str:
    from cryptography.fernet import Fernet

    return Fernet.generate_key().decode()


_db_file = INSTANCE_DIR / "doc.db"
if not _db_file.exists() and (INSTANCE_DIR / "carethread.db").exists():  # project was renamed DOC -> DOC
    try:
        (INSTANCE_DIR / "carethread.db").rename(_db_file)
    except OSError:
        _db_file = INSTANCE_DIR / "carethread.db"


def _db_url(url: str) -> str:
    """Accept Supabase / Heroku style URLs and use the psycopg 3 driver."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = _db_url(os.getenv("DATABASE_URL", "").strip() or f"sqlite:///{_db_file.as_posix()}")
IS_POSTGRES = DATABASE_URL.startswith("postgresql")
JWT_SECRET = _persistent_secret("jwt.secret", "JWT_SECRET", lambda: secrets.token_urlsafe(48))
ENCRYPTION_KEY = _persistent_secret("fernet.key", "DOC_ENCRYPTION_KEY", _fernet_key, legacy_env="CARETHREAD_ENCRYPTION_KEY")
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "720"))
CHALLENGE_TOKEN_MINUTES = 5
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))
CORS_ORIGINS = [o.strip() for o in (os.getenv("ALLOWED_ORIGINS") or os.getenv("CORS_ORIGINS") or "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
ALLOWED_UPLOAD_TYPES = ("image/jpeg", "image/png", "image/webp", "application/pdf")
MAX_PDF_PAGES = 4

# --- Auth: Firebase (Google + email sign-in). Without FIREBASE_PROJECT_ID the app falls back to
# local email + password accounts (for development and tests). These web-config values are public.
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "").strip()
FIREBASE_WEB_CONFIG = {
    "apiKey": os.getenv("FIREBASE_API_KEY", "").strip(),
    "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN", "").strip() or (f"{FIREBASE_PROJECT_ID}.firebaseapp.com" if FIREBASE_PROJECT_ID else ""),
    "projectId": FIREBASE_PROJECT_ID,
    "appId": os.getenv("FIREBASE_APP_ID", "").strip(),
}
AUTH_MODE = "firebase" if FIREBASE_PROJECT_ID and FIREBASE_WEB_CONFIG["apiKey"] else "local"

# --- Storage: Supabase Storage (private bucket) when configured, else encrypted files in instance/.
# Files are Fernet-encrypted before they leave this server either way; the browser never talks to Supabase.
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip() or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "health-files")
SUPABASE_STORAGE = bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)

# --- Own models
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "").strip()  # optional path to tesseract.exe
EMBED_DIM = 1024
AI_RATE_PER_MIN = int(os.getenv("AI_RATE_PER_MIN", "12"))

# --- AI engines ---
# AI turns on when a Claude or Gemini key is present. Without one the app runs in
# "offline mode": a rule-based report parser, template explanations and a keyword chat.
AI_DISABLED = os.getenv("AI_DISABLED", "").lower() in ("1", "true", "yes")
AI_PROVIDER = os.getenv("AI_PROVIDER", "auto").lower()  # auto | claude | gemini (auto = Claude first)
ANTHROPIC_CONFIGURED = bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-5-5")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
# Tried in order; busy (503) or unavailable models fall through to the next one.
GEMINI_MODELS = [m.strip() for m in os.getenv("GEMINI_MODEL", "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-flash-latest,gemini-3.1-flash-lite").split(",") if m.strip()]
AI_ENABLED = (ANTHROPIC_CONFIGURED or bool(GEMINI_API_KEY)) and not AI_DISABLED
AI_REQUEST_TIMEOUT_S = int(os.getenv("AI_REQUEST_TIMEOUT_S", "25"))  # one model call
AI_TOTAL_BUDGET_S = int(os.getenv("AI_TOTAL_BUDGET_S", "50"))  # all fallbacks for one request
# Images / scanned PDFs cannot be text-redacted, so sending them to the AI is opt-out.
AI_SEND_IMAGES = os.getenv("AI_SEND_IMAGES", "true").lower() in ("1", "true", "yes")
AI_VERIFY_ANSWERS = os.getenv("AI_VERIFY_ANSWERS", "true").lower() in ("1", "true", "yes")

DEMO_EMAIL = "demo@doconcall.app"
DEMO_PASSWORD = "Demo@12345"
