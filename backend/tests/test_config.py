from app.config import Settings


def test_settings_strip_pasted_whitespace(monkeypatch):
    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://db.example.turso.io\n")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", " token \r\n")
    monkeypatch.setenv("CORS_ORIGINS", "https://app.example.com \n")
    s = Settings()
    assert s.turso_database_url == "libsql://db.example.turso.io"
    assert s.turso_auth_token == "token"
    assert s.cors_origin_list == ["https://app.example.com"]
