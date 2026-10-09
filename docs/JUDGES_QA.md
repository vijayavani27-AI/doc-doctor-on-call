# Likely judge questions and our answers

## Idea & fit

**How is DOC different from uploading reports to ChatGPT or Gemini?**
A chat tool reads one file at a time and does medical arithmetic with a language model. DOC:
- reads reports with **its own OCR and parser**, so it works with no external AI at all
- keeps a unit-harmonised, LOINC-coded record across labs and years
- **joins values from different reports** using validated time windows
- runs **8 published formulas in tested code**
- links every number to its printed source line
- connects lab results, prescriptions, symptoms and home wellness readings
- works proactively: alerts, Next Best Test, care gaps, reminders
- lets families share **with consent**, per permission, revocable at any time

**Does it cover everything in the brief?**
Yes. The brief names four inputs:
- *medical records, prescriptions, diagnostic reports:* upload → own reader → review → confirm → structured record, with corrections later
- *wellness data:* home BP, sugar, weight/BMI, heart rate, SpO₂, steps, sleep, water and calories, by manual entry, CSV import or simulated devices

It produces "understand / organise / manage / actionable insights" through plain-language summaries, timelines, the Hidden Disease Finder, risk check, medicine checks, care plan, diet tips and the doctor summary.

**Why these formulas?**
They use tests Indian patients already have (CBC, LFT, KFT, lipids, sugar). They are published and clinically used. They target common, often-missed conditions: fatty liver/fibrosis, CKD, thalassaemia trait (~3–4% carriers in India) and insulin resistance.

**Doctors already use MDCalc.**
MDCalc needs a doctor to find and type the numbers. DOC finds them automatically across many reports, labs and years, converts the units, tracks the score over time, and does all this for families before the visit.

## Own models vs API wrapper

**Is DOC just a wrapper around an LLM API?**
No. With no AI key, DOC still does everything except photo meal scans and AI voice transcription:

| Task | Our own model / code |
|---|---|
| Reading documents | pypdf text layer, or PyMuPDF page images + **Tesseract OCR (English + Tamil)** |
| Turning text into data | Dictionary-based NER parser + LOINC normaliser + unit converter |
| Flags, formulas, trends | Unit-tested Python |
| Risk screening | **Two XGBoost models** trained by us on public datasets, with **TreeSHAP** explanations |
| Chat retrieval | **Own 1024-d hashing embeddings** + pgvector |
| Wound photos | Own colour-analysis model + safety rules |
| Meals | Own text parser over a 65-food Indian table |
| Medicines, diet, home care | Rule knowledge bases with sources |
| Tamil/Hindi sentences | Curated templates |

Gemini or Claude is an **optional boost**: used only when our own reading is weak (fewer than 3 items, low confidence, or OCR / no text), for meal photos, and for free-form chat answers.

**Which AI models, when they are used?**
- **Claude Opus 5.5** (Anthropic SDK) and **Gemini Flash** (Google Gen AI SDK), tried in order with automatic fallback. Gemini tries 3.8 → 3.7 → 3.6 → 3.5 → flash-latest → 3.1-flash-lite.
- Every call uses a strict JSON schema, a per-call timeout and a total time budget.
- If no engine answers, the app uses its own models.

## Technical

**How do you combine values from different dates safely?**
Each formula has a pairing window: FIB-4 120 days, TyG 14 days (fasting pair), Mentzer same sample. The engine anchors on one input, takes the nearest value of each other input inside the window, prefers the same report, and shows every date and lab on the card.

**Is the AI doing the medical maths?**
No. Formulas, flags (including critical), trends, rules and wellness thresholds are plain Python with unit tests (`formulas.py`, `flags.py`, `engine.py`, `wellness.py`).

**Why XGBoost + SHAP for the risk check? What are its limits?**
- XGBoost works well on small tabular data, handles missing values natively, and gives **exact TreeSHAP** explanations. So we can show "these 3 of *your* values moved the estimate most".
- Measured: diabetes 5-fold CV AUC **0.834 ± 0.039** (Pima, 768 people), heart **0.913 ± 0.032** (Cleveland, 303 people). Calibration slope is close to 1 for both.
- Limits, said openly in the app and in `docs/EVALUATION.md`:
  - Old, small, **non-Indian** cohorts (Pima women in Arizona; one US clinic in 1988).
  - Diabetes uses 2-hour OGTT sugar, not HbA1c. Heart uses hospital tests most people don't have, so those are often imputed.
  - Hyperparameters were picked on the same CV folds, so AUC is slightly optimistic.
  - Always labelled "screening estimate, not a diagnosis".

**How do you stop hallucinations?**
- Numbers never come from the AI. They come from the parser, the person's confirmation and tested code.
- The AI chat only sees ID-tagged records plus chunks retrieved by our own embeddings, and must cite the IDs.
- A second verifier pass checks claims and corrects or flags the answer.
- The model must say "I don't know" when the records don't say.
- For documents, the AI answer is used only when our own reading is weak, every value still goes through the normaliser and flags, and the person must confirm.
- In the vision evaluation, Gemini reported **0 tests that weren't printed**.

**How accurate is it?**
- **94/94 automated tests pass.**
- 9/9 formulas match hand calculations.
- The own reader is 100% accurate on 782 values in 100 synthetic PDFs.
- The AI boost read 37/37 values from 6 rotated, blurry synthetic photos.

Real scans will be harder, which is why the review and confirm steps exist (see `docs/EVALUATION.md`).

**What if a value is read wrong?**
Each value has a confidence score and its source line. Anything below **0.75** is marked "Check this", and nothing is used until the person confirms. After saving, **Fix a value** in the report viewer re-normalises and re-flags it in code and marks it as corrected. The original file is one click away.

**How does wellness data connect with the rest?**
For example, average home BP before vs after an NSAID painkiller was started gives "BP went up after starting Zerodol-P". Other links: home fasting sugar vs target, low-sugar episodes, unplanned weight loss, low SpO₂. Readings feed the chat, the doctor summary, the risk check and the urgent banner.

**How would it scale?**
- The API is stateless (session JWT). SQLite in development, Supabase Postgres + pgvector in production.
- Reading normally needs **no AI call**: OCR and parsing run inside our container.
- The engine is pure Python over one person's records, so it takes milliseconds.
- The rate limiter is in-memory (fine for one instance); several instances would need a shared store.
- The repo includes Docker (with Tesseract), a Render blueprint, `schema.sql` and CI.

## Interoperability

**Do you support FHIR and ABHA?**
- **FHIR R4:** download one record or everything as a Bundle: Patient (with ABHA), DocumentReference, DiagnosticReport, Observation (LOINC, UCUM, reference range, interpretation incl. critical HH/LL), MedicationRequest, Condition and home vital signs. Tests validate it against the FHIR R4B models.
- **ABHA:** you can link an ABHA number (`12-3456-7890-1234`) or address (`name@abdm`) in Settings, and it goes into the FHIR Patient. This is a **mock**: we check the format and can import a demo record. Real ABDM linking needs government sandbox access and the person's OTP consent.

## Privacy, safety, regulation

**How is patient data protected?**
- **Sign-in by Firebase** (Google or email). The server verifies every Firebase ID token (signature, audience, issuer, expiry), then issues its own short session. Failed sign-ins are rate-limited.
- Ownership and family-consent checks on every request (tested).
- Files are **Fernet-encrypted** before storage in a private bucket; viewed only through 5-minute signed URLs to our API.
- PII redaction before any text goes to the optional AI.
- CORS allow-list, rate limits on AI endpoints, uniform errors, logs without health data.
- Audit log, JSON/FHIR export, delete-everything, following DPDP Act 2023 principles.

**Did you drop two-factor authentication?**
Yes. Our own TOTP 2FA was removed in v2 in favour of **Firebase sign-in**. Google accounts can use Google's own 2-Step Verification, and the Settings page suggests turning it on.

**How is Supabase kept secure?**
- **The browser never talks to Supabase.** Only the API connects, with the service-role key from an environment variable.
- **Row-level security is ON with no policies on every table**, which means deny-all for Supabase's public roles. Even if someone found the project URL and anon key, they could read nothing.
- All authorisation is in backend code (`security.py`, `services/family.py`).
- The storage bucket is private, and files inside it are already encrypted.

**How is family consent enforced?**
- Sending a request never shares anything. It starts as **pending**.
- The answer is the same whether or not the email has an account (no account discovery).
- Only the **owner** can approve, choose permissions (records, timeline, summary, vitals, medicines, chat), change them or revoke. The requester gets 404 if they try to approve their own request.
- Every family endpoint goes through one function, `require_access()`, which re-checks the link status and the permission **on every request**. So revoking blocks the very next request.
- Responses and family chat are filtered to the permitted sections.
- Every access is in the owner's audit log.
- 4 required tests prove this: unapproved can't read, approved is filtered, revoke blocks instantly, requester can't self-approve.

**What happens in an emergency?**
Code rules, not AI, add a red **"see a doctor now / call 112"** banner when:
- the latest confirmed lab value is critical,
- home BP is ≥ 180/120, sugar < 54 or > 400, or SpO₂ < 90% in the last 7 days,
- a question mentions chest pain, breathing trouble, stroke signs, fainting, heavy bleeding, seizure or self-harm (English, Tamil or Hindi).

Self-harm words also show **Tele-MANAS 14416**. There is an **SOS button on every screen** with tap-to-call 112 / 108 / 14416, an emergency card, sharing with location, and nearby hospitals from OpenStreetMap. The wound check sends bleeding that won't stop, or fever with spreading redness, straight to "get emergency help now".

**What is mocked?**
ABHA linking and import (format check + demo record), connected devices (simulated readings marked `device_demo`), and the demo family (synthetic, all `is_demo`). Everything else is real code.

**Who is responsible if a score is wrong?**
DOC is decision support, not diagnosis. Every score shows its formula, inputs, citation and limits, so a doctor can check it in seconds. It never tells anyone to change medicines; it gives the question to ask.

**Isn't this a medical device?**
Production use of risk scoring would follow India's CDSCO Software-as-a-Medical-Device pathway with clinical validation. Today DOC is positioned as education and visit preparation.

**Doesn't the name "Doctor On Call" suggest a real doctor?**
It describes an always-available helper for your records. Every AI answer carries a disclaimer that DOC does not diagnose or prescribe, and the Legal page has a medical disclaimer.

## Language & access

**How well does it support Tamil?**
- **OCR** reads English + Tamil (`eng+tam` Tesseract in the Docker image).
- **Summaries, trends, risk sentences and the disclaimer** come from curated Tamil templates, not machine translation.
- The report viewer has a **தமிழில்** button. The doctor PDF can add a **Tamil family page** (proper Tamil font shaping with HarfBuzz).
- **Voice** input and read-aloud use `ta-IN`.
- **Urgent words** are detected in Tamil (for example chest pain, breathlessness, self-harm).
- The whole app menu switches to Tamil (or Hindi).

## Product & impact

**Who is the user?**
A family caregiver (often an adult child) managing a parent's diabetes or BP, with reports from several labs and doctors. Now the parent can share exactly what they choose with the child's own account.

**What is the measurable impact?**
- Earlier detection of liver scarring, kidney decline, thalassaemia trait and insulin resistance.
- Harmful medicine combinations caught (e.g. the triple whammy).
- BP effects of painkillers noticed.
- Missed checkups and doses reduced by the care plan and reminders.
- Fewer repeat tests and generic savings (illustrative).
- Shorter, better-prepared doctor visits.

**What is the business model?**
Free for families. Paid offerings for clinics (pre-visit summaries), diagnostic labs (cross-report insights as a value-add) and insurers or corporate wellness programmes (consented, anonymised screening).

**What would you build next?**
Real ABDM sandbox (HIP/HIU consent flows), Bluetooth BP/glucose meters, WhatsApp reminders, Indian-cohort recalibration of the risk models, and a clinician-labelled real-world evaluation set.
