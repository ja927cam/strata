import pytest
from fastapi import HTTPException

from app.routers import overlays


def test_xyz_template_validation():
    template = "https://1.1.1.1/{z}/{x}/{y}.png"
    assert overlays._validate_template(template) == template
    with pytest.raises(HTTPException):
        overlays._validate_template("https://1.1.1.1/tiles.png")
    with pytest.raises(HTTPException):
        overlays._validate_template("file:///tmp/{z}/{x}/{y}.png")


def test_bounds_validation():
    assert overlays._bounds(None) == [-180, -85, 180, 85]
    assert overlays._bounds([-1, -2, 3, 4]) == [-1, -2, 3, 4]
    with pytest.raises(HTTPException):
        overlays._bounds([3, -2, -1, 4])


def test_overlay_catalogue_is_substantial_and_well_formed():
    presets = overlays.PRESETS
    assert len(presets) >= 50
    ids = [preset["id"] for preset in presets]
    assert len(ids) == len(set(ids))
    for preset in presets:
        assert preset["provider"] in {"xyz", "wms"}
        assert preset["category"]
        if preset["provider"] == "xyz":
            template = preset["config"]["url_template"]
            assert "{z}" in template and "{x}" in template and "{y}" in template
        else:
            assert preset["config"]["url"]
            assert preset["config"]["layers"]


def test_live_catalogue_has_only_implemented_adapters():
    from app.services.sources import LIVE_FEEDS

    assert len(LIVE_FEEDS) >= 6
    ids = {feed["id"] for feed in LIVE_FEEDS}
    for feed in LIVE_FEEDS:
        assert feed["adapter"] in {
            "rainviewer",
            "open-meteo-weather",
            "usgs-earthquakes",
            "geojson",
        }, feed
    assert "gdacs" in ids and "nasa-eonet" in ids and "nws-alerts" in ids
