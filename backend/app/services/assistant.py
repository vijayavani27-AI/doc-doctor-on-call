"""Ask-AI chat and plain-language explanations.

Chat is grounded: the model only sees the person's own records, each line tagged with an ID
([R12] result, [M3] medicine, [S1] symptom, [I:fib4] computed insight, [A:...] alert), and must
cite those IDs. A second "verifier" call checks every claim against the same records and
corrects or flags the answer. With no AI configured, a keyword-based offline answerer is used.
"""
from __future__ import annotations

import re
from datetime import date

from ..models import Profile
from . import ai, catalog, normalizer

LANGS = {"en": "English", "hi": "Hindi", "ta": "Tamil"}


# ---------------------------------------------------------------- context
def build_context(profile: Profile, analysis: dict) -> str:
    tests = catalog.tests()
    reports = {r.id: r for r in profile.reports}
    age = (date.today() - profile.dob).days // 365 if profile.dob else "unknown"
    lines = [f"PERSON: {profile.relation}, sex {profile.sex}, age {age}, conditions: {', '.join(profile.conditions or []) or 'none recorded'}", "", "LAB RESULTS:"]
    for r in sorted(profile.results, key=lambda x: (x.date or date.min)):
        if not r.confirmed:
            continue
        name = tests[r.test_code]["name"] if r.test_code in tests else r.test_name_raw
        rng = f"ref {r.ref_low if r.ref_low is not None else ''}-{r.ref_high if r.ref_high is not None else ''}"
        lab = reports[r.report_id].lab_name if r.report_id in reports else ""
        lines.append(f"[R{r.id}] {r.date} | {lab} | {name}: {r.value:g} {r.unit or ''} ({rng}) flag {r.flag or '-'}" if r.value is not None else f"[R{r.id}] {r.date} | {name}: {r.value_raw}")
    lines += ["", "MEDICINES:"]
    for m in profile.medications:
        lines.append(f"[M{m.id}] {m.brand} ({m.generic or '?'}) {m.dose or ''} {m.frequency or ''} started {m.start_date or '?'} {'active' if m.active else 'stopped'} reason: {m.reason or '-'}")
    lines += ["", "SYMPTOMS LOGGED:"]
    for s in profile.symptoms:
        lines.append(f"[S{s.id}] {s.onset_date} {s.label} (severity {s.severity}/3) {s.notes or ''}")
    lines += ["", "HOME / WELLNESS READINGS (summaries):"]
    for w in analysis.get("wellness", []):
        two = f"/{w['latest2']:g}" if w.get("latest2") is not None else ""
        avg = f", 30-day average {w['avg30']:g}{('/' + format(w['avg30_2'], 'g')) if w.get('avg30_2') else ''}" if w.get("avg30") is not None else ""
        lines.append(f"[V:{w['kind']}] {w['label']}: latest {w['latest']:g}{two} {w['unit']} on {w['latest_at'][:10]}{avg} ({w['count']} readings; target {w['target']})")
    lines += ["", "COMPUTED INSIGHTS (deterministic formulas, already verified):"]
    for r in analysis["hidden_risks"]:
        c = r["current"]
        srcs = " ".join(f"[R{i['result_id']}]" for i in c["inputs"] if i.get("result_id"))
        lines.append(f"[I:{r['id']}] {r['name']} = {c['value']} on {c['date']} -> {r['label']} ({r['status']}). {r['text']} Inputs: {srcs}")
    for d in analysis["drifts"]:
        lines.append(f"[I:drift-{d['code']}] {d['message']}")
    lines += ["", "ALERTS:"]
    for a in analysis["alerts"]:
        lines.append(f"[A:{a['id']}] ({a['level']}) {a['title']}: {a['text']}")
    return "\n".join(lines)


# ---------------------------------------------------------------- chat
_ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string", "description": "Plain-language answer. Put citation IDs like [R12] right after the facts they support."},
        "citations": {"type": "array", "items": {"type": "string"}, "description": "All IDs cited, e.g. R12, M3, I:fib4"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "see_doctor": {"type": "boolean", "description": "True if the person should discuss this with a doctor"},
        "follow_ups": {"type": "array", "items": {"type": "string"}, "description": "Up to 3 short follow-up questions the person could ask next"},
    },
    "required": ["answer", "citations", "confidence", "see_doctor", "follow_ups"],
    "additionalProperties": False,
}

_VERIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "supported": {"type": "boolean", "description": "True only if every factual claim is backed by the records"},
        "unsupported_claims": {"type": "array", "items": {"type": "string"}},
        "corrected_answer": {"type": "string", "description": "If not supported: the answer rewritten to keep only supported claims (same language, keep citations). Else empty string."},
    },
    "required": ["supported", "unsupported_claims", "corrected_answer"],
    "additionalProperties": False,
}


def _system(language: str) -> str:
    return f"""You are DOC, a health records assistant for Indian families. You help people understand their OWN medical records.

Rules:
- Use ONLY the records provided. Every fact about the person must cite the record ID it came from, e.g. "Your HbA1c was 7.6% in May 2026 [R41]".
- If the records do not contain the answer, say clearly that you don't know from the records. Never guess.
- Never diagnose, never change or stop medicines, never give doses. You may explain what results mean and suggest questions to ask a doctor.
- Computed insights ([I:...]) come from validated formulas; explain them, do not recalculate them.
- If something sounds urgent (critical values, chest pain, breathlessness), tell them to contact a doctor or emergency services now.
- Write for someone with no medical training: short sentences, everyday words, explain any medical term.
- Reply in {LANGS.get(language, 'English')}. Keep record IDs in square brackets unchanged."""


def chat(profile: Profile, analysis: dict, message: str, history: list[dict], language: str = "en") -> dict:
    context = build_context(profile, analysis)
    if ai.enabled():
        convo = "\n".join(f"{h['role'].upper()}: {h['content']}" for h in history[-6:])
        prompt = f"<records>\n{context}\n</records>\n\n<conversation>\n{convo}\n</conversation>\n\nQuestion: {message}"
        import time

        t0 = time.monotonic()
        res = ai.structured(_system(language), prompt, _ANSWER_SCHEMA, effort="medium", max_tokens=8000)
        if res:
            res["verified"] = None
            from .. import config

            # skip the second (checking) call if the AI is slow right now, so the person isn't kept waiting
            if config.AI_VERIFY_ANSWERS and time.monotonic() - t0 < 30:
                v = ai.structured(
                    "You are a strict medical fact-checker. Compare the ANSWER against the RECORDS. A claim is supported only if the records state it or it follows directly. "
                    "Advice to see a doctor and general explanations of what a test measures are fine.",
                    f"<records>\n{context}\n</records>\n\n<answer>\n{res['answer']}\n</answer>",
                    _VERIFY_SCHEMA, effort="low", max_tokens=4000)
                if v:
                    res["verified"] = bool(v["supported"])
                    if not v["supported"] and v.get("corrected_answer"):
                        res["answer"] = v["corrected_answer"]
                        res["corrected"] = True
                    res["unsupported_claims"] = v.get("unsupported_claims", [])
            res["mode"] = "ai"
            res["engine"] = ai.engine_label(ai.last_engine)
            res["citations"] = sorted(set(res.get("citations", [])) | set(re.findall(r"\[((?:R|M|S)\d+|I:[\w-]+|A:[\w:.-]+|V:\w+)\]", res["answer"])))
            return res
    return offline_chat(profile, analysis, message)


def offline_chat(profile: Profile, analysis: dict, message: str) -> dict:
    """Keyword answers so the demo works without an API key."""
    q = message.lower()
    tests = catalog.tests()
    found_codes = []
    for alias, code in normalizer.aliases_longest_first():
        if len(alias) >= 3 and re.search(rf"\b{re.escape(alias)}\b", q) and code not in found_codes:
            found_codes.append(code)
    keyword_codes = {"sugar": "HBA1C", "diabetes": "HBA1C", "kidney": "CREAT", "liver": "AST", "cholesterol": "LDL", "thyroid": "TSH", "anaemia": "HB", "anemia": "HB", "platelet": "PLT"}
    for k, c in keyword_codes.items():
        if k in q and c not in found_codes:
            found_codes.append(c)
    parts, cites = [], []
    risk_words = {"liver": ["fib4", "apri"], "kidney": ["egfr"], "thalass": ["mentzer"], "iron": ["mentzer"], "anaemia": ["mentzer"], "anemia": ["mentzer"],
                  "diabetes": ["tyg"], "insulin": ["tyg"], "risk": None, "hidden": None, "danger": None, "worry": None}
    wanted = set()
    for w, ids in risk_words.items():
        if w in q:
            wanted |= set(ids) if ids else {r["id"] for r in analysis["hidden_risks"] if r["status"] != "green"}
    for r in analysis["hidden_risks"]:
        if r["id"] in wanted:
            c = r["current"]
            src = " ".join(f"[R{i['result_id']}]" for i in c["inputs"] if i.get("result_id"))
            parts.append(f"{r['name']}: {c['value']} - {r['label']}. {r['text']} (calculated from {src}) [I:{r['id']}]")
            cites.append(f"I:{r['id']}")
    results = [r for r in profile.results if r.confirmed and r.value is not None]
    for code in found_codes[:3]:
        series = sorted((r for r in results if r.test_code == code), key=lambda r: r.date)
        if not series:
            parts.append(f"I could not find any {tests[code]['name']} result in your records.")
            continue
        last = series[-1]
        txt = f"Your latest {tests[code]['name']} is {last.value:g} {last.unit} on {last.date:%d %b %Y} [R{last.id}]"
        cites.append(f"R{last.id}")
        if len(series) > 1:
            first = series[0]
            direction = "up" if last.value > first.value else "down" if last.value < first.value else "unchanged"
            txt += f", {direction} from {first.value:g} in {first.date:%b %Y} [R{first.id}]"
            cites.append(f"R{first.id}")
        lo, hi = last.ref_low, last.ref_high
        status = "below the normal range" if last.flag == "L" else "above the normal range" if last.flag == "H" else "within the normal range"
        parts.append(txt + f". This is {status}" + (f" ({lo:g}-{hi:g})." if lo is not None and hi is not None else ".") + f" {tests[code]['simple']}")
    if any(w in q for w in ("medicine", "tablet", "drug", "pill", "medication")):
        meds = [m for m in profile.medications if m.active]
        parts.append("Current medicines: " + "; ".join(f"{m.brand} ({m.generic or '?'}) {m.frequency or ''} [M{m.id}]" for m in meds) + ".")
        cites += [f"M{m.id}" for m in meds]
    if not parts:
        parts.append("I can answer questions about your test results, trends, hidden risks and medicines, for example: "
                     "'Is my sugar improving?', 'How are my kidneys?', 'What hidden risks did you find?'. "
                     "(Running in offline mode: for free-form questions, add an Anthropic API key.)")
    return {"answer": "\n\n".join(parts), "citations": cites, "confidence": "high" if cites else "low",
            "see_doctor": any(r["status"] == "red" for r in analysis["hidden_risks"] if r["id"] in wanted),
            "follow_ups": ["What hidden risks did you find?", "How are my kidneys?", "Which test should I do next?"],
            "verified": None, "mode": "offline"}


# ---------------------------------------------------------------- explanations
_EXPLAIN_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string", "description": "One short sentence: what this means for the person"},
        "explanation": {"type": "string", "description": "3-5 short sentences in very simple words"},
        "what_to_do": {"type": "array", "items": {"type": "string"}, "description": "2-3 practical, safe next steps (no dosing)"},
        "check_understanding": {"type": "object", "properties": {
            "question": {"type": "string"}, "options": {"type": "array", "items": {"type": "string"}}, "answer_index": {"type": "integer"}},
            "required": ["question", "options", "answer_index"], "additionalProperties": False,
            "description": "A teach-back multiple-choice question with 3 options to check the person understood"},
    },
    "required": ["headline", "explanation", "what_to_do", "check_understanding"],
    "additionalProperties": False,
}

_cache: dict[tuple, dict] = {}


def explain(subject: str, facts: str, simple: str, language: str = "en") -> dict:
    key = (subject, facts, language)
    if key in _cache:
        return _cache[key]
    out = None
    if ai.enabled():
        out = ai.structured(
            f"You explain medical results to people with no medical training, in {LANGS.get(language, 'English')}, at a 6th-grade reading level. "
            "Be accurate, calm and kind. Never diagnose or give doses. Encourage talking to their doctor when something is abnormal.",
            f"Topic: {subject}\nFacts from the person's records:\n{facts}\n\nBackground: {simple}", _EXPLAIN_SCHEMA, effort="low", max_tokens=4000)
        if out:
            out["mode"] = "ai"
            out["engine"] = ai.engine_label(ai.last_engine)
    if not out:
        out = {"headline": subject, "explanation": f"{simple}\n\n{facts}",
               "what_to_do": ["Keep this report safe and bring it to your next doctor visit.", "Ask your doctor what this result means for you."],
               "check_understanding": None, "mode": "offline",
               "note": None if language == "en" else "Translation to Hindi/Tamil needs AI. Add an Anthropic API key to enable it."}
    _cache[key] = out
    return out
