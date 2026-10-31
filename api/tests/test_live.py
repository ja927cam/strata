from app.services import live


def test_rainviewer_max_zoom():
    assert live.RAINVIEWER_MAX_ZOOM == 7


def test_rainviewer_template():
    url = live.rainviewer_template("https://tilecache.rainviewer.com", "/v2/radar/abc")
    assert url == "https://tilecache.rainviewer.com/v2/radar/abc/256/{z}/{x}/{y}/4/1_1.png"


def test_wmo_descriptions():
    assert live.wmo_description(0) == "Clear"
    assert live.wmo_description(95) == "Thunderstorm"
    assert live.wmo_description(999) == "Unknown"


def test_parse_geojson_feed_skips_empty_geometry():
    payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-0.1, 51.5]},
                "properties": {"name": "Alert"},
            },
            {"type": "Feature", "geometry": None, "properties": {}},
        ],
    }
    records, stats = live.parse_geojson_payload(payload)
    assert stats == {"features": 2, "imported": 1, "skipped": 1}
    assert records[0]["geometry"].startswith("POINT")
    assert records[0]["properties"]["name"] == "Alert"
