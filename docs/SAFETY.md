# Safety, privacy and responsible AI

## Clinical safety
| Risk | Mitigation |
|---|---|
| AI misreads a value | Per-value confidence + source line; anything below 0.8 is highlighted; **nothing enters the record until the user confirms it**; the original file is always viewable |
| AI does wrong arithmetic | AI never computes scores. Formulas are deterministic code with unit tests against hand calculations |
| Hallucinated chat answers | Context contains only the person's records, each tagged with an ID. The model must cite IDs. A second "verifier" pass checks every claim and corrects or flags it. The model says "I don't know" when the records are silent |
| Over-alarming users | Red only for validated high-risk cut-offs or critical values. Calm "ask your doctor" wording. The snapshot score is labelled "not a medical score". Teach-back quiz checks understanding |
| Formula misuse | Each card shows the formula, inputs, dates, labs, citation and limits (FIB-4 not validated under 35; Mentzer only when MCV < 80; TyG skipped if already diabetic) |
| Emergencies | Critical lab values, very high home BP (≥180/110) and SpO₂ < 92% trigger "contact a doctor today / emergency" messages with 112/108 |
| Medicine changes | DOC never tells anyone to stop, start or change a medicine; it gives the question to ask the doctor |

## Privacy & security
- **Accounts:** bcrypt (cost 12), TOTP 2FA with 8 hashed one-time backup codes, 5-minute 2FA challenge tokens that can't be used as sessions, rate-limited login/OTP/contact.
- **Data at rest:** uploaded files and TOTP secrets are encrypted with Fernet (AES-128-CBC + HMAC-SHA256).
- **Data to AI:** names, phones, emails, Aadhaar-like numbers, UHID/MRN and addresses are removed from text before AI calls. Images cannot be text-redacted, so `AI_SEND_IMAGES=false` disables sending them.
- **Access control:** every profile, report, medicine, reading and share link is ownership-checked (covered by tests).
- **Web hardening:** Content-Security-Policy, X-Frame-Options DENY, nosniff, no-referrer, `Cache-Control: no-store` on API responses, upload type checks by magic bytes, size limits, a path-traversal-safe samples endpoint.
- **User control:** expiring and revocable share links (first name only, views counted), full access log, JSON export, account deletion. This follows the principles of India's **Digital Personal Data Protection Act, 2023** (consent, purpose limitation, erasure).
- **Secrets:** API keys live only in `backend/.env` (git-ignored) or in hosting environment variables, never in the frontend bundle.

## Fairness & inclusion
- Explanations in **English, Hindi and Tamil** at a 6th-grade reading level, plus voice input and read-aloud.
- **Race-free** eGFR (CKD-EPI 2021) and **Asian BMI cut-offs** (WHO Asia-Pacific).
- Built for caregivers managing family members.

## Regulatory position
DOC is positioned as **patient education and visit preparation (decision support)**, not diagnosis. Production use of risk scoring would follow India's CDSCO Software-as-a-Medical-Device pathway with clinical validation.
