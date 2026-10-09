"""Screening-risk estimates from DOC's own XGBoost models, with exact TreeSHAP explanations.

Models are trained by scripts/train_risk.py and stored in data/models/. xgboost is imported
lazily inside functions so app start-up memory stays low; loaded boosters are cached.
Wording rule: these are screening estimates, never diagnoses.
"""
from __future__ import annotations

import json
import math
import threading
from pathlib import Path
from typing import Any

from ..config import DATA_DIR

MODEL_DIR = DATA_DIR / "models"
KINDS = ("diabetes", "heart")
MIN_REAL_FEATURES = 2

_boosters: dict[str, Any] = {}
_metas: dict[str, dict] = {}
_lock = threading.Lock()

_HEAVY_META = {"calibration", "cv_auc_folds", "hyperparameters", "missing_in_training"}


def _check_kind(kind: str) -> None:
    if kind not in KINDS:
        raise ValueError(f"Unknown risk model {kind!r}; expected one of {', '.join(KINDS)}")


def _paths(kind: str) -> tuple[Path, Path]:
    return MODEL_DIR / f"{kind}_xgb.json", MODEL_DIR / f"{kind}_meta.json"


def available() -> bool:
    """True when every model file exists and xgboost can be imported."""
    if not all(p.is_file() for k in KINDS for p in _paths(k)):
        return False
    try:
        import xgboost  # noqa: F401
    except Exception:  # ImportError, or a native-library load failure
        return False
    return True


def _meta(kind: str) -> dict:
    _check_kind(kind)
    if kind not in _metas:
        with open(_paths(kind)[1], encoding="utf-8") as f:
            _metas[kind] = json.load(f)
    return _metas[kind]


def _booster(kind: str):
    _check_kind(kind)
    with _lock:
        if kind not in _boosters:
            import xgboost as xgb

            bst = xgb.Booster()
            bst.load_model(str(_paths(kind)[0]))
            bst.set_param({"nthread": 1})
            _boosters[kind] = bst
        return _boosters[kind]


def model_info(kind: str) -> dict:
    """Model metadata without the heavy calibration/training fields."""
    return {k: v for k, v in _meta(kind).items() if k not in _HEAVY_META}


def _to_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def predict(kind: str, values: dict[str, float | None]) -> dict:
    """Screening probability, band and top SHAP factors for one person.

    Missing, unparseable or implausible values are left as NaN for XGBoost (which handles
    missing natively) and reported in ``imputed_features`` with the training median for display.
    """
    _check_kind(kind)
    meta = _meta(kind)
    feats: list[str] = meta["features"]
    labels, ranges, medians = meta["labels"], meta["ranges"], meta["medians"]
    values = values or {}

    row: list[float] = []
    used, imputed = [], []
    for f in feats:
        v = _to_float(values.get(f))
        lo, hi = ranges[f]
        if v is None:
            reason = "missing"
        elif not (lo <= v <= hi):
            reason = "out_of_range"
        else:
            reason = None
        if reason:
            # Features that were (almost) never missing in training have no learned "missing" branch, so NaN
            # would push the tree down an arbitrary path: use the training median there instead.
            never_missing = meta.get("missing_in_training", {}).get(f, 0) < 0.02 * meta["n_rows"]
            row.append(float(medians[f]) if never_missing else math.nan)
            imputed.append({"feature": f, "label": labels[f], "reason": reason, "typical_value": medians[f],
                            "method": "median" if never_missing else "model-missing-branch"})
        else:
            row.append(v)
            used.append({"feature": f, "label": labels[f], "value": v})

    if len(used) < MIN_REAL_FEATURES:
        raise ValueError(
            f"Not enough of your own data for a {kind} estimate: please provide at least {MIN_REAL_FEATURES} "
            f"of {', '.join(feats)} (within plausible ranges)."
        )

    import numpy as np
    import xgboost as xgb

    bst = _booster(kind)
    dm = xgb.DMatrix(np.asarray([row], dtype=float), missing=np.nan, feature_names=feats)
    prob = float(bst.predict(dm)[0])
    contribs = bst.predict(dm, pred_contribs=True)[0]  # one per feature + bias (last)

    real = {u["feature"]: u["value"] for u in used}
    # Explain with the person's OWN values only; imputed features are listed separately.
    order = sorted((j for j in range(len(feats)) if feats[j] in real), key=lambda j: abs(float(contribs[j])), reverse=True)
    top = []
    for j in order[:3]:
        c = float(contribs[j])
        if c == 0.0:
            continue
        top.append({
            "feature": feats[j],
            "label": labels[feats[j]],
            "value": real.get(feats[j]),
            "contribution": round(c, 3),
            "direction": "raises" if c > 0 else "lowers",
        })

    lo_cut, hi_cut = meta["bands"]["low_below"], meta["bands"]["high_from"]
    band = "low" if prob < lo_cut else ("moderate" if prob < hi_cut else "high")
    ds = meta["dataset"]["name"]
    return {
        "kind": kind,
        "probability": round(prob, 3),
        "percent": int(round(prob * 100)),
        "band": band,
        "top_factors": top,
        "used_features": used,
        "imputed_features": imputed,
        "model": {"name": "XGBoost", "dataset": ds, "cv_auc": meta["cv_auc_mean"], "n_rows": meta["n_rows"]},
        "disclaimer": (
            f"This is a screening estimate, not a diagnosis. It was trained on the {ds} and may not fit you "
            "exactly. Please discuss it with your doctor."
        ),
    }
