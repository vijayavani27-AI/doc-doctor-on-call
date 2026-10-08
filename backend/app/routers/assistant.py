from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import security
from ..database import get_db
from ..models import LabResult, User
from ..services import assistant, catalog, records

router = APIRouter(prefix="/api", tags=["assistant"])


class ChatTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=4000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = []
    language: str = Field(default="en", pattern="^(en|hi|ta)$")


class ExplainIn(BaseModel):
    kind: str = Field(pattern="^(result|risk|drift)$")
    id: str
    language: str = Field(default="en", pattern="^(en|hi|ta)$")


@router.post("/profiles/{pid}/chat")
def chat(pid: int, body: ChatIn, u: User = Depends(security.current_user), db: Session = Depends(get_db)):
    p = security.owned_profile(pid, u, db)
    return assistant.chat(p, records.analyze(p), body.message, [h.model_dump() for h in body.history], body.language)


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
