"""AI engine wrapper: Claude (Anthropic) and Gemini (Google), with automatic fallback.

All calls ask for JSON that matches a schema (structured outputs), so the rest of the app
never parses free text. Provider order comes from AI_PROVIDER (auto | claude | gemini); if one
provider fails (outage, rate limit, refusal) the next one is tried. If none is configured or all
fail, callers get `None` and fall back to the offline path.
"""
import base64
import json
import logging
import time

from .. import config

log = logging.getLogger("doc.ai")
_claude_client = None
_gemini_client = None
last_engine: str | None = None  # engine that produced the most recent successful answer
last_gemini_model: str | None = None


# ---------------------------------------------------------------- provider selection
def providers() -> list[str]:
    if config.AI_DISABLED:
        return []
    available = []
    if config.ANTHROPIC_CONFIGURED:
        available.append("claude")
    if config.GEMINI_API_KEY:
        available.append("gemini")
    if config.AI_PROVIDER in available:
        available.remove(config.AI_PROVIDER)
        available.insert(0, config.AI_PROVIDER)
    return available


def enabled() -> bool:
    return bool(providers())


def engine_label(provider: str | None = None) -> str | None:
    p = provider or (providers()[0] if providers() else None)
    if p == "claude":
        return f"Claude ({config.CLAUDE_MODEL})"
    if p == "gemini":
        return f"Gemini ({last_gemini_model if provider and last_gemini_model else config.GEMINI_MODELS[0]})"
    return None


def structured(system: str, content: list[dict] | str, schema: dict, effort: str = "medium",
               max_tokens: int = 16000) -> dict | None:
    """One model call that returns a dict matching `schema`, or None on any failure."""
    global last_engine
    for p in providers():
        result = _claude(system, content, schema, effort, max_tokens) if p == "claude" else _gemini(system, content, schema, max_tokens)
        if result is not None:
            last_engine = p
            return result
        log.info("%s gave no result; trying the next engine", p)
    return None


def _parse_json(text: str | None) -> dict | None:
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        log.warning("AI returned invalid JSON")
        return None


# ---------------------------------------------------------------- Claude
def _claude(system, content, schema, effort, max_tokens) -> dict | None:
    global _claude_client
    import anthropic

    if _claude_client is None:
        _claude_client = anthropic.Anthropic(timeout=config.AI_TOTAL_BUDGET_S, max_retries=1)
    try:
        response = _claude_client.beta.messages.create(
            model=config.CLAUDE_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": content}],
            output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
            # Server-side fallback: if a safety classifier declines, the API retries on a
            # recommended fallback model inside the same call.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.RateLimitError:
        log.warning("Claude rate limited")
        return None
    except anthropic.APIStatusError as e:
        log.warning("Claude API error %s: %s", e.status_code, e.message)
        return None
    except anthropic.APIConnectionError:
        log.warning("Claude unreachable")
        return None
    if response.stop_reason == "refusal":
        log.info("Claude declined the request (%s)", getattr(response.stop_details, "category", None))
        return None
    if response.stop_reason == "max_tokens":
        log.warning("Claude response hit max_tokens")
        return None
    return _parse_json(next((b.text for b in response.content if b.type == "text"), None))


# ---------------------------------------------------------------- Gemini
def _gemini_parts(content: list[dict] | str):
    from google.genai import types

    if isinstance(content, str):
        return [content]
    parts = []
    for block in content:
        kind = block.get("type")
        if kind == "text":
            parts.append(block["text"])
        elif kind in ("image", "document"):
            src = block["source"]
            mime = src.get("media_type") or ("application/pdf" if kind == "document" else "image/png")
            parts.append(types.Part.from_bytes(data=base64.b64decode(src["data"]), mime_type=mime))
    return parts


def _gemini(system, content, schema, max_tokens) -> dict | None:
    global _gemini_client, last_gemini_model
    from google import genai
    from google.genai import errors, types

    if _gemini_client is None:
        # per-request timeout so a stuck model can't hang the app
        _gemini_client = genai.Client(api_key=config.GEMINI_API_KEY, http_options=types.HttpOptions(timeout=config.AI_REQUEST_TIMEOUT_S * 1000))
    cfg = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_json_schema=schema,
        max_output_tokens=max_tokens,
    )
    parts = _gemini_parts(content)
    busy = []
    deadline = time.monotonic() + config.AI_TOTAL_BUDGET_S
    for model in config.GEMINI_MODELS:  # newest first; busy, rate-limited or retired models fall through
        if time.monotonic() > deadline:
            log.warning("Gemini time budget used up; giving up for this request")
            return None
        try:
            r = _gemini_client.models.generate_content(model=model, contents=parts, config=cfg)
        except errors.APIError as e:
            log.warning("Gemini %s error %s: %s", model, getattr(e, "code", "?"), str(e)[:160])
            if getattr(e, "code", None) in (400, 401, 403):
                return None  # bad key / bad request: another model won't help
            if getattr(e, "code", None) == 503:
                busy.append(model)
            continue
        except Exception as e:  # network problems
            log.warning("Gemini %s unreachable: %s", model, e)
            continue
        try:
            text = r.text
        except Exception:
            text = None
        if not text:
            log.info("Gemini %s returned no text (blocked or empty)", model)
            continue
        data = _parse_json(text)
        if data is not None:
            last_gemini_model = model
            return data
    if busy and time.monotonic() + 5 < deadline:  # every model was momentarily overloaded: one short retry
        time.sleep(2)
        try:
            r = _gemini_client.models.generate_content(model=busy[0], contents=parts, config=cfg)
            data = _parse_json(r.text)
            if data is not None:
                last_gemini_model = busy[0]
            return data
        except Exception as e:
            log.warning("Gemini retry failed: %s", str(e)[:120])
    return None
