from functools import lru_cache
import os

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = os.getenv("APP_NAME", "GenBioCa GRC API")
    api_v1_prefix: str = os.getenv("API_V1_PREFIX", "/api/v1")
    environment: str = os.getenv("ENVIRONMENT", "development")
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/genbioca_grc",
    )
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    local_storage_path: str = os.getenv("LOCAL_STORAGE_PATH", "./storage")
    max_upload_size_mb: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
    seed_on_startup: bool = os.getenv("SEED_ON_STARTUP", "true").lower() == "true"
    allowed_origins: list[str] = [
        item.strip()
        for item in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
        if item.strip()
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
