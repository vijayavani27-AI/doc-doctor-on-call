# GitHub repository settings

Copy these into **GitHub → your repo → ⚙ (About) → Edit**.

## Description (≤ 350 chars)
> DOC (Doctor On Call): AI health copilot that finds the disease hiding between your medical reports. Joins lab values across labs & dates, runs 8 validated formulas in code, links prescriptions & home wellness data, cites every number, explains in English/Hindi/Tamil. Gemini + Claude, FastAPI + React PWA, 2FA.

## Suggested repository name
`doc-doctor-on-call`

## Topics
```
healthcare health-tech ai llm gemini claude fastapi react typescript tailwindcss pwa
medical-records lab-reports wellness clinical-decision-support fib4 egfr loinc two-factor-authentication india hackathon
```

## Social preview text
**DOC (Doctor On Call): find the disease hiding between your reports.**
Every report says "normal". Together they tell a different story.

## Short pitch (for the submission form)
DOC (Doctor On Call) is an AI-powered personal health copilot for Indian families managing chronic illness. It reads lab reports, prescriptions (even handwritten) and home wellness data such as BP, sugar, weight, steps and sleep.

Every value is confirmed by the user, converted to one standard unit, and mapped to a LOINC code. The core innovation, the **Hidden Disease Finder**, joins values from *different* reports, labs and dates and runs 8 published clinical formulas in deterministic, tested code. This reveals risks that no single report shows:
- liver scarring (FIB-4/APRI)
- silent kidney decline (eGFR slope)
- thalassaemia trait (Mentzer)
- insulin resistance (TyG)

DOC also checks medicines for prescribing cascades, kidney-dose problems and the NSAID "triple whammy". It links wellness readings to medicines (e.g. *BP rose after a painkiller was started*), ranks the Next Best Test by value per rupee, and produces a one-page doctor summary with PDF and expiring share links.

Gemini or Claude reads and explains in English, Hindi or Tamil. Every chat answer cites its sources and is fact-checked by a second AI pass.

**Measured results:**
- 47/47 tests pass
- 9/9 formulas match hand calculations
- the offline reader is 100% accurate on 782 values
- Gemini vision read 37/37 values from synthetic phone photos with 0 hallucinations

**Security and platform:** TOTP 2FA, encrypted uploads, PII redaction, CSP, audit log. It runs as an installable mobile PWA with Docker, CI and a one-click Render blueprint.

## Suggested first commit message
```
feat: DOC (Doctor On Call), AI health copilot with Hidden Disease Finder

- FastAPI backend: TOTP 2FA, encrypted uploads, Gemini/Claude + offline report reader,
  LOINC normaliser, unit harmonisation, 8 validated formulas, trend model, medicine rules,
  wellness data with guideline targets, doctor summary PDF and share links
- React + Tailwind PWA: public site (home, about, FAQ, contact, legal), onboarding tour,
  dashboard, upload/confirm, records, trends, hidden risks, wellness, medicines,
  grounded chat, doctor visit, settings, guide
- Curated datasets, demo family, test kit with answer key, 47 tests, evaluation scripts, CI, Docker, Render
```
