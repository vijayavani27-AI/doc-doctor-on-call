import io

from fpdf import FPDF


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ------------------------------------------------------------ Hidden Disease Finder on the demo family
def test_demo_hidden_risks_lakshmi(client, demo):
    pid = demo["profiles"]["Lakshmi"]["id"]
    a = client.get(f"/api/profiles/{pid}/insights", headers=demo["h"]).json()
    risks = {r["id"]: r for r in a["hidden_risks"]}
    fib4 = risks["fib4"]
    assert fib4["status"] == "red" and abs(fib4["current"]["value"] - 2.93) < 0.02
    # combined from two different labs / reports
    assert fib4["current"]["reports_combined"] == 2 and len(fib4["current"]["labs_combined"]) == 2
    assert [h["value"] for h in fib4["history"]] == sorted(h["value"] for h in fib4["history"])  # worsening
    egfr = risks["egfr"]
    assert egfr["status"] == "red" and "Rapid decline" in egfr["label"]
    assert egfr["current"]["all_inputs_normal"]  # creatinine looked normal on the report
    types = {al["type"] for al in a["alerts"]}
    assert {"cascade", "kidney_med", "monitoring", "care_gap", "side_effect"} <= types
    assert any(al["id"] == "triple-whammy" for al in a["alerts"])
    assert any(d["code"] == "PLT" for d in a["drifts"])
    assert a["next_tests"][0]["panel"] == "UACR"


def test_demo_hidden_risks_priya(client, demo):
    pid = demo["profiles"]["Priya"]["id"]
    a = client.get(f"/api/profiles/{pid}/insights", headers=demo["h"]).json()
    risks = {r["id"]: r for r in a["hidden_risks"]}
    assert risks["mentzer"]["status"] == "red"
    assert risks["tyg"]["status"] == "red"  # insulin resistance with "normal" fasting sugar 97
    assert any(al["type"] == "iron" and al["level"] == "red" for al in a["alerts"])
    assert any(al["type"] == "repeat" for al in a["alerts"])
    assert "HB_ELECTRO" in [n["panel"] for n in a["next_tests"]]


def test_dashboard_trends_timeline_meds(client, demo):
    pid = demo["profiles"]["Lakshmi"]["id"]
    d = client.get(f"/api/profiles/{pid}/dashboard", headers=demo["h"]).json()
    assert d["score"]["value"] < 50 and d["actions"]
    t = client.get(f"/api/profiles/{pid}/trends", headers=demo["h"]).json()
    plt = next(s for s in t["series"] if s["code"] == "PLT")
    assert [p["value"] for p in plt["points"]] == [260, 210, 180, 155]  # 4 labs, 4 unit styles, one scale
    assert plt["lab_changes"]
    tl = client.get(f"/api/profiles/{pid}/timeline", headers=demo["h"]).json()
    assert {"report", "medicine", "symptom", "insight"} <= {e["type"] for e in tl}
    m = client.get(f"/api/profiles/{pid}/medicines", headers=demo["h"]).json()
    assert m["yearly_saving_total"] > 0


def test_doctor_summary_pdf_and_share(client, demo):
    pid = demo["profiles"]["Lakshmi"]["id"]
    s = client.get(f"/api/profiles/{pid}/doctor-summary", headers=demo["h"]).json()
    assert s["risks"] and s["questions"]
    pdf = client.get(f"/api/profiles/{pid}/doctor-summary.pdf", headers=demo["h"])
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    link = client.post(f"/api/profiles/{pid}/shares", json={"hours": 24}, headers=demo["h"]).json()
    pub = client.get(f"/api/public/share/{link['token']}")
    assert pub.status_code == 200 and pub.json()["patient"]["name"] == "Lakshmi"  # first name only
    client.delete(f"/api/shares/{link['id']}", headers=demo["h"])
    assert client.get(f"/api/public/share/{link['token']}").status_code == 404


def test_offline_chat_cites_records(client, demo):
    pid = demo["profiles"]["Lakshmi"]["id"]
    r = client.post(f"/api/profiles/{pid}/chat", json={"message": "How are my kidneys?"}, headers=demo["h"]).json()
    assert r["mode"] == "offline" and r["citations"] and "[R" in r["answer"]


# ------------------------------------------------------------ auth (local dev mode + Firebase exchange)
def test_register_login_local_mode(client):
    assert client.get("/api/auth/config").json()["mode"] == "local"
    r = client.post("/api/auth/register", json={"name": "Asha", "email": "asha@example.com", "password": "short"})
    assert r.status_code == 422 and r.json()["error"] == "unprocessable_entity"
    r = client.post("/api/auth/register", json={"name": "Asha", "email": "asha@example.com", "password": "Secure123"})
    assert r.status_code == 200
    ok = client.post("/api/auth/login", json={"email": "asha@example.com", "password": "Secure123"})
    assert ok.status_code == 200 and ok.json()["user"]["email"] == "asha@example.com"
    assert client.get("/api/auth/me", headers=_auth("not-a-token")).status_code == 401


def test_firebase_sign_in_exchange(client, monkeypatch):
    from app import config
    from app.services import firebase_auth

    monkeypatch.setattr(config, "AUTH_MODE", "firebase")
    seen = {}

    def fake_verify(token):
        seen["token"] = token
        if token == "x" * 30:
            raise firebase_auth.FirebaseTokenError("Invalid sign-in token")
        return firebase_auth.FirebaseIdentity(uid="fb-uid-123", email="gita@gmail.com", email_verified=True, name="Gita", provider="google.com")

    monkeypatch.setattr(firebase_auth, "verify", fake_verify)
    assert client.post("/api/auth/firebase", json={"id_token": "x" * 30}).status_code == 401
    r = client.post("/api/auth/firebase", json={"id_token": "y" * 40, "sex": "F"})
    assert r.status_code == 200 and r.json()["created"] and r.json()["user"]["auth_provider"] == "google.com"
    again = client.post("/api/auth/firebase", json={"id_token": "y" * 40}).json()
    assert not again["created"] and again["user"]["id"] == r.json()["user"]["id"]  # same account, no duplicate
    # local password endpoints are switched off in Firebase mode
    assert client.post("/api/auth/login", json={"email": "gita@gmail.com", "password": "Secure123"}).status_code == 410
    me = client.get("/api/me", headers=_auth(again["access_token"])).json()
    assert me["profile"]["sex"] == "F" and not me["profile"]["profile_incomplete"]


def test_login_rate_limit(client):
    client.post("/api/auth/register", json={"name": "Ravi", "email": "ravi@example.com", "password": "Secure123"})
    for _ in range(5):
        assert client.post("/api/auth/login", json={"email": "ravi@example.com", "password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "ravi@example.com", "password": "Secure123"}).status_code == 429


def test_other_users_cannot_read_profiles(client, demo):
    r = client.post("/api/auth/register", json={"name": "Eve", "email": "eve@example.com", "password": "Secure123"})
    eve = _auth(r.json()["access_token"])
    pid = demo["profiles"]["Lakshmi"]["id"]
    assert client.get(f"/api/profiles/{pid}/insights", headers=eve).status_code == 404


# ------------------------------------------------------------ upload -> review -> confirm
def _pdf(lines):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=10)
    for line in lines:
        pdf.cell(0, 6, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def test_upload_confirm_pipeline(client):
    r = client.post("/api/auth/register", json={"name": "Meena", "email": "meena@example.com", "password": "Secure123"})
    h = _auth(r.json()["access_token"])
    pid = client.get("/api/profiles", headers=h).json()[0]["id"]
    client.patch(f"/api/profiles/{pid}", json={"dob": "1970-01-01", "sex": "F"}, headers=h)
    data = _pdf(["CityCare Pathology", "Patient Name : Meena K", "Collected On : 12/09/2026",
                 "SGOT (AST)   60   U/L   0 - 40", "SGPT (ALT)   45   U/L   0 - 40", "Platelet Count   1.4   lakhs/cumm   1.5 - 4.1"])
    up = client.post(f"/api/profiles/{pid}/reports", files={"file": ("lab.pdf", io.BytesIO(data), "application/pdf")}, headers=h)
    assert up.status_code == 200, up.text
    rep = up.json()
    assert rep["status"] == "review" and rep["method"] == "text-parser" and rep["report_date"] == "2026-09-12"
    assert {x["test_code"] for x in rep["results"]} == {"AST", "ALT", "PLT"}
    # user corrects nothing and confirms
    body = {"kind": "lab", "lab_name": rep["lab_name"], "report_date": rep["report_date"],
            "tests": [{"test_code": x["test_code"], "test_name_raw": x["test_name_raw"], "value_raw": x["value_raw"],
                       "unit_raw": x["unit_raw"], "ref_low": x["ref_low"], "ref_high": x["ref_high"]} for x in rep["results"]]}
    conf = client.post(f"/api/reports/{rep['id']}/confirm", json=body, headers=h)
    assert conf.status_code == 200 and conf.json()["status"] == "confirmed"
    a = client.get(f"/api/profiles/{pid}/insights", headers=h).json()
    fib4 = next(r for r in a["hidden_risks"] if r["id"] == "fib4")
    assert fib4["status"] == "red"  # (56.7*60)/(140*sqrt(45)) = 3.6
    f = client.get(f"/api/reports/{rep['id']}/file", headers=h)
    assert f.content == data  # decrypted original


def test_rejects_wrong_file_type(client, demo):
    pid = demo["profiles"]["Lakshmi"]["id"]
    r = client.post(f"/api/profiles/{pid}/reports", files={"file": ("x.pdf", io.BytesIO(b"not a pdf"), "application/pdf")}, headers=demo["h"])
    assert r.status_code == 415


# ------------------------------------------------------------ test kit (datasets/test_kit) must match ANSWER_KEY.md
def test_test_kit_matches_answer_key(client):
    from pathlib import Path

    kit = sorted((Path(__file__).resolve().parents[2] / "datasets" / "test_kit").glob("*.pdf"))
    assert len(kit) == 6
    listing = client.get("/api/samples").json()
    assert any(s["set"] == "test_kit" and len(s["files"]) == 7 for s in listing)
    assert client.get("/api/samples/test_kit/..%2F..%2Fbackend%2F.env").status_code == 404

    r = client.post("/api/auth/register", json={"name": "Kit", "email": "kit@example.com", "password": "Secure123", "sex": "M"})
    h = _auth(r.json()["access_token"])
    pid = client.post("/api/profiles", json={"name": "Ravi Kumar", "relation": "father", "sex": "M", "dob": "1972-05-10",
                                             "conditions": ["hypertension"]}, headers=h).json()["id"]
    for f in kit:
        rep = client.post(f"/api/profiles/{pid}/reports", files={"file": (f.name, f.read_bytes(), "application/pdf")}, headers=h).json()
        body = {"kind": rep["kind"], "lab_name": rep["lab_name"], "report_date": rep["report_date"],
                "tests": [{"test_code": x["test_code"], "test_name_raw": x["test_name_raw"], "value_raw": x["value_raw"], "unit_raw": x["unit_raw"],
                           "ref_low": x["ref_low"], "ref_high": x["ref_high"]} for x in rep["results"]],
                "medicines": [{"brand": m["brand"], "dose": m["dose"], "frequency": m["frequency"]} for m in rep["draft_medicines"]]}
        assert client.post(f"/api/reports/{rep['id']}/confirm", json=body, headers=h).status_code == 200
    client.post(f"/api/profiles/{pid}/symptoms", json={"key": "ankle_swelling", "onset_date": "2026-05-20"}, headers=h)

    a = client.get(f"/api/profiles/{pid}/insights", headers=h).json()
    risks = {r["id"]: r for r in a["hidden_risks"]}
    assert risks["fib4"]["status"] == "red" and abs(risks["fib4"]["current"]["value"] - 2.70) < 0.01
    assert risks["fib4"]["current"]["reports_combined"] == 2
    assert risks["egfr"]["status"] == "red" and abs(risks["egfr"]["current"]["value"] - 65.4) < 0.2
    assert abs(risks["tyg"]["current"]["value"] - 9.31) < 0.01
    assert abs(risks["tg_hdl"]["current"]["value"] - 5.55) < 0.01
    assert abs(risks["non_hdl"]["current"]["value"] - 179.8) < 0.1
    assert risks["apri"]["status"] == "yellow" and "mentzer" not in risks
    assert {d["code"] for d in a["drifts"]} >= {"CREAT", "K"}
    ids = {al["id"] for al in a["alerts"]}
    assert "triple-whammy" in ids and any(i.startswith("cascade-ccb_edema_diuretic") for i in ids) and "gap-LIPID" in ids
    assert a["next_tests"][0]["panel"] == "LIPID"


def test_contact_form(client):
    assert client.post("/api/contact", json={"name": "A", "email": "a@example.com", "message": "Hello team!"}).json()["ok"]
    assert client.post("/api/contact", json={"name": "A", "email": "bad", "message": "Hello team!"}).status_code == 422


# ------------------------------------------------------------ wellness data
def test_demo_wellness_links_bp_to_painkiller(client, demo):
    pid = demo["profiles"]["Lakshmi"]["id"]
    w = client.get(f"/api/profiles/{pid}/wellness", headers=demo["h"]).json()
    kinds = {c["kind"]: c for c in w["cards"]}
    assert {"bp", "glucose", "weight", "steps", "sleep"} <= set(kinds)
    ids = {a["id"] for a in w["alerts"]}
    assert "bp-high" in ids and "glucose-high" in ids and "steps-low" in ids
    assert any(i.startswith("bp-nsaid-") for i in ids)  # home BP rose after Zerodol-P started
    s = client.get(f"/api/profiles/{pid}/doctor-summary", headers=demo["h"]).json()
    assert s["wellness"]


def test_wellness_add_validate_and_csv(client):
    r = client.post("/api/auth/register", json={"name": "Well", "email": "well@example.com", "password": "Secure123"})
    h = _auth(r.json()["access_token"])
    pid = client.get("/api/profiles", headers=h).json()[0]["id"]
    assert client.post(f"/api/profiles/{pid}/wellness", json={"kind": "bp", "value": 128, "value2": 82}, headers=h).status_code == 200
    assert client.post(f"/api/profiles/{pid}/wellness", json={"kind": "bp", "value": 128}, headers=h).status_code == 422
    assert client.post(f"/api/profiles/{pid}/wellness", json={"kind": "spo2", "value": 140}, headers=h).status_code == 422
    tpl = client.get("/api/wellness/template.csv").text
    res = client.post(f"/api/profiles/{pid}/wellness/import", files={"file": ("w.csv", tpl.encode(), "text/csv")}, headers=h).json()
    assert res["added"] == 7 and not res["errors"]
    bad = client.post(f"/api/profiles/{pid}/wellness/import", files={"file": ("w.csv", b"date,kind,value\n2026-01-01,bp,120\nxx,weight,70\n", "text/csv")}, headers=h).json()
    assert bad["added"] == 0 and len(bad["errors"]) == 2
    cards = {c["kind"] for c in client.get(f"/api/profiles/{pid}/wellness", headers=h).json()["cards"]}
    assert {"bp", "glucose", "weight", "steps", "sleep", "heart_rate", "spo2"} <= cards
