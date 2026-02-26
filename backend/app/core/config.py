from __future__ import annotations

import os

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict

    class Settings(BaseSettings):
        app_name: str = "SMC Heatwave Risk API"
        app_version: str = "0.1.0"
        database_url: str = "postgresql+psycopg://smc:smc@localhost:5432/smc_heatwave"

        model_config = SettingsConfigDict(env_prefix="", extra="ignore")

except ModuleNotFoundError:
    # Offline fallback when pydantic-settings is unavailable in shell runtime.
    class Settings:
        def __init__(self) -> None:
            self.app_name = os.getenv("APP_NAME", "SMC Heatwave Risk API")
            self.app_version = os.getenv("APP_VERSION", "0.1.0")
            self.database_url = os.getenv(
                "DATABASE_URL", "postgresql+psycopg://smc:smc@localhost:5432/smc_heatwave"
            )

settings = Settings()
