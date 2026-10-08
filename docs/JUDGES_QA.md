# Likely judge questions and our answers

## Idea & fit

**How is DOC different from uploading reports to ChatGPT or Gemini?**
A chat tool reads one file at a time and does medical arithmetic with a language model. DOC:
- keeps a unit-harmonised, LOINC-coded record across labs and years
- **joins values from different reports** using validated time windows
- runs **8 published formulas in tested code**
- links every number to its printed source line
- fact-checks chat answers with a second AI pass
- connects lab results, prescriptions, symptoms and home wellness readings
- works proactively: alerts, Next Best Test, care gaps

**Does it cover everything in the brief?**
Yes. The brief names four inputs:
- *medical records, prescriptions, diagnostic reports:* upload → AI reading → confirm → structured record
- *wellness data:* home BP, sugar, weight/BMI, heart rate, SpO₂, steps and sleep, by manual entry or CSV import

It produces "understand / organise / manage / actionable insights" through explanations, timelines, the Hidden Disease Finder, medicine checks, wellness targets and the doctor summary.

**Why these formulas?**
They use tests Indian patients already have (CBC, LFT, KFT, lipids, sugar). They are published and clinically used. They target common, often-missed conditions: fatty liver/fibrosis, CKD, thalassaemia trait (~3–4% carriers in India) and insulin resistance.

**Doctors already use MDCalc.**
MDCalc needs a doctor to find and type the numbers. DOC finds them automatically across many reports, labs and years, converts the units, tracks the score over time, and does all this for families before the visit.

## Technical

**How do you combine values from different dates safely?**
Each formula has a pairing window: FIB-4 120 days, TyG 14 days (fasting pair), Mentzer same sample. The engine anchors on one input, takes the nearest value of each other input inside the window, prefers the same report, and shows every date and lab on the card.

**Is the AI doing the medical maths?**
No. AI reads documents and explains. Formulas, trends, rules and wellness thresholds are plain Python with unit tests (`formulas.py`, `engine.py`, `wellness.py`).

**Which AI models?**
Two engines with automatic fallback:
- **Gemini Flash** (Google Gen AI SDK): tries 3.8 → 3.7 → 3.6 → 3.5 → flash-latest
- **Claude Opus 5.5** (Anthropic SDK)

Both are called with strict JSON schemas (structured outputs). Each request has a timeout and a total time budget. If no engine answers, the app runs in offline mode.

**What is "the model" in your project?**
A hybrid:
- AI for perception (reading) and language (explaining, translating, Q&A)
- a rule and formula engine encoding 8 validated clinical models
- a personal-baseline statistical model (least-squares trend with an r² threshold, projected months-to-limit)
- a ranking model for the Next Best Test (insight per rupee)

We chose validated clinical models over training a new classifier, which would need real labelled patient data and clinical validation.

**How do you stop hallucinations?**
- The model only sees ID-tagged records and must cite the IDs.
- A verifier pass checks every claim and corrects or flags it.
- All numbers come from the deterministic engine.
- The model must answer "I don't know" when the records don't say.
- In the vision evaluation, Gemini reported **0 tests that weren't printed**.

**How accurate is it?**
- 47/47 tests pass.
- 9/9 formulas match hand calculations.
- The offline reader is 100% accurate on 782 values in 100 synthetic PDFs.
- **Gemini vision read 37/37 values from 6 rotated, blurry synthetic photos.**

Real scans will be harder, which is why the confirm step exists (see `docs/EVALUATION.md`).

**What if the AI reads a value wrong?**
Each value has a confidence score and its source line. Anything below 0.8 is highlighted, and nothing is saved until the user confirms. The original file is always one click away.

**How does wellness data connect with the rest?**
For example, average home BP before vs after an NSAID painkiller was started produces "BP went up after starting Zerodol-P". Other links: home fasting sugar vs target for a person with diabetes, low-sugar episodes, unplanned weight loss over 6 months, and low SpO₂. Readings appear in the chat context `[V:bp]` and in the doctor summary.

**How would it scale?**
- The API is stateless (JWT). The database is SQLite now and Postgres via `DATABASE_URL`.
- Reading costs one AI call per document.
- The engine is pure Python over one person's records, so it takes milliseconds.
- Extraction can move to a queue or batch API.
- The repo includes Docker, a Render blueprint and CI.

## Privacy, safety, regulation

**How is patient data protected?**
- TOTP 2FA with backup codes, bcrypt passwords and rate limits.
- Fernet-encrypted files.
- PII redaction before AI calls.
- Ownership checks on every object (tested).
- CSP and other security headers.
- Expiring, revocable share links showing first names only.
- An access log, plus export/delete, following DPDP Act 2023 principles.

**Who is responsible if a score is wrong?**
DOC is decision support, not diagnosis. Every score shows its formula, inputs, citation and limits, so a doctor can verify it in seconds. It never tells anyone to change medicines; it gives the question to ask.

**Isn't this a medical device?**
Production use of risk scoring would follow India's CDSCO Software-as-a-Medical-Device pathway with clinical validation. Today DOC is positioned as education and visit preparation.

**Doesn't the name "Doctor On Call" suggest a real doctor?**
It describes an always-available helper for your records. Every page says DOC is not a doctor, and the Legal page has a medical disclaimer.

## Product & impact

**Who is the user?**
A family caregiver (often an adult child) managing a parent's diabetes or BP, with reports from several labs and doctors.

**What is the measurable impact?**
- Earlier detection of liver scarring, kidney decline and thalassaemia trait.
- Harmful medicine combinations caught (e.g. the triple whammy).
- BP effects of painkillers noticed.
- Fewer repeat tests.
- Generic savings (the demo family: about ₹17k/year, illustrative).
- Shorter, better-prepared doctor visits.

**What is the business model?**
Free for families. Paid offerings for clinics (pre-visit summaries), diagnostic labs (cross-report insights as a value-add) and insurers or corporate wellness programmes (consented, anonymised screening).

**What would you build next?**
ABHA/ABDM + FHIR export, Bluetooth BP/glucose meters, WhatsApp reminders, a clinician-labelled real-world evaluation, and more formulas (HOMA-IR, WHO CVD risk).
