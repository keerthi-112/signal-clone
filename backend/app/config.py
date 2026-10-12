from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime configuration, overridable through environment variables or a .env file."""

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{(BASE_DIR / 'signal.db').as_posix()}"
    # Hosted libSQL (Turso) database; when set it is used instead of DATABASE_URL.
    turso_database_url: str = ""
    turso_auth_token: str = ""
    # Comma-separated list of allowed frontend origins.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # Phone verification is mocked: every number accepts this code.
    mock_otp_code: str = "123456"
    session_ttl_days: int = 30
    max_upload_mb: int = 25
    seed_on_startup: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
