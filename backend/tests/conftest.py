import os
import tempfile
from pathlib import Path

# Configure an isolated database before the app is imported.
_tmp = Path(tempfile.mkdtemp(prefix="signal-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_tmp / 'test.db').as_posix()}"
os.environ["SEED_ON_STARTUP"] = "false"
# Tests drop every table, so never inherit a hosted database from the environment or .env;
# a throwaway Turso database can be targeted explicitly via TEST_TURSO_DATABASE_URL.
os.environ["TURSO_DATABASE_URL"] = os.environ.get("TEST_TURSO_DATABASE_URL", "")
os.environ["TURSO_AUTH_TOKEN"] = os.environ.get("TEST_TURSO_AUTH_TOKEN", "")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


def register(client: TestClient, phone: str, name: str, username: str | None = None) -> dict:
    """Sign up through the real flow and return {"id", "token", "headers"}."""
    client.post("/api/auth/request-code", json={"phone": phone}).raise_for_status()
    res = client.post("/api/auth/verify", json={"phone": phone, "code": "123456"})
    res.raise_for_status()
    token = res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    body = {"display_name": name}
    if username:
        body["username"] = username
    me = client.patch("/api/users/me", json=body, headers=headers)
    me.raise_for_status()
    return {"id": me.json()["id"], "token": token, "headers": headers}
