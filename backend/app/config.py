"""Application settings loaded from environment / .env (Pydantic v2)."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field, computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_JWT_DEFAULT = "dev-insecure-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # PostgreSQL parts
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "vn_investment"
    postgres_user: str = "admin"
    postgres_password: str = "changeme"
    # Optional explicit DSN (wins over the parts above)
    database_url: str | None = None

    # App
    app_env: str = "development"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:3000"

    # Data provider: resilient (VCI→TCBS) | vci | tcbs | fixtures
    data_provider: str = "resilient"
    tcbs_base_url: str = "https://apipubaws.tcbs.com.vn"
    tcbs_referer: str = "https://tcinvest.tcbs.com.vn/"
    vci_trading_url: str = "https://trading.vietcap.com.vn/api"
    vci_iq_url: str = "https://iq.vietcap.com.vn/api/iq-insight-service"
    http_timeout: float = 10.0
    http_max_retries: int = 3
    http_rate_limit_per_sec: int = 5

    # Global-market connectors (Fincept-style aggregation of free/public sources).
    # World markets (Yahoo) + crypto (CoinGecko) need no key; macro (FRED) is freemium.
    fred_api_key: str | None = None

    # Auth (self-hosted JWT in an httpOnly cookie). Private-beta: registration needs
    # the invite code when set. Set a strong jwt_secret + auth_cookie_secure=true in prod.
    jwt_secret: str = "dev-insecure-secret-change-me"
    jwt_expire_hours: int = 168  # 7 days
    auth_cookie_name: str = "vnios_session"
    auth_cookie_secure: bool = False  # True behind HTTPS in prod
    auth_invite_code: str | None = None  # when set, required to register
    admin_emails: str = ""  # comma-separated emails granted admin (bootstrap)
    # When True, all non-public API routes require a valid session (prod gate).
    # Default False so local/dev + the test suite stay open.
    auth_required: bool = False

    # Scheduler
    scheduler_enabled: bool = False
    sync_timezone: str = "Asia/Ho_Chi_Minh"

    # Document upload + LLM (BCTC reader). API key via env, never hardcoded.
    upload_dir: str = "uploads"
    max_upload_mb: int = 20
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-4-6"
    anthropic_base_url: str = "https://api.anthropic.com"
    llm_max_tokens: int = 16000
    # USD per million tokens — used only to log a rough cost per analysis.
    anthropic_price_in_per_mtok: float = 3.0
    anthropic_price_out_per_mtok: float = 15.0

    @model_validator(mode="after")
    def _enforce_prod_auth(self) -> "Settings":
        """In production, refuse to start with insecure auth defaults (fail fast)."""
        if self.app_env == "production":
            problems = []
            if self.jwt_secret == _INSECURE_JWT_DEFAULT:
                problems.append("JWT_SECRET must be set to a strong random value")
            if not self.auth_cookie_secure:
                problems.append("AUTH_COOKIE_SECURE must be true (HTTPS)")
            if not self.auth_required:
                problems.append("AUTH_REQUIRED must be true")
            if problems:
                raise ValueError("Insecure production config: " + "; ".join(problems))
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def async_dsn(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        configured = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        # The Tauri desktop webview runs from a platform-specific local origin (Windows uses
        # http(s)://tauri.localhost, macOS/Linux tauri://localhost). Always allow them so the
        # desktop app reaches this backend cross-origin without extra config.
        tauri = ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]
        return list(dict.fromkeys(configured + tauri))

    @property
    def admin_email_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
