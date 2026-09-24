"""Terminal HOME dashboard layout — canonical tile registry + normalization.

Tile *rendering* lives in the frontend; the backend only owns the set of valid tile
keys and the persisted order, so a stored layout can never reference a tile the UI
cannot draw.
"""
from __future__ import annotations

# Canonical tile keys in their default order. Adding a tile here (and in the
# frontend registry) makes it available; unknown keys are dropped on save.
DEFAULT_TILES: tuple[str, ...] = (
    "world",
    "fx",
    "commodities",
    "movers",
    "watchlist",
    "crypto",
    "macro",
    "worldbank",
    "dbnomics",
    "asean",
    "news",
    "sectorheat",
    "pulse",
    "foreign",
)
_ALLOWED = set(DEFAULT_TILES)


def allowed_tiles() -> list[str]:
    return list(DEFAULT_TILES)


def normalize_tiles(tiles: object) -> list[str]:
    """Keep only known tile keys, lower-cased, de-duplicated, order preserved.

    ``None`` (no stored layout) → the full default order. A valid but empty list is
    preserved as empty (the user may hide every tile).
    """
    if tiles is None:
        return list(DEFAULT_TILES)
    if not isinstance(tiles, list):
        return list(DEFAULT_TILES)
    seen: set[str] = set()
    out: list[str] = []
    for t in tiles:
        if not isinstance(t, str):
            continue
        key = t.strip().lower()
        if key in _ALLOWED and key not in seen:
            seen.add(key)
            out.append(key)
    return out
