async def test_public_share_link_is_read_only_and_revocable(client):
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "sharer@example.org",
            "password": "correct-horse-battery",
            "display_name": "Sharer",
        },
    )
    assert registered.status_code == 200, registered.text
    client.headers["Authorization"] = f"Bearer {registered.json()['access_token']}"

    layer = await client.post(
        "/api/v1/layers",
        json={"name": "Shared survey", "visibility": "private", "geometry_type": "point"},
    )
    layer_id = layer.json()["id"]
    feature = await client.post(
        f"/api/v1/layers/{layer_id}/features",
        json={
            "properties": {"name": "Bench", "_nasmap_id": "private"},
            "geometry": {"type": "Point", "coordinates": [0.1, 52.2]},
        },
    )
    assert feature.status_code == 201, feature.text

    created = await client.post(
        f"/api/v1/layers/{layer_id}/share-links",
        json={"expires_in_days": 7},
    )
    assert created.status_code == 201, created.text
    share = created.json()
    assert share["url"] == f"/share/{share['token']}"

    client.headers.pop("Authorization")
    public = await client.get(f"/api/v1/public/shares/{share['token']}")
    assert public.status_code == 200, public.text
    assert public.json()["layer"]["name"] == "Shared survey"
    assert public.json()["layer"]["owner"] == "Sharer"

    features = await client.get(f"/api/v1/public/shares/{share['token']}/features")
    assert features.status_code == 200, features.text
    payload = features.json()
    assert payload["meta"]["total"] == 1
    assert payload["features"][0]["properties"] == {"name": "Bench"}

    client.headers["Authorization"] = f"Bearer {registered.json()['access_token']}"
    revoked = await client.delete(f"/api/v1/layers/{layer_id}/share-links/{share['id']}")
    assert revoked.status_code == 204, revoked.text

    client.headers.pop("Authorization")
    gone = await client.get(f"/api/v1/public/shares/{share['token']}")
    assert gone.status_code == 404
