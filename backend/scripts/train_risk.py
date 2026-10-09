"""Train DOC's screening-risk models (XGBoost) on two public datasets.

Diabetes : Pima Indians Diabetes (UCI ML Repository / NIDDK), 768 rows.
Heart    : UCI Heart Disease, Cleveland processed subset, 303 rows.

Downloaded files are treated as untrusted data: they are only parsed as numeric CSV here.
Run from backend/ (paths are arguments, run Python isolated):

    python -I scripts/train_risk.py \
        --pima ../datasets/public/pima/pima-indians-diabetes.csv \
        --cleveland ../datasets/public/cleveland/processed.cleveland.data \
        --out data/models

Writes <kind>_xgb.json (booster.save_model, JSON) and <kind>_meta.json for kind in
{diabetes, heart}. CV metrics (stratified 5-fold ROC-AUC, Brier, calibration) are computed
with numpy so the script does not need scikit-learn/scipy.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from datetime import date
from pathlib import Path

import numpy as np

SEED = 42
N_FOLDS = 5
BANDS = {"low_below": 0.2, "high_from": 0.5}
# Hyperparameters were picked from a small grid (rounds 100/150/200 x min_child_weight 3/5/8 x eta 0.03/0.05,
# max_depth fixed at 3) on the same 5-fold CV, preferring calibration slope ~1 at near-best AUC. Because the
# grid was scored on the same folds, the reported CV AUC is slightly optimistic.
SELECTION_NOTE = ("Hyperparameters chosen from an 18-setting grid on the same 5-fold CV (target: calibration slope "
                  "close to 1 at near-best AUC); reported CV metrics are therefore slightly optimistic.")

DIABETES = {
    "features": ["pregnancies", "glucose", "diastolic_bp", "skin_thickness", "insulin", "bmi", "pedigree", "age"],
    "labels": {
        "pregnancies": "Number of pregnancies",
        "glucose": "Blood sugar 2 hours after a glucose drink (OGTT)",
        "diastolic_bp": "Diastolic blood pressure (lower number)",
        "skin_thickness": "Triceps skin-fold thickness",
        "insulin": "Insulin 2 hours after a glucose drink",
        "bmi": "Body mass index (BMI)",
        "pedigree": "Family history score (diabetes pedigree function)",
        "age": "Age",
    },
    "units": {
        "pregnancies": "count", "glucose": "mg/dL", "diastolic_bp": "mmHg", "skin_thickness": "mm",
        "insulin": "µU/mL", "bmi": "kg/m²", "pedigree": "score", "age": "years",
    },
    # Plausible human ranges (inclusive). Values outside are treated as missing at inference.
    "ranges": {
        "pregnancies": [0, 20], "glucose": [40, 400], "diastolic_bp": [30, 140], "skin_thickness": [3, 100],
        "insulin": [5, 900], "bmi": [12, 70], "pedigree": [0.05, 2.5], "age": [18, 100],
    },
    "params": {"max_depth": 3, "eta": 0.03, "subsample": 0.8, "colsample_bytree": 0.8, "min_child_weight": 5,
               "lambda": 2.0, "gamma": 0.0},
    "rounds": 150,
    "dataset": {
        "name": "Pima Indians Diabetes Database",
        "source": "UCI Machine Learning Repository / National Institute of Diabetes and Digestive and Kidney Diseases (NIDDK)",
        "url": "https://raw.githubusercontent.com/jbrownlee/Datasets/master/pima-indians-diabetes.data.csv",
        "citation": "Smith JW, Everhart JE, Dickson WC, Knowler WC, Johannes RS. Using the ADAP learning algorithm to forecast the onset of diabetes mellitus. Proc Annu Symp Comput Appl Med Care. 1988:261-265.",
        "licence": "Public research dataset distributed via the UCI ML Repository (NIDDK); cite Smith et al. 1988.",
    },
    "limitations": [
        "Trained only on Pima Indian women aged 21 or older (Arizona, USA); it may not fit men, other ethnicities or younger people.",
        "Glucose and insulin are 2-hour oral glucose tolerance test values, not fasting values or HbA1c.",
        "Outcome is diabetes diagnosed within 5 years of the exam, from a 1980s study.",
        "Only 768 people; many insulin and skin-fold values were missing in the original data.",
        "A screening estimate, not a diagnosis.",
    ],
}

HEART = {
    "features": ["age", "sex", "cp", "trestbps", "chol", "fbs", "restecg", "thalach", "exang", "oldpeak", "slope", "ca", "thal"],
    "labels": {
        "age": "Age",
        "sex": "Sex (1 = male, 0 = female)",
        "cp": "Chest pain type (1 typical angina, 2 atypical, 3 non-anginal, 4 none/asymptomatic)",
        "trestbps": "Resting blood pressure (upper number)",
        "chol": "Total cholesterol",
        "fbs": "Fasting blood sugar above 120 mg/dL (1 = yes)",
        "restecg": "Resting ECG (0 normal, 1 ST-T abnormality, 2 left ventricular hypertrophy)",
        "thalach": "Maximum heart rate reached in exercise test",
        "exang": "Chest pain brought on by exercise (1 = yes)",
        "oldpeak": "ST depression on exercise ECG",
        "slope": "Slope of peak exercise ST segment (1 up, 2 flat, 3 down)",
        "ca": "Major vessels coloured by fluoroscopy (0-3)",
        "thal": "Thallium scan result (3 normal, 6 fixed defect, 7 reversible defect)",
    },
    "units": {
        "age": "years", "sex": "1/0", "cp": "type 1-4", "trestbps": "mmHg", "chol": "mg/dL", "fbs": "1/0",
        "restecg": "code 0-2", "thalach": "beats/min", "exang": "1/0", "oldpeak": "mm", "slope": "code 1-3",
        "ca": "count 0-3", "thal": "code 3/6/7",
    },
    "ranges": {
        "age": [18, 100], "sex": [0, 1], "cp": [1, 4], "trestbps": [70, 250], "chol": [80, 700], "fbs": [0, 1],
        "restecg": [0, 2], "thalach": [50, 230], "exang": [0, 1], "oldpeak": [0, 8], "slope": [1, 3], "ca": [0, 3],
        "thal": [3, 7],
    },
    "params": {"max_depth": 3, "eta": 0.05, "subsample": 0.8, "colsample_bytree": 0.8, "min_child_weight": 5,
               "lambda": 2.0, "gamma": 0.0},
    "rounds": 150,
    "dataset": {
        "name": "UCI Heart Disease (Cleveland Clinic, processed)",
        "source": "UCI Machine Learning Repository, dataset 45",
        "url": "https://archive.ics.uci.edu/ml/machine-learning-databases/heart-disease/processed.cleveland.data",
        "citation": "Janosi A, Steinbrunn W, Pfisterer M, Detrano R. Heart Disease [Dataset]. UCI Machine Learning Repository, 1988. https://doi.org/10.24432/C52P4X",
        "licence": "CC BY 4.0",
    },
    "limitations": [
        "Trained on 303 patients referred to the Cleveland Clinic (USA) for angiography around 1988; it may not fit the general population.",
        "Several inputs (exercise ECG, fluoroscopy vessel count, thallium scan) come from hospital tests most people will not have.",
        "Outcome is >50% narrowing of a major coronary artery on angiography, not heart attack risk over time.",
        "Small dataset, so estimates are uncertain.",
        "A screening estimate, not a diagnosis.",
    ],
}


# ---------- data loading (numeric CSV only) ----------

def _num(tok: str) -> float:
    tok = tok.strip()
    if tok in ("", "?"):
        return math.nan
    v = float(tok)
    if not math.isfinite(v):
        raise ValueError(f"non-finite value {tok!r}")
    return v


def _read_numeric_csv(path: Path, ncols: int) -> np.ndarray:
    rows = []
    with open(path, newline="", encoding="ascii") as f:
        for i, rec in enumerate(csv.reader(f), 1):
            if not rec or all(not t.strip() for t in rec):
                continue
            if len(rec) != ncols:
                raise ValueError(f"{path.name}: line {i} has {len(rec)} columns, expected {ncols}")
            rows.append([_num(t) for t in rec])
    return np.asarray(rows, dtype=float)


def load_pima(path: Path) -> tuple[np.ndarray, np.ndarray]:
    a = _read_numeric_csv(path, 9)
    X, y = a[:, :8].copy(), a[:, 8]
    # In Pima, zero means "not measured" for these columns.
    for name in ("glucose", "diastolic_bp", "skin_thickness", "insulin", "bmi"):
        j = DIABETES["features"].index(name)
        X[X[:, j] == 0, j] = np.nan
    if not set(np.unique(y)) <= {0.0, 1.0}:
        raise ValueError("Pima outcome must be 0/1")
    return X, y.astype(int)


def load_cleveland(path: Path) -> tuple[np.ndarray, np.ndarray]:
    a = _read_numeric_csv(path, 14)
    X, num = a[:, :13], a[:, 13]
    if np.isnan(num).any():
        raise ValueError("Cleveland target has missing values")
    return X, (num > 0).astype(int)


# ---------- metrics (numpy) ----------

def roc_auc(y: np.ndarray, p: np.ndarray) -> float:
    """Mann-Whitney U formulation with average ranks for ties."""
    order = np.argsort(p, kind="mergesort")
    ps = p[order]
    ranks = np.empty(len(p))
    i = 0
    while i < len(ps):
        j = i
        while j + 1 < len(ps) and ps[j + 1] == ps[i]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2 + 1
        i = j + 1
    n_pos = int(y.sum())
    n_neg = len(y) - n_pos
    return float((ranks[y == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def brier(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean((p - y) ** 2))


def stratified_folds(y: np.ndarray, k: int, seed: int) -> list[np.ndarray]:
    rng = np.random.default_rng(seed)
    fold_of = np.empty(len(y), dtype=int)
    for cls in (0, 1):
        idx = np.flatnonzero(y == cls)
        rng.shuffle(idx)
        fold_of[idx] = np.arange(len(idx)) % k
    return [np.flatnonzero(fold_of == f) for f in range(k)]


def calibration_slope_intercept(y: np.ndarray, p: np.ndarray) -> tuple[float, float]:
    """Logistic recalibration y ~ a + b*logit(p) by Newton-Raphson. Ideal: a=0, b=1."""
    pc = np.clip(p, 1e-6, 1 - 1e-6)
    z = np.log(pc / (1 - pc))
    A = np.column_stack([np.ones_like(z), z])
    w = np.array([0.0, 1.0])
    for _ in range(50):
        m = 1 / (1 + np.exp(-(A @ w)))
        g = A.T @ (y - m)
        H = (A * (m * (1 - m))[:, None]).T @ A
        step = np.linalg.solve(H + 1e-9 * np.eye(2), g)
        w += step
        if np.abs(step).max() < 1e-8:
            break
    return float(w[0]), float(w[1])


def band_table(y: np.ndarray, p: np.ndarray) -> list[dict]:
    lo, hi = BANDS["low_below"], BANDS["high_from"]
    out = []
    for name, mask in (("low", p < lo), ("moderate", (p >= lo) & (p < hi)), ("high", p >= hi)):
        n = int(mask.sum())
        out.append({
            "band": name, "n": n,
            "mean_predicted": round(float(p[mask].mean()), 3) if n else None,
            "observed_rate": round(float(y[mask].mean()), 3) if n else None,
        })
    return out


def decile_table(y: np.ndarray, p: np.ndarray, bins: int = 5) -> list[dict]:
    order = np.argsort(p, kind="mergesort")
    out = []
    for chunk in np.array_split(order, bins):
        out.append({"n": len(chunk), "mean_predicted": round(float(p[chunk].mean()), 3),
                    "observed_rate": round(float(y[chunk].mean()), 3)})
    return out


# ---------- training ----------

def _params(spec: dict) -> dict:
    return {"objective": "binary:logistic", "eval_metric": "logloss", "tree_method": "exact",
            "seed": SEED, "nthread": 1, **spec["params"]}


def cross_validate(spec: dict, X: np.ndarray, y: np.ndarray) -> dict:
    import xgboost as xgb

    oof = np.empty(len(y))
    aucs, briers = [], []
    for test_idx in stratified_folds(y, N_FOLDS, SEED):
        train_mask = np.ones(len(y), dtype=bool)
        train_mask[test_idx] = False
        dtr = xgb.DMatrix(X[train_mask], label=y[train_mask], missing=np.nan, feature_names=spec["features"])
        dte = xgb.DMatrix(X[test_idx], missing=np.nan, feature_names=spec["features"])
        bst = xgb.train(_params(spec), dtr, num_boost_round=spec["rounds"])
        p = bst.predict(dte)
        oof[test_idx] = p
        aucs.append(roc_auc(y[test_idx], p))
        briers.append(brier(y[test_idx], p))
    a, b = calibration_slope_intercept(y, oof)
    return {
        "cv_auc_mean": round(float(np.mean(aucs)), 3),
        "cv_auc_sd": round(float(np.std(aucs, ddof=1)), 3),
        "cv_auc_folds": [round(v, 3) for v in aucs],
        "brier": round(float(np.mean(briers)), 3),
        "brier_baseline": round(float(np.mean(y) * (1 - np.mean(y))), 3),
        "oof_auc": round(roc_auc(y, oof), 3),
        "calibration": {
            "intercept": round(a, 3), "slope": round(b, 3),
            "note": "Logistic recalibration of out-of-fold predictions; ideal intercept 0 and slope 1.",
            "quintiles": decile_table(y, oof),
            "bands": band_table(y, oof),
        },
    }


def _band_rationale(bands: list[dict]) -> str:
    base = ("low < 0.2 <= moderate < 0.5 <= high: fixed, round cut-offs chosen before training so they are easy to "
            "explain. Checked against out-of-fold predictions ('calibration.bands'): ")
    lo, hi = BANDS["low_below"], BANDS["high_from"]
    limits = {"low": (0.0, lo), "moderate": (lo, hi), "high": (hi, 1.0)}
    off = [b["band"] for b in bands
           if b["n"] and not (limits[b["band"]][0] - 0.05 <= b["observed_rate"] <= limits[b["band"]][1] + 0.05)]
    if not off:
        return base + "the observed rate in every band falls within (±0.05 of) that band's range, so the defaults were kept."
    return base + ("the observed rate falls outside the band range for: " + ", ".join(off)
                   + ". Defaults were kept for consistency between models; treat band labels for these as approximate.")


def build(kind: str, spec: dict, X: np.ndarray, y: np.ndarray, out_dir: Path) -> dict:
    import xgboost as xgb

    cv = cross_validate(spec, X, y)
    dall = xgb.DMatrix(X, label=y, missing=np.nan, feature_names=spec["features"])
    bst = xgb.train(_params(spec), dall, num_boost_round=spec["rounds"])
    out_dir.mkdir(parents=True, exist_ok=True)
    bst.save_model(str(out_dir / f"{kind}_xgb.json"))

    feats = spec["features"]
    medians = {f: round(float(np.nanmedian(X[:, j])), 3) for j, f in enumerate(feats)}
    missing = {f: int(np.isnan(X[:, j]).sum()) for j, f in enumerate(feats)}
    meta = {
        "kind": kind,
        "model_name": "XGBoost",
        "features": feats,
        "labels": spec["labels"],
        "units": spec["units"],
        "medians": medians,
        "missing_in_training": missing,
        "ranges": spec["ranges"],
        "n_rows": int(len(y)),
        "positives": int(y.sum()),
        "prevalence": round(float(y.mean()), 3),
        **{k: cv[k] for k in ("cv_auc_mean", "cv_auc_sd", "cv_auc_folds", "brier", "brier_baseline", "oof_auc")},
        "calibration": cv["calibration"],
        "bands": {
            **BANDS,
            "rationale": _band_rationale(cv["calibration"]["bands"]),
        },
        "hyperparameters": {**_params(spec), "num_boost_round": spec["rounds"], "selection_note": SELECTION_NOTE},
        "dataset": spec["dataset"],
        "trained_at": date.today().isoformat(),
        "xgboost_version": xgb.__version__,
        "limitations": spec["limitations"],
    }
    with open(out_dir / f"{kind}_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    return meta


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--pima", type=Path, required=True)
    ap.add_argument("--cleveland", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "models")
    args = ap.parse_args()

    jobs = [("diabetes", DIABETES, *load_pima(args.pima)), ("heart", HEART, *load_cleveland(args.cleveland))]
    for kind, spec, X, y in jobs:
        m = build(kind, spec, X, y, args.out)
        cal = m["calibration"]
        print(f"{kind:9s} n={m['n_rows']} pos={m['positives']} ({m['prevalence']:.0%})  "
              f"CV AUC {m['cv_auc_mean']:.3f} ± {m['cv_auc_sd']:.3f}  Brier {m['brier']:.3f} "
              f"(baseline {m['brier_baseline']:.3f})  calib intercept {cal['intercept']:+.2f} slope {cal['slope']:.2f}")
        for b in cal["bands"]:
            print(f"    {b['band']:8s} n={b['n']:3d}  predicted {b['mean_predicted']}  observed {b['observed_rate']}")
    print(f"Saved models to {args.out}")


if __name__ == "__main__":
    main()
