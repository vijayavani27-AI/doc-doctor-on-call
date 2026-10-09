"""Retrieval for grounded chat: index a person's facts as short chunks (with citation ids) and
fetch the most relevant ones for a question. Postgres uses pgvector + match_chunks(); SQLite
does the same cosine ranking in Python. Each chunk carries the permission `section` needed to
see it, so family members only ever retrieve what the owner allowed."""
from __future__ import annotations

import hashlib

from sqlalchemy import text as sql
from sqlalchemy.orm import Session

from .. import config
from ..models import Chunk, Profile
from . import catalog, embed

SECTIONS = ("records", "timeline", "summary", "vitals", "medicines")


def _signature(p: Profile) -> str:
    h = hashlib.sha256()
    for r in p.results:
        h.update(f"r{r.id}:{r.value}:{r.confirmed}:{r.test_code};".encode())
    for m in p.medications:
        h.update(f"m{m.id}:{m.active}:{m.dose};".encode())
    for g in getattr(p, "diagnoses", []):
        h.update(f"d{g.id}:{g.key};".encode())
    h.update(f"v{len(p.vitals)}:{max((v.id for v in p.vitals), default=0)};s{len(p.symptoms)};c{len(p.checkups)}".encode())
    return h.hexdigest()


def _facts(p: Profile, analysis: dict) -> list[tuple[str, str, str, str]]:
    """(source_type, citation id, section, text)"""
    tests = catalog.tests()
    reports = {r.id: r for r in p.reports}
    out = []
    for r in p.results:
        if not r.confirmed or r.value is None:
            continue
        t = tests.get(r.test_code or "", {})
        name = t.get("name", r.test_name_raw)
        rep = reports.get(r.report_id)
        flag = {"H": "high", "L": "low", "N": "normal"}.get(r.flag or "", "")
        aliases = " ".join(t.get("aliases", [])[:3])
        out.append(("result", f"R{r.id}", "records",
                    f"{name} ({aliases}) {r.value:g} {r.unit or ''} on {r.date} at {rep.lab_name if rep else ''}: {flag}. {t.get('category', '')}"))
    for rep in p.reports:
        if rep.kind == "prescription":
            meds = ", ".join(m.brand for m in rep.medications)
            out.append(("report", f"D{rep.id}", "records", f"Prescription by {rep.doctor_name or 'doctor'} on {rep.report_date}: {meds}"))
    for g in getattr(p, "diagnoses", []):
        out.append(("diagnosis", f"Dx{g.id}", "records", f"Diagnosis {g.name} ({g.name_raw or ''}) ICD-10 {g.icd10 or ''} "
                    f"{'past history' if g.status == 'history' else 'current'} recorded {g.diagnosed_on}"))
    for m in p.medications:
        out.append(("medicine", f"M{m.id}", "medicines",
                    f"Medicine tablet {m.brand} ({m.generic or ''}) {m.dose or ''} {m.frequency or ''} started {m.start_date} "
                    f"{'currently taking' if m.active else 'stopped'} for {m.reason or ''}"))
    for s in p.symptoms:
        out.append(("symptom", f"S{s.id}", "timeline", f"Symptom {s.label} since {s.onset_date} severity {s.severity}/3 {s.notes or ''}"))
    for w in analysis.get("wellness", []):
        avg = f", 30-day average {w['avg30']:g}" if w.get("avg30") is not None else ""
        out.append(("vital", f"V:{w['kind']}", "vitals", f"Home {w['label']} latest {w['latest']:g} {w['unit']} on {w['latest_at'][:10]}{avg}; target {w['target']}"))
    for r in analysis.get("hidden_risks", []):
        c = r["current"]
        out.append(("insight", f"I:{r['id']}", "summary",
                    f"Hidden risk {r['name']} {r['hidden_condition']} ({r['organ']}) = {c['value']} on {c['date']}: {r['label']}. {r['text']}"))
    for d in analysis.get("drifts", []):
        out.append(("insight", f"I:drift-{d['code']}", "summary", d["message"]))
    for c in p.checkups:
        state = f"done {c.done_date}" if c.done_date else f"due {c.due_date}"
        out.append(("checkup", f"C{c.id}", "timeline", f"Checkup {c.title} ({c.kind}) {state} {c.provider or ''}"))
    return out


def ensure_index(db: Session, p: Profile, analysis: dict) -> int:
    sig = _signature(p)
    if p.rag_signature == sig and p.chunks:
        return len(p.chunks)
    db.query(Chunk).filter(Chunk.profile_id == p.id).delete()
    facts = _facts(p, analysis)
    for st, sid, section, text in facts:
        db.add(Chunk(profile_id=p.id, source_type=st, source_id=sid, section=section, text=text[:1000], embedding=embed.embed(text)))
    p.rag_signature = sig
    db.commit()
    db.refresh(p)
    return len(facts)


def search(db: Session, p: Profile, query: str, k: int = 8, sections: set[str] | None = None) -> list[dict]:
    q = embed.embed(query)
    allowed = set(sections) if sections is not None else set(SECTIONS)
    from .. import database

    if config.IS_POSTGRES and database.PGVECTOR:
        rows = db.execute(sql("select m.id, m.source_type, m.source_id, m.text, m.similarity, c.section from match_chunks(cast(:q as vector), :pid, :k) m "
                              "join chunks c on c.id = m.id"), {"q": str(q), "pid": p.id, "k": k * 3}).all()
        hits = [{"id": r.source_id, "type": r.source_type, "text": r.text, "score": round(float(r.similarity), 4), "section": r.section} for r in rows]
    else:
        chunks = db.query(Chunk).filter(Chunk.profile_id == p.id).all()
        hits = sorted(({"id": c.source_id, "type": c.source_type, "text": c.text, "score": round(embed.cosine(q, c.embedding), 4), "section": c.section}
                       for c in chunks), key=lambda h: -h["score"])
    return [h for h in hits if h["section"] in allowed and h["score"] > 0.02][:k]

