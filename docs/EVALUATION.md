# DOC evaluation report

Every number below can be reproduced from `backend/`.

## 1. Clinical formulas vs hand calculations
`python scripts/evaluate.py`

| Formula | Inputs | DOC | Reference |
|---|---|---|---|
| FIB-4 (Sterling 2006) | age 58.3, AST 55, ALT 50, PLT 155 | 2.926 | 2.926 |
| APRI (Wai 2003) | AST 55, PLT 155 | 0.887 | 0.887 |
| Mentzer (1973) | MCV 66, RBC 5.6 | 11.786 | 11.786 |
| TyG (Simental-Mendía 2008) | TG 150, FBG 90 | 8.817 | 8.817 |
| eGFR CKD-EPI 2021 | F, 50 y, Scr 0.7 | 105.30 | 105.3 |
| eGFR CKD-EPI 2021 | M, 60 y, Scr 1.2 | 69.23 | 69.2 (NKF online calculator: 69) |
| Corrected calcium (Payne 1973) | Ca 8.2, Alb 3.0 | 9.00 | 9.0 |
| TG/HDL | 180 / 45 | 4.00 | 4.0 |
| Non-HDL | 210 − 45 | 165 | 165 |
**9/9 match.** Unit tests also cover band edges (e.g. the FIB-4 age-65 cut-off).

## 2. Offline report reader (no AI)
`python scripts/evaluate.py 100`

The script generates 100 random Indian-style lab PDFs (782 values in total) with:
- randomised test-name aliases (SGPT / ALT / S.G.P.T…)
- 4 unit systems (lakhs/cumm, ×10³/µL, /cumm, mmol/L, µmol/L)
- different column layouts, H/L flags and 4 date formats

Each PDF goes through the real pipeline (pypdf → parser → normaliser → unit converter).

| Metric | Result |
|---|---|
| Test name recognised (mapped to the correct code) | **100.0%** |
| Value + unit conversion correct (±1%) | **100.0%** |
| Report date correct | **100.0%** |

## 3. AI vision reader (Gemini) on synthetic phone photos
`python scripts/eval_ai.py 6` (uses your AI quota)

The script renders 6 lab reports as images with random rotation (±3°), blur, noise and JPEG compression, then has the AI read them.

| Metric | Result |
|---|---|
| Printed values | 37 |
| Recall (test found and mapped to the right code) | **100%** |
| Value + unit accuracy of found tests (±1%) | **100%** |
| Report date correct | 6/6 |
| Hallucinated tests (reported but not printed) | **0** |
| Median time per image | ~29 s (free tier; most of it spent on busy-model fallbacks) |

Engines used: `gemini-3.7-flash`, `gemini-3.6-flash` and `gemini-3.5-flash`, chosen automatically when newer models were overloaded.

## 4. End-to-end test kit with answer key
`pytest -k test_kit`

Six PDFs for one fictional patient (3 labs, 2+ years, mixed units, 2 prescriptions) plus one logged symptom. The test asserts every expected finding:

| Finding | Expected | DOC |
|---|---|---|
| FIB-4, joined across 2 labs, 46 days apart | 2.70, high | 2.70, high, `reports_combined = 2` |
| eGFR with "normal" creatinine every time | 65.4, rapid decline | 65.35, rapid decline −11.8/yr |
| TyG / TG-HDL / Non-HDL | 9.31 / 5.55 / 179.8 | match |
| Triple-whammy medicine combination | red alert | ✓ |
| Prescribing cascade (amlodipine → swelling → furosemide) | yellow alert | ✓ |
| Silent drifts (creatinine, potassium) | detected | ✓ |
| Next Best Test | Lipid profile first | ✓ |

The human-readable version is in `datasets/test_kit/ANSWER_KEY.md`.

## 5. Automated test suite
`pytest -q` gives **47 passed**. It covers:
- formulas and their cut-off bands
- unit conversion and the test-name normaliser
- the parser, date parsing and PII redaction
- medicine matching
- register / login / 2FA / backup codes / rate limiting
- cross-user access control
- upload → review → confirm, with the decrypted original file checked
- the doctor PDF and share links
- offline chat citations
- wellness (BP rise after an NSAID, CSV import, validation)
- the contact form and the samples endpoint (path-traversal guard)
- the full test kit

## 6. Honest limitations
- Synthetic documents are cleaner than real-world scans and handwriting. **Real accuracy will be lower**, which is why every value carries a confidence score and the confirm step is mandatory.
- The AI vision sample is small (6 images, 37 values) because of free-tier quota. A larger set (`eval_ai.py 50`) is recommended with billing on.
- Formula cut-offs come from published cohorts that are often non-Indian, and TyG cut-offs vary by population.
- The next step is a clinician-labelled set of real, anonymised Indian reports.
