import os
import sys
import tempfile
from pathlib import Path

# Isolated instance dir + offline mode, set before the app is imported.
_tmp = tempfile.mkdtemp(prefix="doc-test-")
os.environ["DOC_INSTANCE_DIR"] = _tmp
os.environ["AI_DISABLED"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def demo(client):
    r = client.post("/api/auth/demo")
    assert r.status_code == 200
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    profiles = client.get("/api/profiles", headers=h).json()
    return {"h": h, "profiles": {p["name"].split(" ")[0]: p for p in profiles}}
