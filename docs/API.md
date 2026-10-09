# DOC API reference (v2)

Base URL: `/api`. Auth: `Authorization: Bearer <session token>` (from `/auth/firebase`, `/auth/login` in local mode, or `/auth/demo`).
API clients may also send a Firebase ID token directly as the Bearer token.
Errors always look like `{"error": "<slug>", "detail": "<message or list>"}`. Interactive docs: `/docs`.
Every AI or advice response includes a `disclaimer`. Urgent code rules add `urgent: {level, message, reasons[], call[]}`.
`{pid}` = a profile the caller owns (family-managed profiles included). Spec-style aliases take `?profile_id=` and default to the caller's own profile.

## Auth & account
| Method | Path | Notes |
|---|---|---|
| GET | `/auth/config` | `{mode: "firebase"\|"local", firebase: {apiKey, authDomain, projectId, appId}}` |
| POST | `/auth/firebase` | `{id_token, name?, sex?}` → `{access_token, user, created}` |
| POST | `/auth/register`, `/auth/login` | local dev mode only (410 in Firebase mode) |
| POST | `/auth/demo` | one-click demo family (all `is_demo`) |
| GET/PATCH | `/auth/me` | user + `profile_incomplete` |
| GET/PUT/DELETE | `/me` | profile + BMI (WHO Asia-Pacific); PUT sex, dob, height_cm, weight_kg, blood_group, allergies, conditions, emergency_name/phone; DELETE = erase everything |
| GET | `/audit` | access log incl. family members who viewed your data (`by`) |
| GET | `/export` | all data as JSON |

## Records pipeline
| Method | Path | Notes |
|---|---|---|
| POST | `/profiles/{pid}/reports` or `/records/upload` (form: file, kind, profile_id) | jpg/png/webp/pdf ≤15 MB; PDF ≤4 pages read. Own models: PDF text / Tesseract OCR → dictionary NER → normaliser; AI boost only when weak. Items carry `confidence`, `source_text`, `flag_computed`, `needs_review` (<0.75) |
| POST | `/reports/{rid}/confirm` | person confirms the draft |
| GET | `/records`, `/records/{rid}?lang=ta` | full record + `summary` (code templates) + `summary_ta` + `fhir_url` |
| PUT | `/records/{rid}` | `{report_date?, lab_name?, items:[{id, value_raw?, unit_raw?, test_code?, ref_low?, ref_high?}], delete_item_ids?}` → re-normalised, re-flagged in code, `user_verified` |
| DELETE | `/records/{rid}` | also deletes the stored file |
| GET | `/records/{rid}/file-url` | `{url:"/api/files/<signed>", expires_in:300}` (encrypted file streamed by the API; browser never sees Supabase) |
| GET | `/records/{rid}/fhir`, `/fhir?profile_id=&download=1` | FHIR R4 Bundle (Patient+ABHA, DocumentReference, DiagnosticReport, Observation+LOINC+UCUM+referenceRange+interpretation, MedicationRequest, Condition, vital-sign Observations) |
| GET | `/profiles/{pid}/trends?lang=` | series + `change_percent`, `direction`, `trend_sentence` |
| GET | `/timeline?profile_id=` | events + trends |

## Vitals, dashboard, analysis
| Method | Path | Notes |
|---|---|---|
| GET | `/vitals?profile_id&type&from&to` | types: glucose_fasting, glucose_post, glucose_random, bp, heart_rate, weight, steps, sleep_hours, water_ml, calories, spo2 |
| POST | `/vitals` | `{type, value, value2?, measured_at?, note?, profile_id?}` → `{reading, urgent}` |
| GET | `/profiles/{pid}/dashboard` | + `urgent`, `today` (reminder slots, checkups), `family` counts, `needs_review` |
| POST | `/profiles/{pid}/analysis/run?lang=`, `/analysis/run` | hidden risks, drifts, alerts, trends, ML screening, latest report summary, urgent |
| GET/POST | `/profiles/{pid}/risk/{diabetes\|heart}` | XGBoost + TreeSHAP top 3; POST `{answers:{feature:value}}` adds your own answers. `imputed_features`, band, "screening estimate, not a diagnosis" |
| GET | `/risk-models` | model cards (dataset, CV AUC, limitations) |

## Chat
`POST /profiles/{pid}/chat` or `/chat?profile_id=` — `{message, history[], language: en|hi|ta, scope: "me" | "family:<link_id>"}` →
`{answer, citations[], retrieved[{id,score}], scope, urgent, disclaimer, mode, engine}`. Retrieval = our own 1024-d embeddings (pgvector on Postgres).

## Family consent
| Method | Path | Who |
|---|---|---|
| GET | `/family/permissions` | list of permission keys: records, timeline, summary, vitals, medicines, chat |
| POST | `/family/request` | `{email, relation, message?, permissions}` → always `pending` (no account discovery) |
| GET | `/family/incoming`, `/family/outgoing`, `/family/members` | caller |
| POST | `/family/{id}/respond` | OWNER only: `{approve, permissions?, profile_id?}` |
| PUT | `/family/{id}/permissions` | OWNER only |
| POST | `/family/{id}/revoke` | owner (revoke) or requester (leave): instant 403 afterwards |
| GET | `/family/{id}/profile\|records\|timeline\|summary` | requester, approved, per-permission filtered, audited |

## Care plan
| Method | Path |
|---|---|
| GET/POST | `/profiles/{pid}/checkups` (`{title, kind, due_date, repeat_months, provider, notes}`; GET also returns `suggestions`) |
| PATCH/DELETE | `/checkups/{id}`; POST `/checkups/{id}/done` (plans the next one if repeating) |
| GET/POST | `/profiles/{pid}/reminders` (`{kind, title, detail, times:["08:00"], days:[0-6], medication_id}`; GET returns medicine `suggestions`) |
| PATCH/DELETE | `/reminders/{id}`; POST `/reminders/{id}/done` `{slot:"YYYY-MM-DD HH:MM"}` |
| GET | `/profiles/{pid}/reminders/due`, `/reminders/due` |

## Everyday features
| Method | Path | Notes |
|---|---|---|
| GET | `/profiles/{pid}/medicines/active`, `/profiles/{pid}/medicines/safety` | rule KB: food notes, interactions, duplicate salts, same-type, lab cautions |
| GET | `/foods?q=` | 65 Indian foods (IFCT 2017 / USDA, approx.) |
| POST | `/meals/parse` `{text}` | own parser: "2 idli, sambar" → items + totals |
| POST | `/profiles/{pid}/meals/scan` (photo) | AI boost only (503 without) |
| GET/POST | `/profiles/{pid}/meals` | `{meal_type, items:[{key, servings}]}`; GET `?days=` with `by_day` |
| GET | `/profiles/{pid}/diet` | rule-based tips citing your own values |
| POST | `/profiles/{pid}/wounds` (form: file, label, answers JSON) | own colour analysis + safety rules (+ auto-compare with last scan of same label) |
| GET | `/profiles/{pid}/wounds`, `/wounds/{a}/compare/{b}`, `/wounds/{id}/file-url` | |
| GET | `/remedies`, `/remedies/{key}` | home care + red flags |
| GET/POST | `/profiles/{pid}/devices`; POST `/devices/{id}/sync` | simulated devices (`source=device_demo`, `is_demo`) |
| POST | `/profiles/{pid}/abha/link` `{abha_number?, abha_address?}`; POST `/abha/import`; DELETE `/abha` | MOCK (format check; demo record) |
| GET | `/profiles/{pid}/sos`, `/emergency` | 112 / 108 / Tele-MANAS 14416 + emergency card |
| POST | `/voice/transcribe` (audio; AI boost), `/voice/speak` `{text, language}` | speak = plan for browser speechSynthesis |
| GET | `/profiles/{pid}/doctor-summary.pdf?lang=ta` | adds a Tamil family page |
| GET | `/health` | status, auth mode, db, storage, OCR |
