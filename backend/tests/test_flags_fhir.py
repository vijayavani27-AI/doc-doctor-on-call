"""Lab flags are computed in code; FHIR export is valid R4 (checked with fhir.resources R4B models + structure rules)."""
import pytest

from app.services import flags


@pytest.mark.parametrize("value,lo,hi,clo,chi,expected", [
    (5.0, 4.0, 5.6, None, None, "normal"),
    (5.6, 4.0, 5.6, None, None, "normal"),  # edges are inside the range
    (5.7, 4.0, 5.6, None, None, "high"),
    (3.9, 4.0, 5.6, None, None, "low"),
    (6.5, 3.5, 5.1, 2.5, 6.0, "critical_high"),
    (2.4, 3.5, 5.1, 2.5, 6.0, "critical_low"),
    (2.5, 3.5, 5.1, 2.5, 6.0, "low"),
    (120, None, 200, None, None, "normal"),  # one-sided range "< 200"
    (None, 1, 2, None, None, None),
])
def test_compute_flag(value, lo, hi, clo, chi, expected):
    assert flags.compute_flag(value, lo, hi, clo, chi) == expected


def test_flag_uses_catalogue_critical_limits():
    assert flags.flag_for("K", 6.4, 3.5, 5.1) == "critical_high"
    assert flags.flag_for("FBG", 48, 70, 100) == "critical_low"
    assert flags.flag_for("HBA1C", 6.2, 4.0, 5.6) == "high"  # no critical limit for HbA1c
    assert flags.short("critical_low") == "L" and flags.short("normal") == "N"


def test_needs_review_threshold():
    assert flags.needs_review(0.74) and not flags.needs_review(0.75) and not flags.needs_review(0.5, user_verified=True)


def _bundle(client, demo):
    pid = demo["profiles"]["Lakshmi"]["id"]
    r = client.get(f"/api/fhir?profile_id={pid}", headers=demo["h"])
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/fhir+json")
    return r.json()


def test_fhir_bundle_structure(client, demo):
    b = _bundle(client, demo)
    assert b["resourceType"] == "Bundle" and b["type"] == "collection"
    types = {e["resource"]["resourceType"] for e in b["entry"]}
    assert {"Patient", "Observation", "DiagnosticReport", "DocumentReference", "MedicationRequest", "Condition"} <= types
    urls = {e["fullUrl"] for e in b["entry"]}
    assert all(u.startswith("urn:uuid:") for u in urls)
    patient = next(e for e in b["entry"] if e["resource"]["resourceType"] == "Patient")["fullUrl"]
    for e in b["entry"]:
        r = e["resource"]
        assert r["id"] == e["fullUrl"].split(":")[-1]
        if "subject" in r:
            assert r["subject"]["reference"] == patient  # every reference resolves inside the bundle
        if r["resourceType"] == "DiagnosticReport":
            assert all(x["reference"] in urls for x in r["result"])
    labs = [e["resource"] for e in b["entry"] if e["resource"]["resourceType"] == "Observation"
            and e["resource"]["category"][0]["coding"][0]["code"] == "laboratory"]
    assert labs and all(any(c["system"] == "http://loinc.org" for c in o["code"]["coding"]) for o in labs)
    hba1c = [o for o in labs if any(c.get("code") == "4548-4" for c in o["code"]["coding"])]
    assert hba1c and hba1c[0]["valueQuantity"]["system"] == "http://unitsofmeasure.org"
    assert all("interpretation" in o for o in labs if "valueQuantity" in o)
    assert any("referenceRange" in o for o in labs)


def test_fhir_bundle_validates_against_r4_models(client, demo):
    pytest.importorskip("fhir.resources")
    from fhir.resources.R4B.bundle import Bundle

    b = _bundle(client, demo)
    parsed = Bundle.model_validate(b)
    assert len(parsed.entry) == len(b["entry"])


def test_fhir_patient_carries_abha(client, demo):
    pid = demo["profiles"]["Priya"]["id"]
    bad = client.post(f"/api/profiles/{pid}/abha/link", json={"abha_number": "1234"}, headers=demo["h"])
    assert bad.status_code == 422 and bad.json()["error"] == "unprocessable_entity"
    ok = client.post(f"/api/profiles/{pid}/abha/link", json={"abha_number": "91-2345-6789-0123", "abha_address": "priya.r@abdm"}, headers=demo["h"])
    assert ok.status_code == 200 and ok.json()["mock"]
    b = client.get(f"/api/fhir?profile_id={pid}", headers=demo["h"]).json()
    patient = next(e["resource"] for e in b["entry"] if e["resource"]["resourceType"] == "Patient")
    assert {i["value"] for i in patient["identifier"]} == {"91-2345-6789-0123", "priya.r@abdm"}
    imp = client.post(f"/api/profiles/{pid}/abha/import", headers=demo["h"])
    assert imp.status_code == 200
    rec = client.get(f"/api/records/{imp.json()['imported_report_id']}", headers=demo["h"]).json()
    assert rec["is_demo"] and rec["method"] == "abha-mock"
    client.delete(f"/api/profiles/{pid}/abha", headers=demo["h"])
