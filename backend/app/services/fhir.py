"""FHIR R4 export: Patient (+ABHA), DocumentReference, DiagnosticReport, Observation (LOINC, UCUM,
referenceRange, interpretation), MedicationRequest, Condition and home vital-sign Observations.

Output is a Bundle of type "collection" with urn:uuid references, so it can be imported by any
FHIR R4 server or an ABDM-style health locker. Tests validate it with fhir.resources (R4B models).
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from . import catalog, flags

LOINC = "http://loinc.org"
UCUM = "http://unitsofmeasure.org"
LOCAL = "https://doc-doctor-on-call.onrender.com/fhir/CodeSystem/doc-tests"
ABHA_NUMBER = "https://healthid.ndhm.gov.in"
ABHA_ADDRESS = "https://healthid.ndhm.gov.in/health-address"
OBS_CAT = "http://terminology.hl7.org/CodeSystem/observation-category"
INTERP = "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation"
V2_0074 = "http://terminology.hl7.org/CodeSystem/v2-0074"
COND_CLINICAL = "http://terminology.hl7.org/CodeSystem/condition-clinical"
COND_CAT = "http://terminology.hl7.org/CodeSystem/condition-category"

UCUM_CODES = {"%": "%", "10^12/L": "10*12/L", "10^9/L": "10*9/L", "U/L": "U/L", "fL": "fL", "g/dL": "g/dL", "mIU/L": "m[IU]/L",
              "mg/dL": "mg/dL", "mg/g": "mg/g", "mmol/L": "mmol/L", "ng/mL": "ng/mL", "pg": "pg", "pg/mL": "pg/mL",
              "mmHg": "mm[Hg]", "kg": "kg", "/min": "/min", "h": "h", "steps": "{steps}", "mL": "mL", "kcal": "kcal"}

CONDITION_SNOMED = {"diabetes": ("44054006", "Diabetes mellitus type 2"), "hypertension": ("38341003", "Hypertensive disorder"),
                    "hypothyroidism": ("40930008", "Hypothyroidism"), "ckd": ("709044004", "Chronic kidney disease"),
                    "heart_disease": ("56265001", "Heart disease"), "asthma": ("195967001", "Asthma"),
                    "pcos": ("69878008", "Polycystic ovary syndrome"), "fatty_liver": ("197321007", "Steatosis of liver")}

VITAL_LOINC = {"bp": ("85354-9", "Blood pressure panel"), "heart_rate": ("8867-4", "Heart rate"), "weight": ("29463-7", "Body weight"),
               "spo2": ("59408-5", "Oxygen saturation in Arterial blood by Pulse oximetry"), "glucose": ("2339-0", "Glucose [Mass/volume] in Blood"),
               "steps": ("55423-8", "Number of steps in unspecified time Pedometer"), "sleep": ("93832-4", "Sleep duration"),
               "water": ("9108-2", "Fluid intake total 24 hour"), "calories": ("9052-2", "Calorie intake total 24 hour")}
VITAL_UNIT = {"bp": "mmHg", "heart_rate": "/min", "weight": "kg", "spo2": "%", "glucose": "mg/dL", "steps": "steps", "sleep": "h",
              "water": "mL", "calories": "kcal"}

_NS = uuid.UUID("6f1c2a52-3d0e-4c8e-9a35-7d0c5e7a9b11")


def _urn(kind: str, key) -> str:
    return f"urn:uuid:{uuid.uuid5(_NS, f'{kind}/{key}')}"


def _entry(full_url: str, resource: dict) -> dict:
    resource["id"] = full_url.rsplit(":", 1)[1]
    return {"fullUrl": full_url, "resource": resource}


def _qty(value: float, unit: str | None) -> dict:
    q = {"value": round(float(value), 4), "unit": unit or ""}
    if unit in UCUM_CODES:
        q["system"], q["code"] = UCUM, UCUM_CODES[unit]
    return q


def _abha_digits(n: str | None) -> str | None:
    d = "".join(ch for ch in (n or "") if ch.isdigit())
    return f"{d[:2]}-{d[2:6]}-{d[6:10]}-{d[10:14]}" if len(d) == 14 else None


def patient_resource(profile) -> tuple[str, dict]:
    url = _urn("Patient", profile.id)
    res: dict = {"resourceType": "Patient", "active": True, "name": [{"text": profile.name}],
                 "gender": {"F": "female", "M": "male"}.get(profile.sex, "unknown")}
    if profile.dob:
        res["birthDate"] = profile.dob.isoformat()
    ids = []
    abha = _abha_digits(getattr(profile, "abha_number", None))
    if abha:
        ids.append({"type": {"text": "ABHA number"}, "system": ABHA_NUMBER, "value": abha})
    if getattr(profile, "abha_address", None):
        ids.append({"type": {"text": "ABHA address"}, "system": ABHA_ADDRESS, "value": profile.abha_address})
    if ids:
        res["identifier"] = ids
    return url, res


def _observation(r, patient_url: str, tests: dict) -> tuple[str, dict]:
    t = tests.get(r.test_code or "") or {}
    url = _urn("Observation", r.id)
    coding = []
    if t.get("loinc"):
        coding.append({"system": LOINC, "code": t["loinc"], "display": t["name"]})
    if r.test_code:
        coding.append({"system": LOCAL, "code": r.test_code, "display": t.get("name", r.test_name_raw)})
    res: dict = {"resourceType": "Observation", "status": "final" if r.confirmed else "preliminary",
                 "category": [{"coding": [{"system": OBS_CAT, "code": "laboratory", "display": "Laboratory"}]}],
                 "code": {"coding": coding, "text": t.get("name", r.test_name_raw)} if coding else {"text": r.test_name_raw},
                 "subject": {"reference": patient_url}}
    if r.date:
        res["effectiveDateTime"] = r.date.isoformat()
    if r.value is not None:
        res["valueQuantity"] = _qty(r.value, r.unit)
    elif r.value_raw:
        res["valueString"] = str(r.value_raw)
    if r.ref_low is not None or r.ref_high is not None:
        rr = {}
        if r.ref_low is not None:
            rr["low"] = _qty(r.ref_low, r.unit)
        if r.ref_high is not None:
            rr["high"] = _qty(r.ref_high, r.unit)
        res["referenceRange"] = [rr]
    f = flags.flag_for(r.test_code, r.value, r.ref_low, r.ref_high)
    if f:
        code, display = flags.INTERPRETATION[f]
        res["interpretation"] = [{"coding": [{"system": INTERP, "code": code, "display": display}]}]
    if r.source_text:
        res["note"] = [{"text": f"Source line: {r.source_text[:300]}"}]
    return url, res


def _report_entries(rep, patient_url: str, tests: dict) -> list[dict]:
    entries = []
    when = rep.report_date.isoformat() if rep.report_date else None
    is_rx = rep.kind == "prescription"
    is_dc = rep.kind == "discharge"
    doc_url = _urn("DocumentReference", rep.id)
    doc = {"resourceType": "DocumentReference", "status": "current",
           "type": {"coding": [{"system": LOINC, "code": "18842-5" if is_dc else "57833-6" if is_rx else "11502-2",
                                "display": "Discharge summary" if is_dc else "Prescription for medication" if is_rx else "Laboratory report"}]},
           "subject": {"reference": patient_url},
           "content": [{"attachment": {"contentType": rep.mime or "application/pdf", "title": rep.filename}}]}
    if rep.created_at:
        created = rep.created_at if rep.created_at.tzinfo else rep.created_at.replace(tzinfo=UTC)
        doc["date"] = created.isoformat()
    if rep.lab_name or rep.doctor_name:
        doc["author"] = [{"display": rep.lab_name or rep.doctor_name}]
    entries.append(_entry(doc_url, doc))
    for g in getattr(rep, "diagnoses", []):
        u, res = diagnosis_condition(g, patient_url)
        entries.append(_entry(u, res))
    if not is_rx and (rep.results or not is_dc):
        obs_urls = []
        for r in rep.results:
            u, res = _observation(r, patient_url, tests)
            obs_urls.append(u)
            entries.append(_entry(u, res))
        dr = {"resourceType": "DiagnosticReport", "status": "final" if rep.status == "confirmed" else "preliminary",
              "category": [{"coding": [{"system": V2_0074, "code": "LAB", "display": "Laboratory"}]}],
              "code": {"coding": [{"system": LOINC, "code": "11502-2", "display": "Laboratory report"}], "text": rep.lab_name or "Lab report"},
              "subject": {"reference": patient_url}, "result": [{"reference": u} for u in obs_urls]}
        if when:
            dr["effectiveDateTime"] = when
        if rep.lab_name:
            dr["performer"] = [{"display": rep.lab_name}]
        entries.append(_entry(_urn("DiagnosticReport", rep.id), dr))
    return entries


def _medication(m, patient_url: str) -> tuple[str, dict]:
    url = _urn("MedicationRequest", m.id)
    text = f"{m.brand} ({m.generic})" if m.generic else m.brand
    res: dict = {"resourceType": "MedicationRequest", "status": "active" if m.active else "completed", "intent": "order",
                 "medicationCodeableConcept": {"text": text}, "subject": {"reference": patient_url}}
    if m.start_date:
        res["authoredOn"] = m.start_date.isoformat()
    dose = " ".join(x for x in (m.dose, m.frequency) if x)
    if dose:
        res["dosageInstruction"] = [{"text": dose}]
    if m.reason:
        res["reasonCode"] = [{"text": m.reason}]
    return url, res


def _condition(key: str, profile_id: int, patient_url: str) -> tuple[str, dict]:
    url = _urn("Condition", f"{profile_id}/{key}")
    code = CONDITION_SNOMED.get(key)
    cc = {"text": code[1] if code else key}
    if code:
        cc["coding"] = [{"system": "http://snomed.info/sct", "code": code[0], "display": code[1]}]
    return url, {"resourceType": "Condition",
                 "clinicalStatus": {"coding": [{"system": COND_CLINICAL, "code": "active"}]},
                 "category": [{"coding": [{"system": COND_CAT, "code": "problem-list-item"}]}],
                 "code": cc, "subject": {"reference": patient_url}}


def diagnosis_condition(g, patient_url: str) -> tuple[str, dict]:
    """Condition from a coded diagnosis: ICD-10 + SNOMED CT, with clinical status and recorded date."""
    url = _urn("Condition", f"dx/{g.id}")
    coding = []
    if g.snomed:
        coding.append({"system": "http://snomed.info/sct", "code": g.snomed, "display": g.name})
    if g.icd10:
        coding.append({"system": "http://hl7.org/fhir/sid/icd-10", "code": g.icd10, "display": g.name})
    res: dict = {"resourceType": "Condition",
                 "clinicalStatus": {"coding": [{"system": COND_CLINICAL, "code": "active" if g.status == "active" else "resolved"}]},
                 "verificationStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "confirmed"}]},
                 "category": [{"coding": [{"system": COND_CAT, "code": "encounter-diagnosis" if g.status == "active" else "problem-list-item"}]}],
                 "code": {"coding": coding, "text": g.name_raw or g.name} if coding else {"text": g.name_raw or g.name},
                 "subject": {"reference": patient_url}}
    if g.diagnosed_on:
        res["recordedDate"] = g.diagnosed_on.isoformat()
    if g.source_text:
        res["note"] = [{"text": f"Source line: {g.source_text[:300]}"}]
    return url, res


def _dx_condition(key: str) -> str | None:
    from . import diagnoses

    return diagnoses.catalog().get(key, {}).get("condition")


def _vital(v, patient_url: str) -> tuple[str, dict] | None:
    if v.kind not in VITAL_LOINC:
        return None
    code, display = VITAL_LOINC[v.kind]
    url = _urn("Observation", f"vital/{v.id}")
    at = v.measured_at if v.measured_at.tzinfo else v.measured_at.replace(tzinfo=UTC)
    res: dict = {"resourceType": "Observation", "status": "final",
                 "category": [{"coding": [{"system": OBS_CAT, "code": "vital-signs" if v.kind in ("bp", "heart_rate", "weight", "spo2") else "activity"}]}],
                 "code": {"coding": [{"system": LOINC, "code": code, "display": display}], "text": display},
                 "subject": {"reference": patient_url}, "effectiveDateTime": at.isoformat()}
    if v.kind == "bp":
        res["component"] = [
            {"code": {"coding": [{"system": LOINC, "code": "8480-6", "display": "Systolic blood pressure"}]}, "valueQuantity": _qty(v.value, "mmHg")},
            {"code": {"coding": [{"system": LOINC, "code": "8462-4", "display": "Diastolic blood pressure"}]}, "valueQuantity": _qty(v.value2 or 0, "mmHg")}]
    else:
        res["valueQuantity"] = _qty(v.value, VITAL_UNIT[v.kind])
    res["device"] = {"display": f"home reading ({v.source})"}
    return url, res


def bundle(profile, reports=None, include_vitals: bool = True, vitals_limit: int = 60) -> dict:
    """Combined FHIR R4 collection Bundle for one person (or a subset of their reports)."""
    tests = catalog.tests()
    patient_url, patient = patient_resource(profile)
    entries = [_entry(patient_url, patient)]
    reps = reports if reports is not None else sorted(profile.reports, key=lambda r: (r.report_date or date.min, r.id))
    for rep in reps:
        entries += _report_entries(rep, patient_url, tests)
    meds = [m for m in profile.medications if reports is None or m.report_id in {r.id for r in reps}]
    for m in meds:
        u, res = _medication(m, patient_url)
        entries.append(_entry(u, res))
    if reports is None:
        for g in getattr(profile, "diagnoses", []):
            if g.report_id is None:
                u, res = diagnosis_condition(g, patient_url)
                entries.append(_entry(u, res))
        coded = {g.key and _dx_condition(g.key) for g in getattr(profile, "diagnoses", [])}
        for key in [c for c in (profile.conditions or []) if c not in coded]:
            u, res = _condition(key, profile.id, patient_url)
            entries.append(_entry(u, res))
        if include_vitals:
            for v in sorted(profile.vitals, key=lambda v: v.measured_at, reverse=True)[:vitals_limit]:
                made = _vital(v, patient_url)
                if made:
                    entries.append(_entry(*made))
    return {"resourceType": "Bundle", "type": "collection", "timestamp": datetime.now(UTC).isoformat(timespec="seconds"),
            "identifier": {"system": "urn:ietf:rfc:3986", "value": _urn("Bundle", f"{profile.id}/{len(entries)}")},
            "entry": entries}
