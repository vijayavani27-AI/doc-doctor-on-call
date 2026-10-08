"""Measure the AI report reader on synthetic *photos* of lab reports (needs an AI key).

Each image is a rendered Indian-style lab report with random test names, units, layout,
a slight rotation, blur and noise, so it looks like a phone photo. The AI must read it; we then
score against the known ground truth:

  * recall            - share of printed tests the AI found and mapped to the right code
  * value accuracy    - share of found tests whose value (after unit conversion) is within 1%
  * hallucinations    - tests the AI reported that were not on the page
  * flagged errors    - wrong values the AI itself marked as low-confidence (<0.8),
                        i.e. errors the confirm step would catch

Run from backend/:  python scripts/eval_ai.py [n_images]     (default 6; uses your AI quota)
"""
import io
import random
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

from app.services import ai, extraction  # noqa: E402
from scripts.evaluate import LABS, TESTS  # noqa: E402


def font(size, bold=False):
    for name in (("arialbd.ttf" if bold else "arial.ttf"), ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_photo(rng: random.Random):
    d0 = date(2024, 1, 1) + timedelta(days=rng.randint(0, 900))
    chosen = rng.sample(TESTS, rng.randint(5, 8))
    truth, rows = {}, []
    for code, aliases, unit_opts, (lo, hi) in chosen:
        canonical = round(rng.uniform(lo, hi), 2 if hi < 20 else 1)
        unit, factor = rng.choice(unit_opts)
        printed = canonical * factor
        s = f"{printed:.2f}".rstrip("0").rstrip(".") if printed < 100 else f"{printed:.0f}"
        truth[code] = float(s) / factor
        rows.append((rng.choice(aliases), s, unit))
    img = Image.new("RGB", (1000, 140 + 52 * len(rows)), (250, 250, 247))
    dr = ImageDraw.Draw(img)
    dr.text((40, 24), rng.choice(LABS), font=font(30, True), fill=(20, 20, 20))
    dr.text((40, 70), f"Patient Name: Test Person    Age/Sex: 50/F    Date: {d0:%d/%m/%Y}", font=font(20), fill=(40, 40, 40))
    for i, (n, v, u) in enumerate(rows):
        y = 120 + i * 52
        dr.text((40, y), n, font=font(22), fill=(25, 25, 25))
        dr.text((470, y), v, font=font(22, True), fill=(10, 10, 10))
        dr.text((620, y), u, font=font(22), fill=(25, 25, 25))
    img = img.rotate(rng.uniform(-3, 3), expand=True, fillcolor=(235, 235, 230)).filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 0.9)))
    noise = Image.effect_noise(img.size, 12).convert("RGB")
    img = Image.blend(img, noise, 0.06)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=rng.randint(70, 88))
    return buf.getvalue(), truth, d0


def main():
    if not ai.enabled():
        print("No AI key configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY in backend/.env).")
        return
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    rng = random.Random(7)
    printed = found = correct = halluc = wrong = wrong_flagged = dates = 0
    times = []
    for k in range(n):
        data, truth, d0 = make_photo(rng)
        t0 = time.time()
        draft = extraction.extract(data, "image/jpeg", "F")
        times.append(time.time() - t0)
        if draft.method not in ("gemini", "claude", "ai"):
            print(f"image {k + 1}: AI unavailable ({draft.method}), skipped")
            continue
        got = {t.test_code: t for t in draft.tests if t.test_code}
        printed += len(truth)
        dates += draft.report_date == d0
        halluc += len(set(got) - set(truth))
        for code, v in truth.items():
            t = got.get(code)
            if not t:
                continue
            found += 1
            if t.value is not None and abs(t.value - v) <= max(0.011 * abs(v), 0.011):
                correct += 1
            else:
                wrong += 1
                wrong_flagged += t.confidence < 0.8
        print(f"image {k + 1}: {len(truth)} tests, engine {ai.engine_label(ai.last_engine)}, {times[-1]:.1f}s")
    if not printed:
        print("No images were read by the AI (quota or outage). Try again later.")
        return
    print("\n=== AI report reading on synthetic phone photos ===")
    print(f"Engine: {ai.engine_label(ai.last_engine)}   images: {n}   printed values: {printed}")
    print(f"Recall (test found & mapped):      {found / printed:.1%}")
    print(f"Value + unit accuracy (of found):  {correct / max(found, 1):.1%}")
    print(f"Report date correct:               {dates}/{n}")
    print(f"Hallucinated tests:                {halluc}")
    print(f"Wrong values flagged low-confidence: {wrong_flagged}/{wrong}")
    print(f"Median time per image:             {sorted(times)[len(times) // 2]:.1f}s")


if __name__ == "__main__":
    main()
