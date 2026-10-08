# DOC Test Kit: answer key

Use this to check that DOC (Doctor On Call) is working correctly.
The patient is **fictional**: **Ravi Kumar, Male, born 10-05-1972**.
The 6 PDFs come from 3 different (fictional) labs over 2+ years. Each lab uses different units, which is exactly what makes the hidden risks hard to see.

| File | What it is | Tricky part |
|---|---|---|
| `01_lotus_lab_2024-01-15.pdf` | CBC, LFT, KFT, sugar, lipids | Platelets in **lakhs/cumm**, WBC in **cells/cumm** |
| `02_metro_lab_2025-02-20_mmol_units.pdf` | Sugar, kidney, lipids | Everything in **mmol/L** and **µmol/L** (international units) |
| `03_lotus_lab_2026-03-10.pdf` | LFT, KFT, sugar | Liver test **without** a blood count |
| `04_citycare_cbc_2026-04-25.pdf` | CBC only | Platelets in **×10³/µL**, a different lab and date from the liver test |
| `05_prescription_2026-04-28.pdf` | Telma 40, Amlong 5, Atorva 10 | Brand names |
| `06_prescription_2026-06-10.pdf` | Lasix 20, Brufen 400 | A second doctor |

## Steps
1. Sign in, then go to **Settings → Family profiles → Add member**.
   - Name `Ravi Kumar`, Relation `father`, **Sex Male**, **Date of birth 10-05-1972**, Conditions: **High BP**.
   - Save, and make sure **Ravi** is selected in the top bar.
2. **Upload** each PDF (01 → 06). On each review screen, check the values against the PDF, then click **Confirm & save**.
3. Go to **Medicines → Log a symptom**: *Ankle or leg swelling*, started **20-05-2026**.
4. Compare what you see with the tables below.

## 1. Reading and unit conversion (Records → All values)

| Printed on report | DOC should store | Check |
|---|---|---|
| Platelet Count 2.4 lakhs/cumm | **240** ×10⁹/L | 2.4 × 100 |
| Total WBC Count 7400 cells/cumm | **7.4** ×10⁹/L | 7400 ÷ 1000 |
| Glucose Fasting 6.0 mmol/L | **108.1** mg/dL | 6.0 × 18.016 |
| Creatinine 106 µmol/L | **1.20** mg/dL | 106 ÷ 88.4 |
| Cholesterol Total 5.6 mmol/L | **216.6** mg/dL | 5.6 × 38.67 |
| HDL 0.95 mmol/L | **36.7** mg/dL | 0.95 × 38.67 |
| Triglycerides 2.3 mmol/L | **203.7** mg/dL | 2.3 × 88.57 |
| Platelets 155 ×10³/µL | **155** ×10⁹/L | same unit |

The prescriptions should show 5 medicines: Telma 40 = Telmisartan, Amlong 5 = Amlodipine, Atorva 10 = Atorvastatin, Lasix 20 = Furosemide, Brufen 400 = Ibuprofen.

## 2. Hidden Disease Finder (Hidden Risks page)

| Score | Expected | Hand calculation |
|---|---|---|
| **FIB-4** (liver scarring) | **2.70 → 🔴 High risk**, "joined 2 reports · 2 labs". History 1.12 → 2.70 | Age on 25-04-2026 = 53.96 years. (53.96 × AST 52) ÷ (Platelets 155 × √ALT 45 = 6.708) = 2805.9 ÷ 1039.7 = **2.70** (> 2.67 = high). AST/ALT come from Lotus (10 Mar) and platelets from CityCare (25 Apr), 46 days apart. **Platelets 155 is "normal" on its report.** |
| **eGFR** (kidneys) | **65.4 → 🔴 Rapid decline (~11.8 per year)**, badge "every input looked normal" | CKD-EPI 2021 (male): 2024 creatinine 1.0 → 90.7 · 2025 creatinine 1.20 → 72.5 · 2026 creatinine 1.3 → **65.4**. A fall of more than 5 per year counts as rapid. Creatinine was "normal" (0.7–1.3) on every report. |
| **TyG** (insulin resistance) | **9.31 → 🔴 High** | ln(TG 203.7 × FBS 108.1 ÷ 2) = ln(11011) = **9.31** (> 8.8) |
| **TG/HDL** | **5.55 → 🔴 High** | 203.7 ÷ 36.7 |
| **Non-HDL cholesterol** | **179.8 → 🔴 High** | 216.6 − 36.7 |
| **APRI** | **0.84 → 🟡 Watch** | (52 ÷ 40 × 100) ÷ 155 |
| Mentzer | *not shown* | Only applies when MCV < 80 (Ravi's MCV is 87–88) |

**Check them independently.** Use any online FIB-4 calculator (age 54, AST 52, ALT 45, platelets 155) and the National Kidney Foundation eGFR calculator (CKD-EPI 2021: male, 53, creatinine 1.3, which gives ≈ 65).

## 3. Personal normal (bottom of Hidden Risks)
- **Creatinine** 1.0 → 1.3 (+30%), "now right at the limit"
- **Potassium** 4.4 → 5.0 (+14%), "may cross the upper limit in about 4 months"

## 4. Medicines page
| Alert | Why |
|---|---|
| 🔴 **Risky medicine combination for the kidneys** ("triple whammy") | Telma (ARB BP medicine) + Lasix (water pill) + Brufen (NSAID painkiller) together |
| 🟡 **Was the water pill added for swelling caused by a BP medicine?** (prescribing cascade) | Amlong started 28-04 → ankle swelling 20-05 (22 days later) → Lasix added 10-06 |
| 🟡 **Ankle swelling may be linked to Amlong 5** | Swelling started 22 days after Amlong; it's a known side effect |
| 💰 Generic saving ≈ **₹9,100 / year** | Illustrative prices in `backend/data/medicines.json` |

## 5. Other checks
- **Next Best Test:** **Lipid Profile (~₹550)** first, because the last one was more than a year ago and it unlocks TyG, TG/HDL and Non-HDL. Then **Urine ACR** to stage the kidneys.
- **Care gap** (because you ticked High BP): "Due: Lipid Profile".
- **Dashboard score:** about **10–20 → "Talk to your doctor soon"**.
- **Doctor Visit:** the PDF lists all of the above plus "Questions for the doctor".
- **Ask AI:** try "How are my kidneys?". The answer should quote creatinine 1.3 and the eGFR, with 📄 source buttons that open the right report.
- **Timeline → Trends:** the platelet chart shows 240 → 155 with a violet "lab changed" line. The cholesterol chart shows the mmol/L values converted to mg/dL.

If all of the above matches, the reading, unit conversion, formula engine, trend model and medicine rules are working correctly.
