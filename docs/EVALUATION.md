# DOC evaluation report

Every number below can be reproduced from `backend/`. The tests, formulas and reader were re-run on the v2 code. The AI boost result is from the earlier run of `eval_ai.py` (it uses AI quota).

| Check | Result |
|---|---|
| Automated tests | **92 / 92 passed** |
| Formulas vs hand calculations | **9 / 9** |
| Own reader, 100 synthetic PDFs (782 values) | names, values and dates **100%** |
| Optional AI boost (Gemini) on 6 synthetic photos (37 values) | recall **100%**, **0** hallucinated tests |
| XGBoost diabetes (Pima, n = 768) | 5-fold CV AUC **0.834 ± 0.039**, Brier 0.157 |
| XGBoost heart (Cleveland, n = 303) | 5-fold CV AUC **0.913 ± 0.032**, Brier 0.122 |

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

## 2. Own report reader (no AI)
`python scripts/evaluate.py 100`

The script generates 100 random Indian-style lab PDFs (782 values in total) with:
- randomised test-name aliases (SGPT / ALT / S.G.P.T…)
- 4 unit systems (lakhs/cumm, ×10³/µL, /cumm, mmol/L, µmol/L)
- different column layouts, H/L flags and 4 date formats

Each PDF goes through the real pipeline (pypdf text → dictionary NER parser → normaliser → unit converter). These are text PDFs, so this measures the parser, not OCR.

| Metric | Result |
|---|---|
| Test name recognised (mapped to the correct code) | **100.0%** |
| Value + unit conversion correct (±1%) | **100.0%** |
| Report date correct | **100.0%** |

## 3. Optional AI boost (Gemini vision) on synthetic phone photos
`python scripts/eval_ai.py 6` (uses your AI quota)

The script renders 6 lab reports as images with random rotation (±3°), blur, noise and JPEG compression, then has the AI read them. In v2 the AI is only an optional boost: the app calls it only when our own reading is weak (for example a photo).

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
`pytest -k test_kit` (test `test_test_kit_matches_answer_key`)

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
`cd backend && python -m pytest -q -p no:logging` gives **92 passed** (measured on the v2 code).

| File | Tests | What it covers |
|---|---|---|
| `test_formulas_units.py` | 33 | FIB-4 (incl. age-65 cut-off), eGFR CKD-EPI 2021 and stages, Mentzer, TyG, APRI, corrected calcium, unit conversion, platelet unit from magnitude, name normaliser, parser (values, units, ranges, date), dates, PII redaction, medicine matching |
| `test_api.py` | 15 | Demo hidden risks, dashboard/trends/timeline, doctor PDF and share links, offline chat citations, local sign-in, **Firebase token exchange**, sign-in rate limit, cross-user access control, upload → confirm, wrong file types, **full test kit vs answer key**, contact form, wellness (BP rise after a painkiller, CSV import, validation) |
| `test_flags_fhir.py` | 14 | Flag rules incl. critical limits from the catalogue, the 0.75 review threshold, **FHIR bundle structure**, **validation against FHIR R4B models** (`fhir.resources`), ABHA in the Patient resource |
| `test_risk.py` | 11 | Probability range and shape, deterministic output, sensible direction (higher sugar/BMI/age raises diabetes risk), **SHAP contributions add up to the model output**, imputation of missing / out-of-range values, too-few-values error, unknown model, light model card |
| `test_features.py` | 12 | Record corrections + signed file URLs, bad upload rejection, vitals + **urgent banner**, checkups and reminders, analysis + risk endpoints, chat RAG + **urgent words**, medicine safety KB, meals and diet, **wound rules and compare**, remedies/devices/SOS/voice, `/me` and error format, **Tamil doctor PDF page** |
| `test_family.py` | 7 | The 4 required consent tests (**unapproved can't read, approved is filtered, revoke blocks instantly, requester can't self-approve**), permission change and deny, request to an unknown email (no account discovery), demo family links |

## 6. Risk models (XGBoost + TreeSHAP)
Trained with:
```bash
python -I scripts/train_risk.py --pima ../datasets/public/pima/pima-indians-diabetes.csv \
    --cleveland ../datasets/public/cleveland/processed.cleveland.data --out data/models
```
All numbers come from `backend/data/models/diabetes_meta.json` and `heart_meta.json` (stratified 5-fold cross-validation, metrics computed with NumPy).

| Metric | Diabetes | Heart |
|---|---|---|
| Dataset | Pima Indians Diabetes (NIDDK / UCI) | UCI Heart Disease, Cleveland (processed) |
| Rows / positives | 768 / 268 (34.9%) | 303 / 139 (45.9%) |
| Features | 8 | 13 |
| CV ROC-AUC (mean ± SD) | **0.834 ± 0.039** | **0.913 ± 0.032** |
| AUC per fold | 0.868, 0.767, 0.838, 0.838, 0.858 | 0.859, 0.930, 0.909, 0.938, 0.927 |
| Out-of-fold AUC | 0.834 | 0.906 |
| Brier score (lower is better) | **0.157** | **0.122** |
| Brier of "always predict the base rate" | 0.227 | 0.248 |
| Calibration intercept / slope (ideal 0 / 1) | 0.007 / 0.998 | −0.006 / 0.998 |
| Model settings | max depth 3, 150 rounds, eta 0.03 | max depth 3, 150 rounds, eta 0.05 |

**Bands.** low < 20% ≤ moderate < 50% ≤ high. These round cut-offs were fixed before training. Out-of-fold check (the observed rate stays inside each band's range, within ±0.05):

| Band | Diabetes: n, predicted → observed | Heart: n, predicted → observed |
|---|---|---|
| Low | 315, 9.3% → 7.9% | 110, 8.3% → 8.2% |
| Moderate | 224, 34.2% → 39.3% | 65, 33.9% → 32.3% |
| High | 229, 70.4% → 67.7% | 128, 84.5% → 85.2% |

**Honest note on AUC.** Hyperparameters were chosen from an 18-setting grid **on the same 5 folds** that produced the reported metrics. So the CV AUC is **slightly optimistic**. There is no separate held-out test set and no external validation.

**Explanations.** The top 3 factors are exact TreeSHAP contributions from XGBoost (`pred_contribs`). A test checks that they add up to the model output. Only the person's own values are used in the explanation; missing values are listed as "imputed".

**Model-card limitations (from the meta files):**
- Diabetes: only Pima Indian women aged 21+ (Arizona, USA). Glucose and insulin are 2-hour OGTT values, not fasting values or HbA1c. The outcome is diabetes within 5 years, from a 1980s study. Only 768 people, with many missing insulin and skin-fold values.
- Heart: 303 patients referred for angiography at one US clinic around 1988. Several inputs (exercise ECG, fluoroscopy, thallium scan) are hospital tests most people won't have. The outcome is >50% artery narrowing on angiography, not future heart-attack risk. Small dataset.
- Both: a screening estimate, not a diagnosis.

## 7. Dataset provenance
Full details are in `datasets/public/README.md`. The files were downloaded on 2026-10-09 and are treated as untrusted data (parsed only as numeric CSV).

| File | Source | Rows | Licence |
|---|---|---|---|
| `pima/pima-indians-diabetes.csv` | NIDDK via the UCI ML Repository (widely used mirror) | 768 | Public research dataset; cite Smith et al. 1988 |
| `cleveland/processed.cleveland.data` | UCI ML Repository, dataset 45 | 303 | CC BY 4.0; cite Janosi et al. 1988 |

SHA-256 checksums for both files are in that README, so anyone can check them. In Pima, a 0 in glucose, BP, skin-fold, insulin or BMI means "not measured" and is set to missing. In Cleveland, `?` means missing (4 in `ca`, 2 in `thal`) and the target is `num > 0`.

## 8. Honest limitations
- **OCR is not in these numbers.** Tesseract runs only in the Docker image or where Tesseract is installed. On a machine without it, photos and scanned PDFs need the optional AI boost or manual typing. We have not yet measured OCR accuracy on real scans.
- **Synthetic data.** The reader and AI evaluations use synthetic documents, which are cleaner than real scans and handwriting. **Real accuracy will be lower.** That is why every value carries a confidence score and the confirm step is mandatory.
- **Small AI sample.** The AI vision test has 6 images and 37 values because of free-tier quota. A larger set (`eval_ai.py 50`) is recommended with billing on.
- **Non-Indian cohorts.** The risk models are trained on old US cohorts (Pima women; Cleveland 1988). Many formula cut-offs also come from non-Indian studies, and TyG cut-offs vary by population.
- **Optimistic AUC.** See section 6.
- **Next steps:** a clinician-labelled set of real, anonymised Indian reports; OCR accuracy on real phone photos; Indian-cohort recalibration of the risk models.
