from app.routers import osm as osm_router
from app.services import osm


async def _point_feature(admin_client):
    layer = await admin_client.post(
        "/api/v1/layers",
        json={"name": "OSM attachment test", "visibility": "private", "geometry_type": "point"},
    )
    layer_id = layer.json()["id"]
    feature = await admin_client.post(
        f"/api/v1/layers/{layer_id}/features",
        json={
            "properties": {"name": "Bench survey", "photo_filename": "private.jpg"},
            "geometry": {"type": "Point", "coordinates": [0.1, 52.2]},
        },
    )
    return feature.json()


async def test_nearby_nodes_endpoint(admin_client, monkeypatch):
    feature = await _point_feature(admin_client)

    async def fake_nearby(lat, lon, radius_m):
        assert (lat, lon, radius_m) == (52.2, 0.1, 25)
        return [
            {
                "osm_id": 42,
                "osm_version": 3,
                "lat": 52.2001,
                "lon": 0.1001,
                "distance_m": 12.3,
                "tags": {"amenity": "bench"},
                "name": "bench",
            }
        ]

    monkeypatch.setattr(osm_router.overpass, "fetch_nearby_nodes", fake_nearby)
    response = await admin_client.post(
        "/api/v1/osm/nearby",
        json={"feature_id": feature["id"], "radius_m": 25},
    )
    assert response.status_code == 200, response.text
    assert response.json()["nodes"][0]["osm_id"] == 42


async def test_preview_attaches_to_existing_node(admin_client, monkeypatch):
    feature = await _point_feature(admin_client)

    async def fake_fetch(osm_type, osm_id, access_token=None):
        assert (osm_type, osm_id) == ("node", 42)
        return {
            "type": "node",
            "id": 42,
            "version": 8,
            "lat": 52.2002,
            "lon": 0.1002,
            "tags": {"amenity": "bench", "name": "Old bench"},
        }

    monkeypatch.setattr(osm, "fetch_element", fake_fetch)
    response = await admin_client.post(
        "/api/v1/osm/preview",
        json={
            "feature_id": feature["id"],
            "comment": "Attach bench survey",
            "source": "Strata survey",
            "tags": {"name": "New bench"},
            "osm_id": 42,
        },
    )
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["action"] == "modify"
    assert preview["osm_id"] == 42
    assert preview["lat"] == 52.2002
    assert preview["lon"] == 0.1002
    assert preview["tags"] == {"amenity": "bench", "name": "New bench"}
    assert preview["existing_tags"] == {"amenity": "bench", "name": "Old bench"}
    assert "photo_filename" not in preview["diff_xml"]


async def test_preview_can_update_existing_way_tags(client, monkeypatch):
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "way-editor@example.org",
            "password": "correct-horse-battery",
            "display_name": "Way editor",
        },
    )
    client.headers["Authorization"] = f"Bearer {registered.json()['access_token']}"
    layer = await client.post(
        "/api/v1/layers",
        json={"name": "OSM ways", "visibility": "private", "geometry_type": "line"},
    )
    feature = await client.post(
        f"/api/v1/layers/{layer.json()['id']}/features",
        json={
            "properties": {"osm_type": "way", "osm_id": 55, "highway": "residential"},
            "geometry": {
                "type": "LineString",
                "coordinates": [[0.1, 52.2], [0.11, 52.21]],
            },
        },
    )

    async def fake_fetch(osm_type, osm_id, access_token=None):
        assert (osm_type, osm_id) == ("way", 55)
        return {
            "type": "way",
            "id": 55,
            "version": 9,
            "nodes": [101, 102],
            "tags": {"highway": "residential", "surface": "asphalt"},
        }

    monkeypatch.setattr(osm, "fetch_element", fake_fetch)
    response = await client.post(
        "/api/v1/osm/preview",
        json={
            "feature_id": feature.json()["id"],
            "comment": "Add surface",
            "tags": {"surface": "paved"},
        },
    )
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["action"] == "modify"
    assert preview["osm_type"] == "way"
    assert preview["tags"] == {"highway": "residential", "surface": "paved"}
    assert '<way id="55"' in preview["diff_xml"]
    assert '<nd ref="101"/>' in preview["diff_xml"]
