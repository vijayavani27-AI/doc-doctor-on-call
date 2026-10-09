"""Everyday features: medicine safety, meals + diet tips, wound photo check, home remedies, voice."""
import base64
import json
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import config, security
from ..database import get_db
from ..models import MealLog, User, WoundScan
from ..services import ai, flags, medsafety, nutrition, records, safety, storage, templates, wound

router = APIRouter(prefix="/api", tags=["features"])
IMAGE_TYPES = {"image/jpeg": b"\xff\xd8", "image/png": b"\x89PNG", "image/webp": b"RIFF"}


async def _read_image(file: UploadFile) -> tuple[bytes, str]:
    data = await file.read()
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"Photo is larger than {config.MAX_UPLOAD_MB} MB")
    mime = file.content_type or ""
    if mime not in IMAGE_TYPES or not data.startswith(IMAGE_TYPES[mime]):
        raise HTTPException(415, "Please upload a JPG, PNG or WEBP photo")
    return data, mime


def _latest_flags(p) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for r in sorted((r for r in p.results if r.confirmed and r.value is not None and r.test_code and r.date), key=lambda r: r.date):
        out[r.test_code] = {"value": r.value, "flag": flags.flag_for(r.test_code, r.value, r.ref_low, r.ref_high), "date": r.date.isoformat()}
    return out


# ================================================================ medicines
@router.get("/profiles/{pid}/medicines/active")
def active_medicines(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    return [{"id": m.id, "brand": m.brand, "generic": m.generic, "drug_class": m.drug_class, "dose": m.dose, "frequency": m.frequency,
             "start_date": m.start_date.isoformat() if m.start_date else None, "reason": m.reason, "is_demo": bool(m.is_demo)}
            for m in p.medications if m.active]


@router.get("/profiles/{pid}/medicines/safety")
def medicine_safety(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    latest = {k: v["flag"] for k, v in _latest_flags(p).items()}
    return medsafety.check([m for m in p.medications if m.active], latest)


# ================================================================ remedies
@lru_cache
def _remedies() -> dict:
    return json.loads((config.DATA_DIR / "remedies.json").read_text(encoding="utf-8"))


@router.get("/remedies")
def remedies(q: str | None = None):
    data = _remedies()
    items = data["items"]
    if q:
        ql = q.lower()
        items = [i for i in items if ql in i["title"].lower() or ql in i["key"] or ql in i.get("title_ta", "") or ql in i.get("summary", "").lower()]
    return {"items": items, "disclaimer": data["disclaimer"], "emergency": data["emergency"]}


@router.get("/remedies/{key}")
def remedy(key: str):
    item = next((i for i in _remedies()["items"] if i["key"] == key), None)
    if not item:
        raise HTTPException(404, "Not found")
    return {**item, "disclaimer": _remedies()["disclaimer"], "emergency": _remedies()["emergency"]}


# ================================================================ meals + diet
class MealItemIn(BaseModel):
    key: str
    servings: float = Field(default=1, gt=0, le=10)


class MealIn(BaseModel):
    meal_type: str = Field(default="meal", pattern="^(breakfast|lunch|dinner|snack|meal)$")
    items: list[MealItemIn] = Field(min_length=1, max_length=20)
    eaten_at: datetime | None = None
    note: str | None = Field(default=None, max_length=300)
    source: str = Field(default="manual", pattern="^(manual|text|photo)$")


class MealTextIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


def _meal_out(m: MealLog) -> dict:
    return {"id": m.id, "meal_type": m.meal_type, "eaten_at": m.eaten_at.isoformat(), "items": m.items, "totals": m.totals,
            "source": m.source, "note": m.note, "is_demo": bool(m.is_demo)}


@router.get("/foods")
def food_search(q: str = "", limit: int = Query(12, le=80)):
    return [{k: f[k] for k in ("key", "name", "name_ta", "name_hi", "serving", "kcal", "carbs_g", "protein_g", "fat_g", "fiber_g", "sodium_mg", "gi_band", "veg", "tags")}
            for f in nutrition.search(q, limit)]


@router.post("/meals/parse")
def meal_parse(body: MealTextIn):
    """Our own parser: '2 idli, sambar and a cup of tea' -> items with nutrition."""
    return nutrition.parse_text(body.text)


_SCAN_SCHEMA = {"type": "object", "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {
    "key": {"type": "string"}, "servings": {"type": "number"}, "confidence": {"type": "number"}}, "required": ["key", "servings", "confidence"],
    "additionalProperties": False}}}, "required": ["items"], "additionalProperties": False}


@router.post("/profiles/{pid}/meals/scan")
async def meal_scan(pid: int, file: UploadFile = File(...), u: User = Depends(security.ai_rate_limit), db: Session = Depends(get_db)):
    """Photo -> food items. Needs the optional AI boost (image recognition); without it, type the meal instead."""
    security.owned_profile(pid, u, db)
    data, mime = await _read_image(file)
    if not ai.enabled():
        raise HTTPException(503, "Photo recognition needs the AI boost, which is off on this server. Type what you ate instead (e.g. '2 idli, sambar').")
    keys = list(nutrition.foods())
    res = ai.structured(
        "You identify Indian foods in a meal photo. Only use keys from this list: " + ", ".join(keys) +
        ". servings = multiples of the standard serving. If unsure, use a lower confidence. Return no items if no food is visible.",
        [{"type": "image", "source": {"type": "base64", "media_type": mime, "data": base64.standard_b64encode(data).decode()}},
         {"type": "text", "text": "List the foods."}], _SCAN_SCHEMA, effort="low", max_tokens=2000)
    if res is None:
        raise HTTPException(503, "The AI is busy right now. Please type what you ate instead.")
    items = [nutrition.item(i["key"], round(max(0.25, min(5, i["servings"])), 2), round(min(1, max(0, i["confidence"])), 2))
             for i in res.get("items", []) if i.get("key") in nutrition.foods()]
    return {"items": items, "totals": nutrition.totals(items), "engine": ai.engine_label(ai.last_engine),
            "note": "Please check the items and portions before saving."}


@router.post("/profiles/{pid}/meals")
def log_meal(pid: int, body: MealIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    foods = nutrition.foods()
    bad = [i.key for i in body.items if i.key not in foods]
    if bad:
        raise HTTPException(422, f"Unknown food: {', '.join(bad)}")
    items = [nutrition.item(i.key, i.servings) for i in body.items]
    m = MealLog(profile_id=p.id, meal_type=body.meal_type, items=items, totals=nutrition.totals(items),
                eaten_at=body.eaten_at or datetime.now(UTC), source=body.source, note=body.note)
    db.add(m)
    db.commit()
    return _meal_out(m)


@router.get("/profiles/{pid}/meals")
def list_meals(pid: int, days: int = Query(7, ge=1, le=90), u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    since = datetime.now(UTC) - timedelta(days=days)
    rows = sorted((m for m in p.meals if (m.eaten_at if m.eaten_at.tzinfo else m.eaten_at.replace(tzinfo=UTC)) >= since),
                  key=lambda m: m.eaten_at, reverse=True)
    by_day: dict[str, dict] = {}
    for m in rows:
        d = m.eaten_at.date().isoformat()
        day = by_day.setdefault(d, {k: 0.0 for k in nutrition.NUM})
        for k in nutrition.NUM:
            day[k] = round(day[k] + (m.totals or {}).get(k, 0), 1)
    return {"items": [_meal_out(m) for m in rows], "by_day": [{"date": d, **v} for d, v in sorted(by_day.items(), reverse=True)]}


@router.delete("/meals/{mid}")
def delete_meal(mid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    m = db.get(MealLog, mid)
    if m is None:
        raise HTTPException(404, "Meal not found")
    security.owned_profile(m.profile_id, u, db)
    db.delete(m)
    db.commit()
    return {"ok": True}


@router.get("/profiles/{pid}/diet")
def diet(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    return nutrition.suggestions(p, _latest_flags(p), records.analyze(p)["wellness"], p.meals)


# ================================================================ wound photo check
def _wound_out(w: WoundScan) -> dict:
    return {"id": w.id, "label": w.label, "created_at": w.created_at.isoformat(), "metrics": w.metrics, "answers": w.answers,
            "result": w.result, "has_photo": bool(w.stored_name), "is_demo": bool(w.is_demo)}


@router.post("/profiles/{pid}/wounds")
async def wound_scan(pid: int, request: Request, file: UploadFile = File(...), label: str = Form("wound", max_length=80),
                     answers: str = Form("{}"), u: User = Depends(security.ai_rate_limit), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    data, mime = await _read_image(file)
    try:
        ans = json.loads(answers or "{}")
        if not isinstance(ans, dict):
            raise ValueError
    except ValueError:
        raise HTTPException(422, "answers must be a JSON object") from None
    try:
        metrics = wound.analyze_image(data)
    except Exception:  # noqa: BLE001
        raise HTTPException(422, "We couldn't read this photo. Please try another one.") from None
    result = wound.assess(metrics, ans, "diabetes" in (p.conditions or []), label)
    prev = max((w for w in p.wounds if w.label.lower() == label.lower()), key=lambda w: w.created_at, default=None)
    try:
        stored = storage.save(u.firebase_uid or f"u{u.id}", f"wound-{label}.jpg", data)
    except RuntimeError:
        stored = None
    w = WoundScan(profile_id=p.id, label=label.strip() or "wound", stored_name=stored, mime=mime, metrics=metrics, answers=ans, result=result)
    db.add(w)
    security.audit(db, u.id, "wound_scan", label, request)
    db.commit()
    out = _wound_out(w)
    if prev:
        out["compare"] = {"previous_id": prev.id, "previous_at": prev.created_at.isoformat(), **wound.compare(prev.metrics, metrics)}
    return out


@router.get("/profiles/{pid}/wounds")
def list_wounds(pid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    return [_wound_out(w) for w in sorted(p.wounds, key=lambda w: w.created_at, reverse=True)]


def _owned_wound(wid: int, u: User, db: Session) -> WoundScan:
    w = db.get(WoundScan, wid)
    if w is None:
        raise HTTPException(404, "Scan not found")
    security.owned_profile(w.profile_id, u, db)
    return w


@router.get("/wounds/{a}/compare/{b}")
def wound_compare(a: int, b: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    wa, wb = _owned_wound(a, u, db), _owned_wound(b, u, db)
    old, new = sorted((wa, wb), key=lambda w: w.created_at)
    return {"from": _wound_out(old), "to": _wound_out(new), **wound.compare(old.metrics, new.metrics)}


@router.get("/wounds/{wid}/file-url")
def wound_file_url(wid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    w = _owned_wound(wid, u, db)
    if not w.stored_name:
        raise HTTPException(404, "No photo stored")
    return {"url": f"/api/files/{security.file_token(u.id, 'wound', w.id)}", "expires_in": 300}


@router.delete("/wounds/{wid}")
def delete_wound(wid: int, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    w = _owned_wound(wid, u, db)
    storage.delete(w.stored_name)
    db.delete(w)
    db.commit()
    return {"ok": True}


# ================================================================ voice
VOICES = {"en": "en-IN", "hi": "hi-IN", "ta": "ta-IN"}
_TRANSCRIBE_SCHEMA = {"type": "object", "properties": {"text": {"type": "string"}, "language": {"type": "string", "enum": ["en", "hi", "ta"]}},
                      "required": ["text", "language"], "additionalProperties": False}


@router.post("/voice/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("en", pattern="^(en|hi|ta)$"),
                     u: User = Depends(security.ai_rate_limit)):
    """Speech -> text. The app first uses the phone/browser's own speech recognition (free, on-device where supported);
    this server endpoint is the optional AI-boost fallback for browsers without it."""
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "Recording is too long (max ~2 minutes)")
    mime = (file.content_type or "audio/webm").split(";")[0]
    if not mime.startswith("audio/"):
        raise HTTPException(415, "Please send an audio recording")
    if "gemini" not in ai.providers():
        raise HTTPException(503, "Server speech-to-text is off. Use the microphone button in Chrome or Edge, which works without it.")
    res = ai.structured(f"Transcribe the speech exactly. Expected language: {language}. Output the words only, in the original script.",
                        [{"type": "document", "source": {"type": "base64", "media_type": mime, "data": base64.standard_b64encode(data).decode()}},
                         {"type": "text", "text": "Transcribe."}], _TRANSCRIBE_SCHEMA, effort="low", max_tokens=2000, only=("gemini",))
    if not res:
        raise HTTPException(503, "Couldn't transcribe right now. Please type your question.")
    return {"text": res["text"].strip(), "language": res.get("language", language), "engine": ai.engine_label("gemini"),
            "urgent": safety.urgent_banner(text=res["text"], lang=language)}


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    language: str = Field(default="en", pattern="^(en|hi|ta)$")


@router.post("/voice/speak")
def speak(body: SpeakIn):
    """Text -> speech plan for the browser's built-in speech engine (no audio leaves the device).
    Citation tags like [R12] are removed and the text is split into short sentences."""
    import re

    clean = re.sub(r"\[(?:R|M|S|D|C)\d+\]|\[(?:I|A|V):[\w:.-]+\]", "", body.text)
    clean = re.sub(r"[*_#`]", "", clean)
    parts = [s.strip() for s in re.split(r"(?<=[.!?।])\s+", clean) if s.strip()]
    return {"engine": "browser-speechSynthesis", "voice_lang": VOICES[body.language], "rate": 0.95, "chunks": parts[:60]}


@router.get("/emergency")
def emergency_numbers(lang: str = Query("en", pattern="^(en|hi|ta)$")):
    return {"numbers": safety.EMERGENCY_NUMBERS + [safety.MENTAL_HEALTH], "message": templates.t("sos.call", lang)}

