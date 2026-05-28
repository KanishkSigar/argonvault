from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- object storage (S3 / MinIO / any S3-compatible) ---
    storage_access_key_id: str
    storage_secret_access_key: str
    storage_region: str = "us-east-1"
    storage_endpoint_url: str | None = None
    storage_bucket: str
    presign_expires_seconds: int = 900

    # --- database ---
    # SQLAlchemy URL. Default: SQLite next to the backend.
    database_url: str = "sqlite:///./vault.db"

    # --- app ---
    jwt_secret: str
    jwt_expires_minutes: int = 720

    # Pepper for hiding email enumeration in the /auth/prelogin response.
    # Returned-salt for unknown emails is HMAC-derived from this + the email.
    email_enum_pepper: str

    cors_origins: str = "http://localhost:3000"
    cookie_secure: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
