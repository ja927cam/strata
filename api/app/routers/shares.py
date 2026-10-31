"""Read-only public links for sharing vector data without an account."""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import Text, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit import audit
from ..auth import CurrentUser
from ..database import get_db
from ..models import Feature, Layer, ShareLink, User
from ..permissions import get_layer_or_404, permission_role

router = APIRouter(tags=["shares"])


class ShareLinkIn(BaseModel):
    expires_in_days: int = Field(default=30, ge=1, le=3650)


def _share_url(token: str) -> str:
    return f"/share/{token}"


def _serialize_link(link: ShareLink) -> dict[str, Any]:
    expired = bool(link.expires_at and link.expires_at <= datetime.now(UTC))
    return {
        "id": str(link.id),
        "token": link.token,
        "url": _share_url(link.token),
        "created_at": link.created_at,
        "expires_at": link.expires_at,
        "revoked_at": link.revoked_at,
        "active": not link.revoked_at and not expired,
        "expired": expired,
    }


async def _owner_layer(db: AsyncSession, layer_id: str, user: User) -> Layer:
    layer = await get_layer_or_404(db, layer_id)
    role = await permission_role(db, layer, user)
    if role != "owner":
        raise HTTPException(status_code=403, detail="Only the layer owner can manage share links")
    if layer.geometry_type in {"raster", "table"}:
        raise HTTPException(
            status_code=422,
            detail="Public share links currently support vector layers only",
        )
    return layer


async def _active_link(db: AsyncSession, token: str) -> tuple[ShareLink, Layer, User | None]:
    link = await db.scalar(select(ShareLink).where(ShareLink.token == token))
    if not link or link.revoked_at is not None:
        raise HTTPException(status_code=404, detail="Share link not found")
    if link.expires_at and link.expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=404, detail="Share link has expired")
    layer = await db.scalar(
        select(Layer).where(Layer.id == link.layer_id, Layer.deleted_at.is_(None))
    )
    if not layer:
        raise HTTPException(status_code=404, detail="Layer not found")
    owner = await db.get(User, layer.owner_id)
    return link, layer, owner


def _public_properties(properties: dict[str, Any] | None) -> dict[str, Any]:
    return {
        key: value
        for key, value in (properties or {}).items()
        if not str(key).startswith("_nasmap")
    }


def _public_layer(layer: Layer, owner: User | None) -> dict[str, Any]:
    return {
        "name": layer.name,
        "description": layer.description,
        "geometry_type": layer.geometry_type,
        "style": layer.style or {},
        "metadata": {"provider": (layer.metadata_ or {}).get("provider")},
        "attribution": layer.attribution,
        "licence": layer.licence,
        "feature_count": layer.feature_count,
        "updated_at": layer.updated_at,
        "owner": owner.display_name if owner else "Strata user",
    }


@router.post("/layers/{layer_id}/share-links", status_code=201)
async def create_share_link(
    layer_id: str,
    payload: ShareLinkIn,
    request: Request,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    layer = await _owner_layer(db, layer_id, user)
    link = ShareLink(
        layer_id=layer.id,
        token=secrets.token_urlsafe(24),
        created_by=user.id,
        expires_at=datetime.now(UTC) + timedelta(days=payload.expires_in_days),
    )
    db.add(link)
    await db.flush()
    audit(
        db,
        user,
        "share.create",
        "layer",
        layer.id,
        {"share_link_id": str(link.id), "expires_at": link.expires_at},
        request,
    )
    await db.commit()
    await db.refresh(link)
    return _serialize_link(link)


@router.get("/layers/{layer_id}/share-links")
async def list_share_links(
    layer_id: str,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    layer = await _owner_layer(db, layer_id, user)
    links = (
        await db.scalars(
            select(ShareLink)
            .where(ShareLink.layer_id == layer.id)
            .order_by(ShareLink.created_at.desc())
        )
    ).all()
    return [_serialize_link(link) for link in links]


@router.delete("/layers/{layer_id}/share-links/{link_id}", status_code=204)
async def revoke_share_link(
    layer_id: str,
    link_id: UUID,
    request: Request,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    layer = await _owner_layer(db, layer_id, user)
    link = await db.get(ShareLink, link_id)
    if not link or link.layer_id != layer.id:
        raise HTTPException(status_code=404, detail="Share link not found")
    link.revoked_at = datetime.now(UTC)
    audit(
        db,
        user,
        "share.revoke",
        "layer",
        layer.id,
        {"share_link_id": str(link.id)},
        request,
    )
    await db.commit()


@router.get("/public/shares/{token}")
async def public_share(token: str, db: Annotated[AsyncSession, Depends(get_db)]):
    link, layer, owner = await _active_link(db, token)
    return {
        "token": token,
        "layer": _public_layer(layer, owner),
        "expires_at": link.expires_at,
        "features_url": f"/api/v1/public/shares/{token}/features",
    }


@router.get("/public/shares/{token}/features")
async def public_share_features(
    token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    bbox: str | None = None,
    q: str | None = None,
    limit: int = 5000,
    offset: int = 0,
):
    _, layer, _ = await _active_link(db, token)
    limit = max(1, min(limit, 20000))
    offset = max(0, offset)
    conditions = [Feature.layer_id == layer.id, Feature.deleted_at.is_(None)]
    if bbox:
        try:
            min_lon, min_lat, max_lon, max_lat = [float(value) for value in bbox.split(",")]
        except ValueError as exc:
            raise HTTPException(
                status_code=422, detail="bbox must be min_lon,min_lat,max_lon,max_lat"
            ) from exc
        if not (-180 <= min_lon <= max_lon <= 180 and -90 <= min_lat <= max_lat <= 90):
            raise HTTPException(status_code=422, detail="bbox is outside valid ranges")
        envelope = func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
        conditions.append(func.ST_Intersects(Feature.geometry, envelope))
    if q:
        conditions.append(func.cast(Feature.properties, Text).ilike(f"%{q}%"))
    where = conditions[0]
    for condition in conditions[1:]:
        where = where & condition
    total = int(await db.scalar(select(func.count()).select_from(Feature).where(where)) or 0)
    rows = (
        await db.execute(
            select(Feature, func.ST_AsGeoJSON(Feature.geometry))
            .where(where)
            .order_by(Feature.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    features = []
    for feature, geometry_json in rows:
        features.append(
            {
                "type": "Feature",
                "id": str(feature.id),
                "geometry": json.loads(geometry_json) if geometry_json else None,
                "properties": _public_properties(feature.properties),
            }
        )
    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {"total": total, "limit": limit, "offset": offset, "returned": len(features)},
    }
