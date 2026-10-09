"""Family consent: requesting never grants access; only the owner approves; revoke is instant; responses are filtered."""
import itertools

import pytest

_n = itertools.count()


def _user(client, name, sex="F"):
    email = f"{name.lower()}{next(_n)}@example.com"
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": "Secure123", "sex": sex})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"email": email, "h": {"Authorization": f"Bearer {tok}"}, "id": r.json()["user"]["id"]}


def _add_report(client, u):
    """Owner adds a confirmed report so there is something to protect."""
    pid = client.get("/api/profiles", headers=u["h"]).json()[0]["id"]
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=11)
    for line in ["City Lab", "Date: 10/06/2026", "HbA1c    6.4    %    4.0 - 5.6", "Fasting Blood Sugar    118    mg/dL    70 - 100"]:
        pdf.cell(0, 8, line, new_x="LMARGIN", new_y="NEXT")
    rep = client.post(f"/api/profiles/{pid}/reports", files={"file": ("r.pdf", bytes(pdf.output()), "application/pdf")}, headers=u["h"]).json()
    body = {"kind": "lab", "lab_name": "City Lab", "report_date": "2026-06-10",
            "tests": [{"test_name_raw": t["test_name_raw"], "value_raw": t["value_raw"], "unit_raw": t["unit_raw"], "test_code": t["test_code"]}
                      for t in rep["results"]]}
    assert client.post(f"/api/reports/{rep['id']}/confirm", json=body, headers=u["h"]).status_code == 200
    client.post(f"/api/profiles/{pid}/medicines", json={"brand": "Glycomet 500", "dose": "500 mg", "frequency": "1-0-1"}, headers=u["h"])
    return pid


@pytest.fixture()
def pair(client):
    owner, viewer = _user(client, "Amma"), _user(client, "Son", "M")
    _add_report(client, owner)
    r = client.post("/api/family/request", json={"email": owner["email"], "relation": "mother",
                                                 "permissions": {"records": True, "summary": True, "timeline": True, "medicines": True, "chat": True}},
                    headers=viewer["h"])
    assert r.status_code == 200 and r.json()["status"] == "pending"
    return owner, viewer, r.json()["link"]["id"]


def test_unapproved_user_cannot_read(client, pair):
    owner, viewer, link = pair
    for what in ("profile", "records", "timeline", "summary"):
        assert client.get(f"/api/family/{link}/{what}", headers=viewer["h"]).status_code == 403
    chat = client.post("/api/chat", json={"message": "How is her sugar?", "scope": f"family:{link}"}, headers=viewer["h"])
    assert chat.status_code == 403
    # a stranger (not the requester) cannot even see that the link exists
    stranger = _user(client, "Stranger")
    assert client.get(f"/api/family/{link}/records", headers=stranger["h"]).status_code == 404


def test_requester_cannot_self_approve(client, pair):
    owner, viewer, link = pair
    r = client.post(f"/api/family/{link}/respond", json={"approve": True}, headers=viewer["h"])
    assert r.status_code == 404  # only the owner can find / answer it
    assert client.put(f"/api/family/{link}/permissions", json={"permissions": {"records": True}}, headers=viewer["h"]).status_code == 404
    assert client.get(f"/api/family/{link}/records", headers=viewer["h"]).status_code == 403
    out = client.get("/api/family/outgoing", headers=viewer["h"]).json()
    assert out[0]["status"] == "pending" and not any(out[0]["permissions"].values())


def test_approved_read_is_filtered(client, pair):
    owner, viewer, link = pair
    inc = client.get("/api/family/incoming", headers=owner["h"]).json()
    assert inc[0]["id"] == link and inc[0]["status"] == "pending"
    # owner grants LESS than asked: summary + records, but no medicines / timeline / chat
    r = client.post(f"/api/family/{link}/respond", json={"approve": True, "permissions": {"summary": True, "records": True}}, headers=owner["h"])
    assert r.status_code == 200 and r.json()["status"] == "approved"
    recs = client.get(f"/api/family/{link}/records", headers=viewer["h"])
    assert recs.status_code == 200 and recs.json() and all(rep["medicines"] == [] for rep in recs.json())
    summ = client.get(f"/api/family/{link}/summary", headers=viewer["h"]).json()
    assert "medicines" not in summ and "wellness" not in summ and summ["disclaimer"]
    assert any(x["name"].startswith("HbA1c") or "A1c" in x["name"] for x in summ["latest"])
    assert client.get(f"/api/family/{link}/timeline", headers=viewer["h"]).status_code == 403
    assert client.post("/api/chat", json={"message": "sugar?", "scope": f"family:{link}"}, headers=viewer["h"]).status_code == 403
    prof = client.get(f"/api/family/{link}/profile", headers=viewer["h"]).json()["profile"]
    assert "dob" not in prof and "emergency_phone" not in prof
    # every access is in the OWNER's audit log too
    audit = client.get("/api/audit", headers=owner["h"]).json()
    assert any(a["action"] == "family_access" and a["by"] != "you" for a in audit)


def test_revoke_blocks_instantly(client, pair):
    owner, viewer, link = pair
    client.post(f"/api/family/{link}/respond", json={"approve": True, "permissions": {"summary": True, "records": True, "chat": True}}, headers=owner["h"])
    assert client.get(f"/api/family/{link}/summary", headers=viewer["h"]).status_code == 200
    ok = client.post("/api/chat", json={"message": "How is her sugar?", "scope": f"family:{link}"}, headers=viewer["h"])
    assert ok.status_code == 200 and ok.json()["scope"]["type"] == "family"
    assert client.post(f"/api/family/{link}/revoke", headers=owner["h"]).json()["status"] == "revoked"
    for what in ("summary", "records", "profile"):
        assert client.get(f"/api/family/{link}/{what}", headers=viewer["h"]).status_code == 403
    assert client.post("/api/chat", json={"message": "sugar?", "scope": f"family:{link}"}, headers=viewer["h"]).status_code == 403
    # a revoked link can't be re-approved by anyone; a fresh request starts pending again
    assert client.post(f"/api/family/{link}/respond", json={"approve": True}, headers=owner["h"]).status_code == 409


def test_permission_change_and_deny(client, pair):
    owner, viewer, link = pair
    client.post(f"/api/family/{link}/respond", json={"approve": True, "permissions": {"summary": True}}, headers=owner["h"])
    assert client.get(f"/api/family/{link}/records", headers=viewer["h"]).status_code == 403
    client.put(f"/api/family/{link}/permissions", json={"permissions": {"summary": True, "records": True}}, headers=owner["h"])
    assert client.get(f"/api/family/{link}/records", headers=viewer["h"]).status_code == 200
    client.put(f"/api/family/{link}/permissions", json={"permissions": {"summary": True}}, headers=owner["h"])
    assert client.get(f"/api/family/{link}/records", headers=viewer["h"]).status_code == 403
    # deny flow on a second request
    other = _user(client, "Cousin")
    r = client.post("/api/family/request", json={"email": owner["email"]}, headers=other["h"]).json()
    client.post(f"/api/family/{r['link']['id']}/respond", json={"approve": False}, headers=owner["h"])
    assert client.get(f"/api/family/{r['link']['id']}/summary", headers=other["h"]).status_code == 403


def test_request_to_unknown_email_waits_and_no_enumeration(client):
    asker = _user(client, "Asker")
    a = client.post("/api/family/request", json={"email": "nobody-yet-family@example.com"}, headers=asker["h"])
    assert a.status_code == 200 and a.json()["status"] == "pending"  # same answer as for an existing account
    assert client.post("/api/family/request", json={"email": "nobody-yet-family@example.com"}, headers=asker["h"]).status_code == 409
    assert client.post("/api/family/request", json={"email": asker["email"]}, headers=asker["h"]).status_code == 400
    # when that person signs up, the request reaches them, still pending (nothing shared)
    r = client.post("/api/auth/register", json={"name": "New", "email": "nobody-yet-family@example.com", "password": "Secure123"})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    inc = client.get("/api/family/incoming", headers=h).json()
    assert len(inc) == 1 and inc[0]["status"] == "pending"


def test_demo_family_links(client, demo):
    m = client.get("/api/family/members", headers=demo["h"]).json()
    assert any(x["person"]["name"].startswith("Sujitha") for x in m["i_can_view"])
    assert any(x["person"]["name"].startswith("Appa") for x in m["can_view_me"])
    link = next(x for x in m["i_can_view"] if x["person"]["name"].startswith("Sujitha"))
    assert link["is_demo"]
    s = client.get(f"/api/family/{link['id']}/summary", headers=demo["h"]).json()
    a1c = next(x for x in s["latest"] if "A1c" in x["name"])
    assert a1c["value"] == 6.2
    inc = client.get("/api/family/incoming", headers=demo["h"]).json()
    assert any(x["status"] == "pending" for x in inc)
