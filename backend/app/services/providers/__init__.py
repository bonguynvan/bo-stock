"""Pluggable market-data providers."""
from __future__ import annotations

from app.config import get_settings
from app.services.providers.base import DataProvider, FetchedMetrics, FetchedStock
from app.services.providers.fixtures import FixtureProvider
from app.services.providers.resilient import ResilientProvider
from app.services.providers.tcbs import TCBSProvider
from app.services.providers.vci import VCIProvider

__all__ = [
    "DataProvider",
    "FetchedStock",
    "FetchedMetrics",
    "VCIProvider",
    "TCBSProvider",
    "FixtureProvider",
    "ResilientProvider",
    "get_provider",
    "available_providers",
    "current_provider_name",
    "set_provider_override",
]

_ALLOWED = ("resilient", "vci", "tcbs", "fixtures")
# Runtime override set from the Settings UI. In-memory only (single-user, local);
# resets to the .env DATA_PROVIDER on restart.
_override: str | None = None


def available_providers() -> list[str]:
    return list(_ALLOWED)


def current_provider_name() -> str:
    """The effective provider — runtime override if set, else the .env default."""
    return _override or get_settings().data_provider.lower()


def set_provider_override(name: str) -> str:
    """Switch the active provider at runtime. Raises ValueError on unknown name."""
    global _override
    chosen = (name or "").lower()
    if chosen not in _ALLOWED:
        raise ValueError(
            f"Provider không hợp lệ: '{name}'. Hợp lệ: {', '.join(_ALLOWED)}"
        )
    _override = chosen
    return chosen


def get_provider(name: str | None = None) -> DataProvider:
    """Resolve the active provider.

    ``resilient`` (default) chains VCI → TCBS so the system survives either
    upstream being down or geo-blocked. A runtime override from the Settings UI
    takes precedence over the ``.env`` default.
    """
    chosen = (name or current_provider_name()).lower()
    if chosen == "fixtures":
        return FixtureProvider()
    if chosen == "vci":
        return VCIProvider()
    if chosen == "tcbs":
        return TCBSProvider()
    # default: resilient chain
    return ResilientProvider([VCIProvider(), TCBSProvider()])
