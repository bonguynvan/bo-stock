"""Tests for dashboard layout — pure tile normalization + the get/update endpoints."""
from __future__ import annotations

from app.services.dashboard import DEFAULT_TILES, normalize_tiles


class TestNormalizeTiles:
    def test_none_yields_full_default_order(self) -> None:
        assert normalize_tiles(None) == list(DEFAULT_TILES)

    def test_keeps_only_known_keys_preserving_order(self) -> None:
        assert normalize_tiles(["macro", "world", "bogus", "crypto"]) == ["macro", "world", "crypto"]

    def test_lowercases_and_dedupes(self) -> None:
        assert normalize_tiles(["WORLD", "world", " World "]) == ["world"]

    def test_valid_empty_list_is_preserved(self) -> None:
        # The user may hide every tile.
        assert normalize_tiles([]) == []

    def test_non_list_falls_back_to_default(self) -> None:
        assert normalize_tiles("world") == list(DEFAULT_TILES)
        assert normalize_tiles({"world": 1}) == list(DEFAULT_TILES)

    def test_drops_non_string_entries(self) -> None:
        assert normalize_tiles(["world", 3, None, "crypto"]) == ["world", "crypto"]


async def test_layout_seeds_default_then_persists_reorder(session, user) -> None:
    from app.routers.dashboard import get_layout, update_layout
    from app.schemas.dashboard import DashboardLayoutUpdate

    # First GET seeds + returns the default order.
    seeded = await get_layout(db=session, user=user)
    assert seeded.data.tiles == list(DEFAULT_TILES)
    assert seeded.data.allowed == list(DEFAULT_TILES)

    # PUT a reordered + reduced set (unknown key dropped).
    updated = await update_layout(DashboardLayoutUpdate(tiles=["macro", "world", "ghost"]), db=session, user=user)
    assert updated.data.tiles == ["macro", "world"]

    # GET reflects the persisted layout.
    again = await get_layout(db=session, user=user)
    assert again.data.tiles == ["macro", "world"]
