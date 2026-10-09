# Public datasets used to train DOC's screening-risk models

These files are used only by `backend/scripts/train_risk.py`. Treat them as untrusted data: the script
parses them as numeric CSV and nothing else. They were downloaded on 2026-10-09.

| File | Source URL | Rows | Bytes | SHA-256 |
|---|---|---|---|---|
| `pima/pima-indians-diabetes.csv` | https://raw.githubusercontent.com/jbrownlee/Datasets/master/pima-indians-diabetes.data.csv | 768 (no header) | 23,278 | `6bfe5d0f379d17a0e0819b996407e3c09bf80febd4287f2ed212190dfff154af` |
| `cleveland/processed.cleveland.data` | https://archive.ics.uci.edu/ml/machine-learning-databases/heart-disease/processed.cleveland.data | 303 (no header) | 18,461 | `a74b7efa387bc9d108d7d0115d831fe9b414b29ae7124f331b622b4efa0427c8` |

Check: `sha256sum pima/pima-indians-diabetes.csv cleveland/processed.cleveland.data`

## Pima Indians Diabetes

- **Origin:** National Institute of Diabetes and Digestive and Kidney Diseases (NIDDK), distributed via the UCI
  Machine Learning Repository. The file above is a widely used mirror (Jason Brownlee's dataset collection).
- **Citation:** Smith JW, Everhart JE, Dickson WC, Knowler WC, Johannes RS. *Using the ADAP learning algorithm to
  forecast the onset of diabetes mellitus.* Proc Annu Symp Comput Appl Med Care, 1988:261-265.
- **Licence:** public research dataset (UCI ML Repository / NIDDK). Cite Smith et al. 1988 when you use it.
- **Columns:** pregnancies, 2-h OGTT plasma glucose (mg/dL), diastolic BP (mmHg), triceps skin-fold (mm),
  2-h serum insulin (µU/mL), BMI, diabetes pedigree function, age (years), outcome (1 = diabetes within 5 years).
- **Preprocessing:** a 0 in glucose, diastolic BP, skin-fold, insulin or BMI means "not measured" and is set to
  missing (NaN). XGBoost handles missing values natively.
- **Limitations:** only Pima Indian women aged 21 or older from Arizona, USA (1980s). Glucose and insulin are
  2-hour glucose-tolerance values, not fasting values or HbA1c. 268/768 positive. Many insulin (374) and skin-fold
  (227) values are missing. The model may not fit men, other ethnic groups or younger people.

## UCI Heart Disease, Cleveland (processed)

- **Origin:** UCI Machine Learning Repository, dataset 45 ("Heart Disease"), Cleveland Clinic Foundation subset.
- **Citation:** Janosi A, Steinbrunn W, Pfisterer M, Detrano R. *Heart Disease* [Dataset]. UCI Machine Learning
  Repository, 1988. https://doi.org/10.24432/C52P4X
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0).
- **Columns (14):** age, sex, cp, trestbps, chol, fbs, restecg, thalach, exang, oldpeak, slope, ca, thal, num.
  `?` = missing (4 in `ca`, 2 in `thal`). Target used: `num > 0` (any major vessel narrowed by more than 50%);
  139/303 positive.
- **Limitations:** 303 patients referred for coronary angiography at one US clinic around 1988, so a high-risk,
  mostly male hospital population. With such a small n, estimates are uncertain. Several inputs (exercise ECG,
  fluoroscopy, thallium scan) are hospital tests most users will not have. The outcome is a finding on angiography,
  not future heart-attack risk.
