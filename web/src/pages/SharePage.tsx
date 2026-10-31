import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { usePublicConfig } from '../api/config';
import type { FeatureCollection, GeoFeature, Layer } from '../api/types';
import Icon from '../components/Icon';
import MapView from '../components/MapView';
import { Spinner } from '../components/ui';

interface SharedLayer {
  name: string;
  description: string;
  geometry_type: string;
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
  attribution: string;
  licence: string;
  feature_count: number;
  updated_at: string;
  owner: string;
}

interface ShareInfo {
  token: string;
  layer: SharedLayer;
  expires_at: string | null;
}

export default function SharePage() {
  const { token = '' } = useParams();
  const config = usePublicConfig();
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [features, setFeatures] = useState<FeatureCollection | null>(null);
  const [selected, setSelected] = useState<GeoFeature | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api<ShareInfo>(`/public/shares/${token}`, { retry: false }),
      api<FeatureCollection>(`/public/shares/${token}/features?limit=20000`, { retry: false }),
    ])
      .then(([info, data]) => {
        setShare(info);
        setFeatures(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'This share link is unavailable'))
      .finally(() => setLoading(false));
  }, [token]);

  const layer = useMemo<Layer | null>(() => {
    if (!share) return null;
    return {
      id: share.token,
      owner_id: '',
      name: share.layer.name,
      description: share.layer.description,
      visibility: 'public',
      geometry_type: share.layer.geometry_type as Layer['geometry_type'],
      source_type: 'api',
      style: share.layer.style,
      metadata: share.layer.metadata,
      attribution: share.layer.attribution,
      licence: share.layer.licence,
      feature_count: share.layer.feature_count,
      access_role: 'viewer',
      created_at: share.layer.updated_at,
      updated_at: share.layer.updated_at,
    };
  }, [share]);

  function download() {
    if (!features || !share) return;
    const blob = new Blob([JSON.stringify(features, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${share.layer.name.replace(/[^a-z0-9_-]+/gi, '-')}.geojson`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !config) return <Spinner full />;

  if (error || !share || !layer || !features) {
    return (
      <main className="share-page share-page-error">
        <Icon name="layers" size={28} />
        <h1>Share link unavailable</h1>
        <p>{error || 'This link may have expired or been revoked.'}</p>
        <Link className="btn btn-primary" to="/">
          Open Strata
        </Link>
      </main>
    );
  }

  return (
    <main className="share-page">
      <header className="share-head">
        <div className="share-brand">
          <span className="brand-mark"><Icon name="layers" size={14} strokeWidth={2} /></span>
          <span>Strata</span>
        </div>
        <div className="share-title">
          <h1>{share.layer.name}</h1>
          <p>
            {share.layer.description || `Shared by ${share.layer.owner}`}
            {share.layer.feature_count > 0 && ` · ${share.layer.feature_count.toLocaleString()} features`}
          </p>
        </div>
        <div className="share-actions">
          <button className="btn btn-secondary btn-sm" onClick={download}>
            Download GeoJSON
          </button>
          <Link className="btn btn-primary btn-sm" to="/">
            Open in Strata
          </Link>
        </div>
      </header>
      <div className="share-map">
        <MapView
          layers={[layer]}
          layerData={{ [share.token]: features }}
          visible={{ [share.token]: true }}
          opacity={{ [share.token]: 1 }}
          activeLayerId={share.token}
          basemap={config.basemap_mode === 'local' ? 'local' : 'remote'}
          osmTileUrl={config.osm_tile_url}
          osmAttribution={config.osm_tile_attribution}
          tileserverUrl={config.tileserver_public_url}
          tool="pan"
          selectedFeature={selected}
          editable={false}
          onSelectFeature={(_, feature) => setSelected(feature)}
          onCreateFeature={async () => false}
          onUpdateGeometry={async () => undefined}
          onMeasure={() => undefined}
        />
        {selected && (
          <aside className="share-feature-card">
            <div className="panel-head">
              <h2>Feature details</h2>
              <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close">
                <Icon name="close" size={15} />
              </button>
            </div>
            <dl className="kv">
              {Object.entries(selected.properties || {})
                .filter(([key]) => !key.startsWith('_nasmap'))
                .slice(0, 30)
                .map(([key, value]) => (
                  <div key={key} className="share-property">
                    <dt>{key}</dt>
                    <dd>{value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
                  </div>
                ))}
            </dl>
          </aside>
        )}
        <footer className="share-foot">
          {share.layer.attribution && <span>{share.layer.attribution}</span>}
          {share.layer.licence && <span>{share.layer.licence}</span>}
          <span>Read-only public link</span>
        </footer>
      </div>
    </main>
  );
}
