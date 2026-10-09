import math

import pytest

try:
    import xgboost  # noqa: F401
except Exception as e:  # ImportError, or the native library failing to load
    pytest.skip(f"xgboost unavailable: {e.__class__.__name__}", allow_module_level=True)

from app.services import risk  # noqa: E402

if not risk.available():
    pytest.skip("risk model files missing or xgboost cannot load (run scripts/train_risk.py)", allow_module_level=True)

LOW_DIABETES = {"pregnancies": 0, "glucose": 90, "diastolic_bp": 70, "skin_thickness": 20, "insulin": 80,
                "bmi": 22, "pedigree": 0.2, "age": 24}
HIGH_DIABETES = {**LOW_DIABETES, "glucose": 185, "bmi": 38, "age": 55}
HEART = {"age": 58, "sex": 1, "cp": 4, "trestbps": 140, "chol": 260, "fbs": 0, "restecg": 2, "thalach": 125,
         "exang": 1, "oldpeak": 2.0, "slope": 2, "ca": 1, "thal": 7}


def _logit(p):
    return math.log(p / (1 - p))


@pytest.mark.parametrize("kind,values", [("diabetes", LOW_DIABETES), ("diabetes", HIGH_DIABETES), ("heart", HEART)])
def test_probability_range_and_shape(kind, values):
    r = risk.predict(kind, values)
    assert 0.0 <= r["probability"] <= 1.0
    assert abs(r["percent"] - r["probability"] * 100) <= 1
    assert r["band"] in {"low", "moderate", "high"}
    assert len(r["top_factors"]) <= 3
    for f in r["top_factors"]:
        assert f["direction"] == ("raises" if f["contribution"] > 0 else "lowers")
    assert "not a diagnosis" in r["disclaimer"]
    assert r["model"]["name"] == "XGBoost"


def test_deterministic():
    assert risk.predict("diabetes", HIGH_DIABETES) == risk.predict("diabetes", HIGH_DIABETES)


def test_higher_glucose_bmi_age_raises_diabetes_risk():
    assert risk.predict("diabetes", HIGH_DIABETES)["probability"] > risk.predict("diabetes", LOW_DIABETES)["probability"]


@pytest.mark.parametrize("kind,values", [("diabetes", HIGH_DIABETES), ("heart", HEART)])
def test_shap_contributions_sum_to_logit(kind, values):
    import numpy as np
    import xgboost as xgb

    r = risk.predict(kind, values)
    feats = risk.model_info(kind)["features"]
    row = [[values.get(f, np.nan) for f in feats]]
    dm = xgb.DMatrix(np.asarray(row, dtype=float), missing=np.nan, feature_names=feats)
    bst = risk._booster(kind)
    contribs = bst.predict(dm, pred_contribs=True)[0]
    margin = float(bst.predict(dm, output_margin=True)[0])
    assert abs(float(contribs.sum()) - margin) < 1e-4
    p = float(bst.predict(dm)[0])
    assert abs(float(contribs.sum()) - _logit(p)) < 1e-3
    assert abs(_logit(r["probability"]) - _logit(p)) < 0.05  # r is rounded to 3 dp
    top = {f["feature"]: f["contribution"] for f in r["top_factors"]}
    for name, c in top.items():
        assert abs(c - float(contribs[feats.index(name)])) < 1e-3


def test_missing_and_out_of_range_are_imputed():
    vals = {**LOW_DIABETES, "insulin": None, "bmi": 500}
    del vals["skin_thickness"]
    r = risk.predict("diabetes", vals)
    reasons = {i["feature"]: i["reason"] for i in r["imputed_features"]}
    assert reasons == {"insulin": "missing", "bmi": "out_of_range", "skin_thickness": "missing"}
    assert all(i["typical_value"] is not None for i in r["imputed_features"])
    used = {u["feature"] for u in r["used_features"]}
    assert used.isdisjoint(reasons)
    for f in r["top_factors"]:
        if f["feature"] in reasons:
            assert f["value"] is None


def test_too_few_real_features():
    with pytest.raises(ValueError, match="Not enough of your own data"):
        risk.predict("diabetes", {"age": 40})


def test_unknown_kind_raises():
    with pytest.raises(ValueError):
        risk.predict("cancer", LOW_DIABETES)
    with pytest.raises(ValueError):
        risk.model_info("cancer")


def test_model_info_is_light():
    info = risk.model_info("heart")
    assert "calibration" not in info
    assert info["features"][0] == "age" and len(info["features"]) == 13
