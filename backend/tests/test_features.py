"""New features: records corrections + signed file URLs, vitals, care plan, analysis, risk, chat RAG + urgent rules,
medicine safety, meals/diet, wound photo check, remedies, devices, SOS, uniform errors."""
import io
import json

from fpdf import FPDF


def _register(client, name="Tester", sex="F"):
    import uuid

    email = f"{name.lower()}-{uuid.uuid4().hex[:6]}@example.com"
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": "Secure123", "sex": sex})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return h, client.get("/api/profiles", headers=h).json()[0]["id"]


def _pdf(lines):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=11)
    for line in lines:
        pdf.cell(0, 8, line, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def test_upload_correct_and_signed_file(client):
    h, pid = _register(client)
    data = _pdf(["Lab: Sunrise Diagnostics", "Date: 02/08/2026", "Potassium    6.8    mmol/L    3.5 - 5.1", "HbA1c    6.1    %    4.0 - 5.6"])
    rep = client.post("/api/records/upload", files={"file": ("k.pdf", data, "application/pdf")}, data={"profile_id": str(pid)}, headers=h).json()
    k = next(x for x in rep["results"] if x["test_code"] == "K")
    assert k["flag_computed"] == "critical_high"
    full = client.get(f"/api/records/{rep['id']}?lang=ta", headers=h).json()
    assert full["summary"]["language"] == "ta" and full["summary"]["lines"]
    # correction: the person fixes a misread value -> re-normalised, re-flagged in code, marked verified
    fixed = client.put(f"/api/records/{rep['id']}", json={"items": [{"id": k["id"], "value_raw": "4.8"}]}, headers=h).json()
    k2 = next(x for x in fixed["results"] if x["id"] == k["id"])
    assert k2["value"] == 4.8 and k2["flag_computed"] == "normal" and k2["user_verified"] and fixed["user_verified"]
    assert client.put(f"/api/records/{rep['id']}", json={"items": [{"id": 999999, "value_raw": "1"}]}, headers=h).status_code == 404
    url = client.get(f"/api/records/{rep['id']}/file-url", headers=h).json()["url"]
    f = client.get(url)  # no auth header needed for the short-lived signed URL
    assert f.status_code == 200 and f.content.startswith(b"%PDF")
    assert client.get(url[:-3] + "abc").status_code == 401  # tampered
    fhir = client.get(f"/api/records/{rep['id']}/fhir", headers=h).json()
    assert fhir["resourceType"] == "Bundle"
    # other users can't touch it
    h2, _ = _register(client, "Other")
    assert client.get(f"/api/records/{rep['id']}", headers=h2).status_code == 404
    assert client.get(f"/api/records/{rep['id']}/file-url", headers=h2).status_code == 404


def test_upload_rejects_bad_files(client):
    h, pid = _register(client)
    r = client.post(f"/api/profiles/{pid}/reports", files={"file": ("x.txt", b"hello", "text/plain")}, headers=h)
    assert r.status_code == 415 and r.json()["error"] == "unsupported_media_type" and r.json()["detail"]
    r = client.post(f"/api/profiles/{pid}/reports", files={"file": ("x.pdf", b"not a pdf", "application/pdf")}, headers=h)
    assert r.status_code == 415


def test_vitals_spec_and_urgent_banner(client):
    h, pid = _register(client)
    r = client.post("/api/vitals", json={"type": "glucose_fasting", "value": 112}, headers=h)
    assert r.status_code == 200 and r.json()["reading"]["type"] == "glucose_fasting" and r.json()["urgent"] is None
    client.post("/api/vitals", json={"type": "water_ml", "value": 1800}, headers=h)
    crisis = client.post("/api/vitals", json={"type": "bp", "value": 186, "value2": 112}, headers=h).json()
    assert crisis["urgent"]["level"] == "emergency" and any(c["number"] == "112" for c in crisis["urgent"]["call"])
    items = client.get("/api/vitals?type=glucose_fasting", headers=h).json()["items"]
    assert len(items) == 1 and items[0]["value"] == 112
    assert client.post("/api/vitals", json={"type": "bp", "value": 120}, headers=h).status_code == 422
    assert client.get("/api/vitals?type=nonsense", headers=h).status_code == 422
    dash = client.get(f"/api/profiles/{pid}/dashboard", headers=h).json()
    assert dash["urgent"] and "today" in dash and "family" in dash


def test_checkups_and_reminders(client, demo):
    pid = demo["profiles"]["Lakshmi"]["id"]
    c = client.get(f"/api/profiles/{pid}/checkups", headers=demo["h"]).json()
    assert any(x["status"] == "overdue" for x in c["items"]) and isinstance(c["suggestions"], list)
    new = client.post(f"/api/profiles/{pid}/checkups", json={"title": "Dental check", "kind": "dental", "due_date": "2026-12-01", "repeat_months": 6},
                      headers=demo["h"]).json()
    done = client.post(f"/api/checkups/{new['id']}/done", headers=demo["h"]).json()
    assert done["done"]["status"] == "done" and done["next"]["due_date"]
    client.delete(f"/api/checkups/{done['next']['id']}", headers=demo["h"])
    client.delete(f"/api/checkups/{new['id']}", headers=demo["h"])
    rem = client.get(f"/api/profiles/{pid}/reminders", headers=demo["h"]).json()
    assert rem["items"]
    r = client.post(f"/api/profiles/{pid}/reminders", json={"title": "Walk", "kind": "custom", "times": ["06:30"]}, headers=demo["h"]).json()
    assert client.post(f"/api/profiles/{pid}/reminders", json={"title": "Bad", "times": ["25:99"]}, headers=demo["h"]).status_code == 422
    slot = r["today"][0]["slot"]
    assert client.post(f"/api/reminders/{r['id']}/done", json={"slot": slot}, headers=demo["h"]).json()["today"][0]["done"]
    due = client.get(f"/api/profiles/{pid}/reminders/due", headers=demo["h"]).json()
    assert due["slots"] and "pending" in due
    client.delete(f"/api/reminders/{r['id']}", headers=demo["h"])


def test_analysis_and_risk_models(client, demo):
    pid = demo["profiles"]["Lakshmi"]["id"]
    a = client.post(f"/api/profiles/{pid}/analysis/run?lang=ta", headers=demo["h"]).json()
    assert a["hidden_risks"] and a["disclaimer"] and "screening" in a
    d = client.get(f"/api/profiles/{pid}/risk/diabetes", headers=demo["h"]).json()
    if d.get("available"):
        assert 0 <= d["probability"] <= 1 and d["band"] in ("low", "moderate", "high") and "not a diagnosis" in d["disclaimer"]
        assert len(d["top_factors"]) <= 3 and d["imputed_features"]
        assert all(f["feature"] in {u["feature"] for u in d["used_features"]} for f in d["top_factors"])
    assert client.get(f"/api/profiles/{pid}/risk/cancer", headers=demo["h"]).status_code == 404


def test_chat_rag_and_urgent_words(client, demo):
    pid = demo["profiles"]["Lakshmi"]["id"]
    r = client.post(f"/api/profiles/{pid}/chat", json={"message": "What about my blood pressure readings at home?"}, headers=demo["h"]).json()
    assert r["retrieved"] and r["disclaimer"] and r["scope"]["type"] == "me"
    assert any(x["id"] == "V:bp" for x in r["retrieved"][:5])
    u = client.post("/api/chat", json={"message": "I have chest pain and can't breathe"}, params={"profile_id": pid}, headers=demo["h"]).json()
    assert u["urgent"]["level"] == "emergency" and u["see_doctor"]


def test_medicine_safety_kb(client, demo):
    pid = demo["profiles"]["Lakshmi"]["id"]
    s = client.get(f"/api/profiles/{pid}/medicines/safety", headers=demo["h"]).json()
    assert s["food_notes"] and s["source"].startswith("DOC") and s["disclaimer"]
    assert any(n["generic"] == "metformin" for n in s["food_notes"])
    h, p2 = _register(client, "Dup")
    for brand in ("Glycomet 500", "Glyciphage 500", "Brufen 400", "Combiflam"):
        client.post(f"/api/profiles/{p2}/medicines", json={"brand": brand}, headers=h)
    s2 = client.get(f"/api/profiles/{p2}/medicines/safety", headers=h).json()
    assert s2["duplicates"], s2["checked"]


def test_meals_and_diet(client, demo):
    parsed = client.post("/api/meals/parse", json={"text": "2 idli, sambar and a cup of filter coffee"}).json()
    keys = [i["key"] for i in parsed["items"]]
    assert "idli" in keys and "sambar" in keys and parsed["totals"]["kcal"] > 0
    assert client.get("/api/foods?q=dosa").json()
    pid = demo["profiles"]["Lakshmi"]["id"]
    m = client.post(f"/api/profiles/{pid}/meals", json={"meal_type": "breakfast", "items": [{"key": "ragi_dosa", "servings": 1}]}, headers=demo["h"])
    assert m.status_code == 200
    assert client.post(f"/api/profiles/{pid}/meals", json={"items": [{"key": "pizza_xyz"}]}, headers=demo["h"]).status_code == 422
    meals = client.get(f"/api/profiles/{pid}/meals?days=7", headers=demo["h"]).json()
    assert meals["items"] and meals["by_day"]
    diet = client.get(f"/api/profiles/{pid}/diet", headers=demo["h"]).json()
    assert diet["tips"] and diet["disclaimer"] and any(t["id"] in ("low_gi", "salt") for t in diet["tips"])
    client.delete(f"/api/meals/{m.json()['id']}", headers=demo["h"])
    scan = client.post(f"/api/profiles/{pid}/meals/scan", files={"file": ("m.png", _png((200, 180, 60)), "image/png")}, headers=demo["h"])
    assert scan.status_code == 503  # photo recognition is an optional AI boost; off in tests


def _png(color, size=(200, 200), spot=None):
    from PIL import Image, ImageDraw

    img = Image.new("RGB", size, (225, 190, 170))
    if spot:
        ImageDraw.Draw(img).ellipse([60, 60, 140, 140], fill=spot)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def test_wound_scan_rules_and_compare(client):
    h, pid = _register(client, "Wound")
    client.patch(f"/api/profiles/{pid}", json={"conditions": ["diabetes"]}, headers=h)
    a = client.post(f"/api/profiles/{pid}/wounds", files={"file": ("w.png", _png(None, spot=(200, 30, 30)), "image/png")},
                    data={"label": "left foot", "answers": json.dumps({"days": 3})}, headers=h).json()
    assert a["metrics"]["red_pct"] > 5 and a["result"]["level"] == "today"  # diabetic foot rule
    b = client.post(f"/api/profiles/{pid}/wounds", files={"file": ("w.png", _png(None, spot=(205, 40, 40)), "image/png")},
                    data={"label": "left foot", "answers": json.dumps({"fever": True, "spreading_redness": True})}, headers=h).json()
    assert b["result"]["level"] == "emergency" and "compare" in b
    cmp_ = client.get(f"/api/wounds/{a['id']}/compare/{b['id']}", headers=h).json()
    assert "verdict" in cmp_
    assert client.get(f"/api/wounds/{a['id']}/file-url", headers=h).status_code == 200
    bad = client.post(f"/api/profiles/{pid}/wounds", files={"file": ("w.gif", b"GIF89a", "image/gif")}, headers=h)
    assert bad.status_code == 415


def test_remedies_devices_sos_and_voice(client, demo):
    r = client.get("/api/remedies").json()
    assert len(r["items"]) >= 10 and all(i["red_flags"] for i in r["items"])
    assert client.get("/api/remedies/nope").status_code == 404
    pid = demo["profiles"]["Priya"]["id"]
    dev = client.post(f"/api/profiles/{pid}/devices", json={"kind": "fitness_band"}, headers=demo["h"]).json()
    sync = client.post(f"/api/devices/{dev['id']}/sync", headers=demo["h"]).json()
    assert sync["added"] > 0
    v = client.get(f"/api/vitals?profile_id={pid}&type=steps", headers=demo["h"]).json()["items"]
    assert v and all(x["source"] == "device_demo" and x["is_demo"] for x in v if x["source"] == "device_demo")
    client.delete(f"/api/devices/{dev['id']}", headers=demo["h"])
    sos = client.get(f"/api/profiles/{demo['profiles']['Lakshmi']['id']}/sos", headers=demo["h"]).json()
    assert {n["number"] for n in sos["numbers"]} >= {"112", "108"} and sos["card"]["blood_group"] == "B+"
    sp = client.post("/api/voice/speak", json={"text": "Your HbA1c is 7.6% [R12]. Please see your doctor.", "language": "ta"}).json()
    assert sp["voice_lang"] == "ta-IN" and "[R12]" not in " ".join(sp["chunks"])


def test_me_endpoint_and_errors(client):
    h, _ = _register(client, "Meera")
    me = client.put("/api/me", json={"height_cm": 160, "weight_kg": 64, "blood_group": "O+"}, headers=h).json()
    assert me["bmi"]["value"] == 25.0 and me["bmi"]["category"] == "obese"  # Asian cut-offs
    assert client.put("/api/me", json={"blood_group": "Z9"}, headers=h).json()["error"] == "validation_error"
    nf = client.get("/api/records/987654", headers=h)
    assert nf.status_code == 404 and set(nf.json()) == {"error", "detail"}
    assert client.get("/health").json()["status"] == "ok"
    assert client.delete("/api/me", headers=h).json()["deleted"]
    assert client.get("/api/me", headers=h).status_code == 401


def test_tamil_doctor_pdf(client, demo):
    import pymupdf

    pid = demo["profiles"]["Lakshmi"]["id"]
    en = client.get(f"/api/profiles/{pid}/doctor-summary.pdf", headers=demo["h"]).content
    ta = client.get(f"/api/profiles/{pid}/doctor-summary.pdf?lang=ta", headers=demo["h"]).content
    d_en, d_ta = pymupdf.open(stream=en, filetype="pdf"), pymupdf.open(stream=ta, filetype="pdf")
    assert d_ta.page_count == d_en.page_count + 1
    text = d_ta[-1].get_text()
    assert "குடும்ப" in text and "Lakshmi" in text and f"Page {d_ta.page_count}" in text


DISCHARGE = ["SRI RAMA MULTISPECIALITY HOSPITAL, CHENNAI", "DISCHARGE SUMMARY", "Date of Admission: 02/09/2026", "Date of Discharge: 06/09/2026",
             "Consultant: Dr. K. Senthil", "Final Diagnosis: Acute gastroenteritis with dehydration", "K/C/O T2DM, HTN",
             "Course in hospital: treated with IV fluids.", "Investigations:", "Serum Creatinine    1.4    mg/dL    0.7 - 1.3",
             "Potassium    3.2    mmol/L    3.5 - 5.1", "Discharge Medications:", "1. Tab. Glycomet 500 mg  1-0-1  x 30 days",
             "2. Tab. Telma 40 mg  1-0-0", "Advice: ORS, review after 1 week"]


def test_discharge_summary_diagnoses(client):
    h, pid = _register(client, "Dischg", "M")
    rep = client.post("/api/records/upload", files={"file": ("dc.pdf", _pdf(DISCHARGE), "application/pdf")}, data={"profile_id": str(pid)}, headers=h).json()
    assert rep["kind"] == "discharge" and rep["report_date"] == "2026-09-06" and rep["admission_date"] == "2026-09-02"
    dx = {d["key"]: d for d in rep["draft_diagnoses"]}
    assert {"age", "t2dm", "htn"} <= set(dx) and dx["t2dm"]["icd10"] == "E11" and dx["t2dm"]["status"] == "history"
    assert {t["test_code"] for t in rep["results"]} >= {"CREAT", "K"}
    assert [t["value"] for t in rep["results"] if t["test_code"] == "K"] == [3.2]  # "K/C/O T2DM" is not potassium
    assert {m["brand"].split()[0] for m in rep["draft_medicines"]} >= {"Glycomet", "Telma"}
    body = {"kind": "discharge", "lab_name": rep["lab_name"], "report_date": rep["report_date"],
            "tests": [{"test_name_raw": t["test_name_raw"], "value_raw": t["value_raw"], "unit_raw": t["unit_raw"], "test_code": t["test_code"]} for t in rep["results"]],
            "medicines": [{"brand": m["brand"], "dose": m["dose"], "frequency": m["frequency"]} for m in rep["draft_medicines"]],
            "diagnoses": [{"name": d["name"], "key": d["key"], "status": d["status"], "source_text": d["source_text"]} for d in rep["draft_diagnoses"]]}
    done = client.post(f"/api/reports/{rep['id']}/confirm", json=body, headers=h).json()
    coded = [d for d in done["diagnoses"] if d["key"]]
    assert len(coded) == 3 and all(d["simple"] for d in coded) and any(d["name"].lower() == "dehydration" for d in done["diagnoses"])
    prof = client.get(f"/api/profiles/{pid}", headers=h).json()
    assert {"diabetes", "hypertension"} <= set(prof["conditions"])  # care-gap rules switch on
    summ = client.get(f"/api/records/{rep['id']}/summary?lang=ta", headers=h).json()
    assert summ["diagnoses"]
    tl = client.get(f"/api/profiles/{pid}/timeline", headers=h).json()
    assert any(e["type"] == "diagnosis" for e in tl)
    fh = client.get(f"/api/records/{rep['id']}/fhir", headers=h).json()
    conds = [e["resource"] for e in fh["entry"] if e["resource"]["resourceType"] == "Condition"]
    assert any(c2["system"] == "http://hl7.org/fhir/sid/icd-10" and c2["code"] == "A09" for c in conds for c2 in c["code"]["coding"])
    doc = next(e["resource"] for e in fh["entry"] if e["resource"]["resourceType"] == "DocumentReference")
    assert doc["type"]["coding"][0]["code"] == "18842-5"
    from fhir.resources.R4B.bundle import Bundle

    Bundle.model_validate(client.get("/api/fhir", headers=h).json())


def test_diagnosis_parser_unit():
    from app.services import diagnoses

    got = diagnoses.extract("Diagnosis:\n1. Type 2 Diabetes Mellitus with peripheral neuropathy\n2. Systemic hypertension\nAdvice: diet")
    keys = [g.key for g in got]
    assert keys[:3] == ["t2dm", "diabetic_neuropathy", "htn"]
    assert diagnoses.extract("Age: 54  Sex: M\nBP 130/80") == []  # no diagnosis section -> nothing invented
    unknown = diagnoses.extract("Impression: rare thing syndrome")
    assert unknown and unknown[0].key is None and unknown[0].confidence < 0.75  # goes to review
