# Safety, privacy and responsible AI

DOC is a **decision-support and education tool**. It never diagnoses and never prescribes.
This page explains how the code keeps people safe and keeps their data private.
Every rule below is in the code; the file name is given so you can check it.

---

## 1. Clinical safety rules

### 1.1 Wording
- DOC **never diagnoses** and **never tells anyone to start, stop or change a medicine**. It gives the question to ask the doctor.
- Sentences use calm words: **"may"**, **"can indicate"**, **"worth discussing with your doctor"**.
- Plain-language sentences come from curated templates in English, Tamil and Hindi (`services/templates.py`, `data/tamil.json`), not from an AI. So the wording is predictable and can be reviewed.
- The AI chat prompt has the same rules: use only the records, cite them, never diagnose, never give doses (`services/assistant.py`).

### 1.2 Lab flags are computed in code, never by an AI
`services/flags.py` turns a number into one of five flags:

| Flag | Rule (checked in this order) |
|---|---|
| `critical_low` | value < critical low limit |
| `critical_high` | value > critical high limit |
| `low` | value < reference low |
| `high` | value > reference high |
| `normal` | otherwise |

- Critical limits come from the test catalogue `data/lab_tests.json`. Eight tests have them today: haemoglobin, platelets, WBC, sodium, potassium, calcium, fasting sugar and post-meal sugar.
- The flags map to FHIR interpretation codes (N, L, H, LL, HH) for the FHIR export.
- Hidden Disease Finder scores (FIB-4, eGFR and others) are unit-tested Python, with published cut-offs.

### 1.3 Medicine safety is deterministic
`services/medsafety.py` reads a fixed knowledge base, `data/med_safety.json`:
food and timing notes, medicines that may interact, duplicate salts, two medicines of the same type, and cautions linked to your latest lab values.
No AI is used. If nothing is found, the app says so and suggests a pharmacist check, because a rule list cannot cover everything.

### 1.4 Disclaimer on every AI or advice response
`services/templates.py` holds the disclaimer:

> DOC explains your records in simple words. It does not diagnose or prescribe. Please discuss any result or change with your doctor. In an emergency call 112.

It is added to chat answers, explanations, record summaries, family summaries and other advice responses (in English, Tamil or Hindi).

### 1.5 Urgent banner ("see a doctor now / call 112")
`services/safety.py` decides this with code rules only. If any rule fires, the response gets an `urgent` block with reasons and phone numbers.

| Rule | Trigger |
|---|---|
| Critical lab | The **latest confirmed** value of any test is `critical_low` or `critical_high` |
| Home BP | BP **≥ 180 top or ≥ 120 bottom** in the last 7 days |
| Home sugar | Sugar **< 54 or > 400 mg/dL** in the last 7 days |
| Oxygen | SpO₂ **< 90%** in the last 7 days |
| Urgent words | A question mentions chest pain, trouble breathing, stroke signs, fainting, heavy bleeding, seizure or self-harm, in **English, Tamil or Hindi** |

- Numbers shown: **112** (all emergencies) and **108** (ambulance).
- If self-harm words are found, **Tele-MANAS 14416** (free, 24x7 mental health helpline) is added.
- The banner shows up to 5 reasons.

### 1.6 Low-confidence values go to a review list
- Every value read from a document has a confidence score and the exact source line.
- Below **0.75** → `needs_review` (`flags.REVIEW_THRESHOLD`). These rows are highlighted as "Check this".
- OCR results get a lower confidence, because OCR can misread digits (`services/extraction.py`).
- **Nothing counts until the person confirms it.** Only confirmed values are used for flags, formulas, chat and the urgent banner.
- After saving, a person can fix a value (`PUT /records/{id}`). The value is re-normalised and re-flagged in code and marked `user_verified`.

### 1.7 Risk check wording (XGBoost models)
`services/risk.py`:
- Results are called a **"screening estimate, not a diagnosis"**, with the training dataset named.
- Bands: low (< 20%), moderate (20–50%), high (≥ 50%). Template wording: low = "usually means a low risk", moderate/high = "can indicate … worth discussing with your doctor".
- The top 3 factors (TreeSHAP) use only the person's **own** values. Missing or out-of-range values are listed separately as "imputed".
- At least 2 real values are needed, or no estimate is given.
- Model cards list the limitations (non-Indian, small, old cohorts).

### 1.8 Wound check rules
`services/wound.py`:
- The photo model measures **colours only** (redness, yellow areas, dark areas, rough size). It cannot diagnose infection.
- **Questionnaire answers override the photo.** Code rules decide the urgency:

| Level | Examples of rules |
|---|---|
| Emergency | Bleeding that won't stop after 10 minutes of pressure; fever **with** spreading redness |
| See a doctor today | Deep or gaping wound; animal bite; diabetes + foot or leg wound (IWGDF); pus, bad smell, worse pain, spreading redness, fever; lots of dark tissue in the photo |
| See a doctor in 2–3 days | Numbness; wound older than 14 days; yellow areas in the photo; redness reaching the photo edges |
| Home care | None of the above |

- Emergency results show 108 / 112. Too-dark or too-bright photos get a "retake the photo" note.

### 1.9 Demo data is labelled
All demo people, reports, family links and simulated devices carry `is_demo` (simulated device readings also have `source=device_demo`), so demo data is never mixed up with real data.

### 1.10 Other safety points
| Risk | Mitigation |
|---|---|
| Wrong arithmetic | AI never computes scores. Formulas are deterministic code with unit tests against hand calculations. |
| Hallucinated chat answers | The AI sees only ID-tagged records and the most relevant retrieved chunks, must cite IDs, and must say "I don't know" when records are silent. A second verifier pass checks claims. Without AI, answers come from rules + our own retrieval. |
| Over-alarming | Red only for validated high-risk cut-offs or critical values. Calm "ask your doctor" wording. |
| Formula misuse | Each card shows the formula, inputs, dates, labs, citation and limits. |

---

## 2. Security model

### 2.1 Sign-in (Firebase)
- People sign in with **Google** or **email + password** through Firebase Authentication.
- The browser sends the Firebase ID token once to `POST /api/auth/firebase`. The server checks it in `services/firebase_auth.py`:
  - RS256 signature against Google's public keys,
  - audience = our Firebase project id,
  - issuer = `https://securetoken.google.com/<project>`,
  - expiry, issued-at and subject present, and `auth_time` not in the future.
- The server then issues its own short session JWT (`security.py`).
- An email account is linked to an existing DOC account only if the email is verified.
- Failed sign-ins are rate-limited (5 per 15 minutes per IP).
- Local email/password accounts exist only in development mode (no Firebase configured). 2FA codes were removed in v2; Firebase handles sign-in.

### 2.2 Database access (Supabase)
- **The browser never talks to Supabase.** Only the API connects, using the service role key from an environment variable.
- **Row-level security is ON with no policies on every table** = deny-all for Supabase's `anon` and `authenticated` roles. This is set in `database.py` (`init_db`) and in `backend/schema.sql`.
- All authorisation (owner checks, family consent, permission filtering) runs in backend code on **every request**.

### 2.3 Files
`services/storage.py` and `routers/records_api.py`:
- Every uploaded file is **Fernet-encrypted on the server first** (AES-128-CBC + HMAC-SHA256).
- Then it is stored in a **private** Supabase Storage bucket at `{uid}/{uuid}-{filename}.enc` (or in an encrypted local folder in development).
- To view a file, the app asks for a **5-minute signed URL** to our own API: `/api/files/{token}`. The API checks the token, checks ownership again, decrypts and streams the file. Every view is in the audit log.
- Upload checks: file type by magic bytes, jpg/png/webp/pdf only, up to 15 MB, first 4 PDF pages.

### 2.4 Family consent
`services/family.py` and `routers/family.py`:
- Asking to see someone **never grants access**. Every request starts as `pending`.
- The reply is the same whether or not the email has an account, so nobody can discover who uses DOC.
- **Only the data owner** can approve, deny, change permissions or revoke. The requester can only withdraw or leave.
- The owner chooses exactly what to share: records, timeline, summary, vitals, medicines, chat.
- Pending, denied or revoked → **403**, checked again on every request, so revoking works instantly.
- Responses are filtered by permission. Family chat retrieves only the sections the owner allowed.
- Every family access is written to the audit log, which the owner can see.

The 4 required tests are in `backend/tests/test_family.py`:

| Test | What it proves |
|---|---|
| `test_unapproved_user_cannot_read` | A pending request gets 403 on profile, records, timeline, summary and chat; a stranger gets 404 |
| `test_approved_read_is_filtered` | The owner can approve less than asked; hidden parts never appear; access shows in the owner's audit log |
| `test_revoke_blocks_instantly` | After revoke, the very next request is 403, chat included |
| `test_requester_cannot_self_approve` | The requester cannot approve or change permissions on their own request |

Three more family tests cover permission changes and deny, requests to unknown emails, and the demo family links.

### 2.5 Operations
| Control | Where |
|---|---|
| CORS allow-list from `ALLOWED_ORIGINS` | `config.py`, `main.py` |
| Rate limit on AI and heavy endpoints (chat, upload, meal scan, wound scan, voice), default 12 per minute per user | `security.py` `ai_limiter` |
| Uniform errors `{"error": "<slug>", "detail": ...}` | `main.py` exception handlers |
| Structured JSON logs with request id, route, status and time only. No bodies, query strings, names, emails or health values (no PHI) | `main.py` `JsonFormatter` |
| Security headers: CSP, X-Frame-Options DENY, nosniff, no-referrer, `Cache-Control: no-store` on API | `main.py` |
| PII redaction (names, phones, emails, Aadhaar-like numbers, UHID/MRN, addresses) before text goes to the optional AI | `services/pii.py` |
| `AI_SEND_IMAGES=false` stops images being sent to the AI (images cannot be text-redacted) | `config.py` |
| Secrets only in env vars / `backend/.env`, never in the frontend | `.env.example` |

### 2.6 User control
Full access log, JSON export, FHIR export, expiring and revocable doctor share links, and "delete everything". This follows the principles of India's **Digital Personal Data Protection Act, 2023** (consent, purpose limitation, erasure).

---

## 3. What is mocked or simulated
| Item | Status |
|---|---|
| **ABHA** link and import | Mock. The format is checked and a demo record can be imported. Real linking needs ABDM sandbox access and OTP consent. |
| **Connected devices** (BP monitor, glucometer, band, scale) | Simulated readings marked `source=device_demo` and `is_demo` |
| **Demo family** | Synthetic people and labs, all `is_demo` |

## 4. Fairness and inclusion
- English, Hindi and Tamil, simple words, voice input and read-aloud.
- Race-free eGFR (CKD-EPI 2021) and Asian BMI cut-offs (WHO Asia-Pacific).
- Known gap: the risk models and many formula cut-offs come from non-Indian cohorts.

## 5. Regulatory position
DOC is positioned as **patient education and visit preparation**. Production use of risk scoring would follow India's CDSCO Software-as-a-Medical-Device pathway with clinical validation.
