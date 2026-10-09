"""Our own wound photo analysis (classical computer vision, no AI) + safety questionnaire rules.

What the image model measures (centre 70% of the photo, after resizing to 320 px):
  red_pct    - reddish pixels (inflammation / granulation)
  yellow_pct - yellow-cream pixels (slough or pus)
  dark_pct   - very dark pixels (scab, dried blood or dead tissue)
  wound_pct  - red + yellow + dark inside the centre region (a rough size proxy)
  redness_spread - how much redness sits in the outer ring vs the centre (spreading-redness proxy)
These are colour measurements, not a diagnosis. Lighting and distance change them, so comparisons
need photos taken the same way. Urgency is decided by explicit code rules below.
"""
from __future__ import annotations

import io

URGENCY = {
    "emergency": {"rank": 0, "title": "Get emergency help now", "action": "Call 108 / 112 or go to the nearest emergency department."},
    "today": {"rank": 1, "title": "See a doctor today", "action": "Visit a doctor or clinic today."},
    "soon": {"rank": 2, "title": "See a doctor in the next 2–3 days", "action": "Book a visit with your doctor."},
    "home": {"rank": 3, "title": "Home care is usually fine", "action": "Keep it clean and covered; watch for the warning signs below."},
}
WARNING_SIGNS = ["Redness or swelling spreading", "Pus, bad smell or more pain", "Fever or chills", "Red streaks going up the arm or leg",
                 "Wound not getting smaller after 2 weeks"]
HOME_CARE = ["Wash hands. Rinse the wound gently with clean running water.", "Cover it with a clean, dry dressing; change it daily or if wet.",
             "Do not apply toothpaste, turmeric paste, ash or powders.", "If you have diabetes, check your feet every day."]


def analyze_image(data: bytes) -> dict:
    import numpy as np
    from PIL import Image, ImageOps

    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    img.thumbnail((320, 320))
    hsv = np.asarray(img.convert("HSV"), dtype=np.float32) / 255.0
    rgb = np.asarray(img, dtype=np.float32) / 255.0
    h, s, v = hsv[..., 0] * 360, hsv[..., 1], hsv[..., 2]
    H, W = h.shape
    y0, y1, x0, x1 = int(H * 0.15), int(H * 0.85), int(W * 0.15), int(W * 0.85)
    centre = np.zeros_like(h, dtype=bool)
    centre[y0:y1, x0:x1] = True
    ring = ~centre

    red = ((h < 15) | (h > 340)) & (s > 0.35) & (v > 0.25) & (rgb[..., 0] > rgb[..., 1] * 1.35)
    yellow = (h >= 35) & (h <= 65) & (s > 0.3) & (v > 0.45)
    dark = (v < 0.18)
    wound = red | yellow | dark

    def pct(mask, region):
        return round(float(mask[region].mean()) * 100, 1) if region.any() else 0.0

    brightness = round(float(v.mean()), 2)
    metrics = {"red_pct": pct(red, centre), "yellow_pct": pct(yellow, centre), "dark_pct": pct(dark, centre),
               "wound_pct": pct(wound, centre), "redness_ring_pct": pct(red, ring), "brightness": brightness,
               "size": [W, H]}
    metrics["redness_spread"] = round(metrics["redness_ring_pct"] / metrics["red_pct"], 2) if metrics["red_pct"] >= 2 else 0.0
    metrics["quality"] = "too_dark" if brightness < 0.25 else "too_bright" if brightness > 0.9 else "ok"
    return metrics


def assess(metrics: dict, answers: dict, has_diabetes: bool, site: str) -> dict:
    """Code rules -> urgency level + reasons. Questionnaire answers override the photo."""
    a = {k: bool(v) for k, v in (answers or {}).items() if k != "days"}
    days = int((answers or {}).get("days") or 0)
    reasons: dict[str, list[str]] = {k: [] for k in URGENCY}

    if a.get("bleeding_wont_stop"):
        reasons["emergency"].append("Bleeding that won't stop with 10 minutes of firm pressure")
    if a.get("fever") and (a.get("spreading_redness") or metrics.get("redness_spread", 0) > 0.8):
        reasons["emergency"].append("Fever together with spreading redness can mean a serious infection")
    if a.get("deep_or_gaping"):
        reasons["today"].append("A deep or gaping wound may need stitches (best within 6–8 hours)")
    if a.get("animal_bite"):
        reasons["today"].append("Animal bites need a doctor the same day (rabies and tetanus protection in India)")
    if has_diabetes and any(w in site.lower() for w in ("foot", "toe", "heel", "leg", "கால்", "पैर")):
        reasons["today"].append("A foot or leg wound with diabetes should be seen by a doctor within 24 hours (IWGDF guidance)")
    for key, text in (("pus", "Pus"), ("bad_smell", "A bad smell"), ("increasing_pain", "Pain getting worse"),
                      ("spreading_redness", "Redness spreading")):
        if a.get(key):
            reasons["today"].append(f"{text} can be a sign of infection")
    if a.get("fever"):
        reasons["today"].append("Fever with a wound")
    if a.get("numbness"):
        reasons["soon"].append("Numbness around a wound (common with diabetic nerve damage) means injuries can go unnoticed")
    if days > 14:
        reasons["soon"].append(f"The wound is {days} days old; wounds that aren't healing after 2 weeks need a check")
    if metrics.get("dark_pct", 0) >= 15:
        reasons["today"].append("The photo shows a lot of dark or black tissue")
    elif metrics.get("yellow_pct", 0) >= 15:
        reasons["soon"].append("The photo shows yellow areas, which can be slough or pus")
    if metrics.get("redness_spread", 0) > 0.8 and metrics.get("red_pct", 0) >= 5:
        reasons["soon"].append("Redness reaches the edges of the photo")

    level = next((k for k in ("emergency", "today", "soon") if reasons[k]), "home")
    all_reasons = [r for k in ("emergency", "today", "soon") for r in reasons[k]]
    photo_note = None
    if metrics.get("quality") != "ok":
        photo_note = "The photo is too dark or too bright for a reliable reading; retake it in daylight without flash."
    return {"level": level, **URGENCY[level], "reasons": all_reasons, "photo_note": photo_note,
            "warning_signs": WARNING_SIGNS, "home_care": HOME_CARE if level in ("home", "soon") else [],
            "call": [{"label": "Ambulance", "number": "108"}, {"label": "Emergency", "number": "112"}] if level == "emergency" else [],
            "disclaimer": "This photo check measures colours only and follows simple safety rules. It cannot diagnose an infection. "
                          "When in doubt, see a doctor."}


def compare(old: dict, new: dict) -> dict:
    """Change between two scans of the same wound (photos should be taken the same way)."""
    def delta(k):
        a, b = old.get(k, 0) or 0, new.get(k, 0) or 0
        return round(b - a, 1)

    size_change = None
    if old.get("wound_pct"):
        size_change = round((new.get("wound_pct", 0) - old["wound_pct"]) / old["wound_pct"] * 100)
    if size_change is None:
        verdict = "Not enough wound area in the first photo to compare."
    elif size_change <= -15:
        verdict = f"The wound area looks about {abs(size_change)}% smaller, which suggests healing."
    elif size_change >= 15:
        verdict = f"The wound area looks about {size_change}% larger. Please show it to a doctor."
    else:
        verdict = "The wound looks about the same size."
    if delta("redness_ring_pct") >= 5:
        verdict += " Redness around the edges has increased. Please see a doctor."
    return {"size_change_pct": size_change, "red_change": delta("red_pct"), "yellow_change": delta("yellow_pct"),
            "dark_change": delta("dark_pct"), "edge_redness_change": delta("redness_ring_pct"), "verdict": verdict,
            "note": "Compare photos taken from the same distance, in similar light, without flash."}
