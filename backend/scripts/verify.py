"""One command to verify the whole project (no API key needed).

Runs: lint (ruff, if installed), the 47 automated tests (incl. the test-kit answer key),
the offline pipeline evaluation, and checks the built frontend. Prints a scorecard.

Run from backend/:  python scripts/verify.py
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = {**os.environ, "AI_DISABLED": "1", "PYTHONIOENCODING": "utf-8"}


def run(args: list[str]) -> tuple[int, str]:
    p = subprocess.run([sys.executable, *args], cwd=ROOT, env=ENV, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def main():
    rows = []
    code, out = run(["-m", "ruff", "check", "."])
    rows.append(("Lint (ruff)", "PASS" if code == 0 else ("SKIP (ruff not installed)" if "No module named ruff" in out else "FAIL")))

    code, out = run(["-m", "pytest", "-q"])
    m = re.search(r"(\d+) passed", out)
    f = re.search(r"(\d+) failed", out)
    rows.append(("Automated tests", f"{'PASS' if code == 0 else 'FAIL'} ({m.group(1) if m else 0} passed{', ' + f.group(1) + ' failed' if f else ''})"))

    code, out = run(["scripts/evaluate.py", "100"])
    rec = re.search(r"Test name recognised.*?:\s+([\d.]+%)", out)
    val = re.search(r"Value \+ unit conversion correct.*?:\s+([\d.]+%)", out)
    fm = re.search(r"(\d+)/(\d+) formulas match", out)
    rows.append(("Report reader (100 synthetic PDFs)", f"names {rec.group(1) if rec else '?'} | values {val.group(1) if val else '?'}"))
    rows.append(("Formulas vs hand calculations", f"{fm.group(1)}/{fm.group(2)}" if fm else "?"))

    dist = ROOT.parent / "frontend" / "dist" / "index.html"
    rows.append(("Frontend build present", "PASS" if dist.exists() else "MISSING (run: cd frontend && npm run build)"))

    width = max(len(r[0]) for r in rows) + 2
    print("\nDOC (Doctor On Call): verification scorecard")
    print("-" * (width + 40))
    for name, result in rows:
        print(f"{name:<{width}}{result}")
    print("-" * (width + 40))
    ok = all(not r[1].startswith(("FAIL", "MISSING")) for r in rows)
    print("ALL CHECKS PASSED" if ok else "SOME CHECKS NEED ATTENTION")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
