# GitHub repository settings

Copy these into **GitHub → your repo → ⚙ (About) → Edit**.

## Description (≤ 350 chars)
> DOC (Doctor On Call): AI health copilot that finds the disease hiding between your medical reports. Own OCR (Tesseract, English+Tamil), parser, XGBoost+SHAP risk models and RAG; 8 validated formulas in code; FHIR R4; consent-based family sharing; English/Hindi/Tamil. FastAPI + React PWA, Firebase, Supabase.

## Website
`https://doc-doctor-on-call.onrender.com`

## Suggested repository name
`doc-doctor-on-call`

## Topics
```
healthcare health-tech ai llm gemini claude fastapi react typescript tailwindcss pwa
medical-records lab-reports wellness clinical-decision-support fib4 egfr loinc india hackathon
firebase supabase pgvector fhir xgboost shap tesseract ocr abha
```

## Social preview text
**DOC (Doctor On Call): find the disease hiding between your reports.**
Every report says "normal". Together they tell a different story.

## Short pitch (for the submission form)
DOC (Doctor On Call) is an AI-powered personal health copilot for Indian families managing chronic illness. It reads lab reports, prescriptions and home wellness data such as BP, sugar, weight, steps and sleep.

DOC uses **its own models first**: a PDF text reader and **Tesseract OCR (English + Tamil)**, a dictionary-based parser, a LOINC normaliser and a unit converter. Every value is confirmed by the user, and can be corrected later. Gemini or Claude is only an optional boost when DOC's own reading is weak.

The core innovation, the **Hidden Disease Finder**, joins values from *different* reports, labs and dates and runs 8 published clinical formulas in deterministic, tested code. This reveals risks that no single report shows:
- liver scarring (FIB-4/APRI)
- silent kidney decline (eGFR slope)
- thalassaemia trait (Mentzer)
- insulin resistance (TyG)

DOC also:
- screens diabetes and heart risk with **two XGBoost models** trained on public datasets, with **SHAP** showing which of your values mattered
- checks medicines with a deterministic safety knowledge base (interactions, double-ups, food notes, kidney doses, prescribing cascades)
- links wellness readings to medicines (e.g. *BP rose after a painkiller was started*)
- answers questions with citations, using its own embeddings and pgvector search
- lets families share **only with explicit, revocable consent**, per permission
- adds a care plan, food & diet log, wound photo check, home-care guide and an SOS button with nearby hospitals
- exports **FHIR R4** (with ABHA) and a one-page doctor summary PDF with a Tamil family page

Flags (including critical values) are computed in code, never by an AI. Urgent code rules show a "see a doctor now / call 112" banner.

**Measured results:**
- 94/94 automated tests pass (incl. 4 family-consent tests and FHIR R4 validation)
- 9/9 formulas match hand calculations
- own reader 100% accurate on 782 values in 100 synthetic PDFs
- AI boost read 37/37 values from synthetic phone photos with 0 hallucinations
- XGBoost 5-fold CV AUC: diabetes 0.834 ± 0.039, heart 0.913 ± 0.032

**Security and platform:** Firebase sign-in (Google or email) verified on the server, backend-only Supabase access with row-level security deny-all, Fernet-encrypted files with 5-minute signed URLs, CORS allow-list, rate limits, PHI-free logs, audit log, export and delete. It runs as an installable mobile PWA with Docker (Tesseract included), CI and a one-click Render blueprint.

## Suggested commit message for v2
```
feat: DOC v2: own models, Firebase, Supabase, family consent, FHIR

- Own records pipeline: pypdf / PyMuPDF + Tesseract OCR (eng+tam) -> dictionary NER -> normaliser -> units -> flags in code;
  AI only as an optional boost when the own reading is weak; corrections via PUT /records/{id}
- XGBoost diabetes + heart screening with TreeSHAP, own 1024-d embeddings + pgvector RAG, wound colour model, meal parser
- Firebase sign-in (replaces TOTP 2FA), Supabase Postgres + Storage with RLS deny-all, Fernet-encrypted files, signed URLs
- Consent-based family sharing, care plan, food & diet, wound check, home care, SOS + nearby hospitals, ABHA (mock), FHIR R4
- 94 tests, docs and evaluation updated
```
