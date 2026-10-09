from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import security
from ..database import get_db
from ..models import LabResult, User
from ..services import assistant, catalog, family, rag, records, safety, templates

router = APIRouter(prefix="/api", tags=["assistant"])


class ChatTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=4000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = []
    language: str = Field(default="en", pattern="^(en|hi|ta)$")
    scope: str = Field(default="me", pattern=r"^(me|family:\d{1,9})$")


class ExplainIn(BaseModel):
    kind: str = Field(pattern="^(result|risk|drift)$")
    id: str
    language: str = Field(default="en", pattern="^(en|hi|ta)$")


def _answer(db: Session, u: User, p, body: ChatIn, request: Request) -> dict:
    """Grounded answer for the person's own profile, or (scope=family:<link>) for a family member who
    approved 'chat': only the sections they shared are retrieved or shown to the AI."""
    history = [h.model_dump() for h in body.history]
    if body.scope.startswith("family:"):
        link, owner_p = family.require_access(db, int(body.scope.split(":", 1)[1]), u, "chat")
        perms = family.clean_permissions(link.permissions)
        rag.ensure_index(db, owner_p, records.analyze(owner_p))
        hits = rag.search(db, owner_p, body.message, sections=family.sections_for(perms))
        view = family.scoped_view(owner_p, perms)
        res = assistant.chat(view, records.analyze(view), body.message, history, body.language, hits)
        security.audit(db, u.id, "family_access", f"link {link.id}: chat", request, subject_user_id=link.owner_id)
        db.commit()
        res["scope"] = {"type": "family", "link_id": link.id, "name": owner_p.name, "sections": sorted(family.sections_for(perms))}
        urgent = safety.urgent_banner(view, body.message, body.language)
    else:
        a = records.analyze(p)
        rag.ensure_index(db, p, a)
        hits = rag.search(db, p, body.message)
        res = assistant.chat(p, a, body.message, history, body.language, hits)
        res["scope"] = {"type": "me", "profile_id": p.id, "name": p.name}
        urgent = safety.urgent_banner(p, body.message, body.language)
    res["retrieved"] = [{"id": h["id"], "score": h["score"]} for h in hits]
    res["urgent"] = urgent
    if urgent:
        res["see_doctor"] = True
    res["disclaimer"] = templates.disclaimer(body.language)
    return res


@router.post("/profiles/{pid}/chat")
def chat(pid: int, body: ChatIn, request: Request, u: User = Depends(security.ai_rate_limit), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    return _answer(db, u, p, body, request)


@router.post("/chat")
def chat_spec(body: ChatIn, request: Request, profile_id: int | None = None, u: User = Depends(security.ai_rate_limit), db: Session = Depends(get_db)):
    p = security.primary_profile(u, profile_id, db)
    return _answer(db, u, p, body, request)


@router.post("/profiles/{pid}/explain")
def explain(pid: int, body: ExplainIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    tests = catalog.tests()
    if body.kind == "result":
        r = db.get(LabResult, int(body.id))
        if not r or r.profile_id != p.id:
            raise HTTPException(404, "Result not found")
        t = tests.get(r.test_code or "")
        name = t["name"] if t else r.test_name_raw
        status = {"H": "above the normal range", "L": "below the normal range", "N": "within the normal range"}.get(r.flag or "", "")
        facts = f"{name} = {r.value:g} {r.unit or ''} on {r.date} (normal range {r.ref_low}-{r.ref_high}); this is {status}."
        return assistant.explain(name, facts, t["simple"] if t else "", body.language)
    a = records.analyze(p)
    if body.kind == "risk":
        r = next((x for x in a["hidden_risks"] if x["id"] == body.id), None)
        if not r:
            raise HTTPException(404, "Insight not found")
        c = r["current"]
        facts = (f"{r['name']} = {c['value']} ({r['label']}). {r['text']} Calculated as {r['equation']} from: "
                 + "; ".join(f"{i['name']} {i['value']} {i['unit']} on {i['date']}" for i in c["inputs"]))
        if r.get("trend"):
            facts += f" It was {r['trend']['first']} on {r['trend']['first_date']}."
        return assistant.explain(f"{r['name']}: {r['hidden_condition']}", facts, r["simple"], body.language)
    d = next((x for x in a["drifts"] if x["code"] == body.id), None)
    if not d:
        raise HTTPException(404, "Trend not found")
    return assistant.explain(f"Silent trend in {d['name']}", d["message"], tests[d["code"]]["simple"], body.language)
