import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../api/auth';
import { usePublicConfig } from '../api/config';
import type { Layer, Paged } from '../api/types';
import BBoxPicker from '../components/BBoxPicker';
import GeoSearch from '../components/GeoSearch';
import Icon from '../components/Icon';
import { ErrorBox, Field, Spinner, formatDate } from '../components/ui';

type BBox = [number, number, number, number];

interface LiveFeed {
  id: string;
  label: string;
  description: string;
  kind: string;
  url: string | null;
  attribution: string;
  licence: string;
  category: string;
  adapter: string;
}

export default function LivePage() {
  const config = usePublicConfig();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'editor';
  const [layers, setLayers] = useState<Layer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [weatherName, setWeatherName] = useState('');
  const [grid, setGrid] = useState(3);
  const [weatherKind, setWeatherKind] = useState<'weather' | 'air' | 'marine'>('weather');
  const [minMagnitude, setMinMagnitude] = useState(2.5);
  const [quakeName, setQuakeName] = useState('');
  const [catalog, setCatalog] = useState<LiveFeed[]>([]);
  const [feedUrl, setFeedUrl] = useState('');
  const [feedName, setFeedName] = useState('');

  useEffect(() => {
    if (!canEdit) return;
    api<{ sources: LiveFeed[] }>('/live/catalog')
      .then((data) => setCatalog(data.sources))
      .catch(() => undefined);
  }, [canEdit]);

  const load = useCallback(async () => {
    try {
      const data = await api<Paged<Layer>>('/layers?limit=500');
      setLayers(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load live layers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const radarLayers = useMemo(
    () => layers.filter((layer) => layer.metadata?.provider === 'rainviewer'),
    [layers],
  );
  const weatherLayers = useMemo(
    () => layers.filter((layer) => layer.metadata?.provider === 'open-meteo'),
    [layers],
  );
  const quakeLayers = useMemo(
    () => layers.filter((layer) => layer.metadata?.provider === 'usgs-earthquakes'),
    [layers],
  );
  const feedLayers = useMemo(
    () => layers.filter((layer) => layer.metadata?.provider === 'geojson-feed'),
    [layers],
  );
  const addableFeeds = useMemo(
    () => catalog.filter((feed) => feed.url && feed.kind === 'geojson'),
    [catalog],
  );

  async function addFeed(feed: LiveFeed) {
    if (!feed.url) return;
    await run(
      `feed-${feed.id}`,
      () =>
        api<Layer>('/live/geojson', {
          method: 'POST',
          body: {
            url: feed.url,
            name: feed.label,
            source_id: feed.id,
            attribution: feed.attribution,
            licence: feed.licence,
            visibility: 'private',
          },
        }),
      `${feed.label} added.`,
    );
  }

  async function addCustomFeed() {
    if (!feedUrl.trim()) return;
    await run(
      'custom-feed',
      () =>
        api<Layer>('/live/geojson', {
          method: 'POST',
          body: {
            url: feedUrl.trim(),
            name: feedName.trim() || undefined,
            visibility: 'private',
          },
        }),
      'Live GeoJSON feed added.',
    );
    setFeedUrl('');
    setFeedName('');
  }

  async function refreshFeed(layer: Layer) {
    await run(
      `feed-refresh-${layer.id}`,
      () =>
        api<Layer>('/live/geojson/refresh', {
          method: 'POST',
          body: { layer_id: layer.id },
        }),
      'Live feed refreshed.',
    );
  }

  async function run(key: string, action: () => Promise<Layer | void>, message: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Live data request failed');
    } finally {
      setBusy(null);
    }
  }

  if (!config || loading) return <Spinner full />;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Live data</h1>
          <p className="page-subtitle">
            Current weather and seismic activity, added as normal map layers.
          </p>
        </div>
      </header>

      {notice && <div className="success-box">{notice}</div>}
      <ErrorBox message={error} />

      <section className="panel">
        <div className="panel-head">
          <h2>Weather radar</h2>
          <span className="badge badge-info">live</span>
        </div>
        <p className="muted">
          RainViewer precipitation radar. The tiles follow the latest available frame; existing
          radar layers update without re-importing. Close zooms are upscaled because RainViewer
          only serves radar up to zoom 7.
        </p>
        <div className="button-row">
          <button
            className="btn btn-primary btn-sm"
            disabled={busy === 'radar' || !canEdit}
            title={canEdit ? undefined : 'Editor access required'}
            onClick={() =>
              void run(
                'radar',
                () =>
                  api<Layer>('/live/weather/radar', {
                    method: 'POST',
                    body: { name: 'Weather radar', visibility: 'private' },
                  }),
                'Radar overlay added.',
              )
            }
          >
            <Icon name="weather" size={14} />
            {busy === 'radar' ? 'Adding…' : 'Add radar overlay'}
          </button>
          {radarLayers.length > 0 && (
            <Link className="btn btn-secondary btn-sm" to={`/map?layer=${radarLayers[0].id}`}>
              Open radar layer
            </Link>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Area point data</h2>
          <span className="badge">Open-Meteo</span>
        </div>
        <div className="live-split">
          <div className="stack">
            <GeoSearch onSelect={(box) => setBbox([box[0], box[1], box[2], box[3]])} />
            <Field
              label="Data"
              help="Choose current weather, air quality or marine conditions. All three sample a grid over the selected area."
            >
              <select
                value={weatherKind}
                onChange={(e) => {
                  const next = e.target.value as typeof weatherKind;
                  setWeatherKind(next);
                  setWeatherName('');
                }}
              >
                <option value="weather">Weather</option>
                <option value="air">Air quality</option>
                <option value="marine">Marine</option>
              </select>
            </Field>
            <Field label="Layer name" help="Points are sampled on a grid inside the selected area.">
              <input
                value={weatherName}
                onChange={(e) => setWeatherName(e.target.value)}
                placeholder={weatherKind === 'air' ? 'Air quality' : weatherKind === 'marine' ? 'Marine' : 'Weather'}
              />
            </Field>
            <Field label="Grid" help="More points means more detail but a larger request.">
              <select value={grid} onChange={(e) => setGrid(Number(e.target.value))}>
                <option value={3}>3 × 3 points</option>
                <option value={4}>4 × 4 points</option>
                <option value={5}>5 × 5 points</option>
              </select>
            </Field>
            {bbox && (
              <div className="bbox-readout">
                <span>W {bbox[0].toFixed(4)}</span>
                <span>S {bbox[1].toFixed(4)}</span>
                <span>E {bbox[2].toFixed(4)}</span>
                <span>N {bbox[3].toFixed(4)}</span>
              </div>
            )}
            <button
              className="btn btn-primary"
              disabled={!bbox || busy === 'weather' || !canEdit}
              title={canEdit ? undefined : 'Editor access required'}
              onClick={() =>
                bbox &&
                void run(
                  'weather',
                  () =>
                    api<Layer>('/live/weather/grid', {
                      method: 'POST',
                      body: {
                        bbox,
                        grid,
                        kind: weatherKind,
                        name: weatherName || undefined,
                        visibility: 'private',
                      },
                    }),
                  'Weather layer created.',
                )
              }
            >
              {busy === 'weather'
                ? 'Fetching…'
                : `Create ${weatherKind === 'air' ? 'air quality' : weatherKind} layer`}
            </button>
            {!bbox && <p className="hint">Choose an area on the map to enable this.</p>}
          </div>
          <div className="live-map">
            <BBoxPicker
              bbox={bbox}
              osmTileUrl={config.osm_tile_url}
              attribution={config.osm_tile_attribution}
              onChange={setBbox}
              height={300}
            />
            <p className="hint">Drag a rectangle, or search for a place above.</p>
          </div>
        </div>

        {weatherLayers.length > 0 && (
          <div className="list live-list">
            {weatherLayers.map((layer) => (
              <div key={layer.id} className="list-row">
                <Icon name="weather" size={16} />
                <div className="grow">
                  <strong>{layer.name}</strong>
                  <small>
                    {layer.metadata?.generated_at
                      ? `Updated ${formatDate(layer.metadata.generated_at)}`
                      : 'Weather points'}
                  </small>
                </div>
                <button
                  className="btn btn-ghost btn-xs"
                  disabled={busy === `weather-${layer.id}` || !canEdit}
                  title={canEdit ? undefined : 'Editor access required'}
                  onClick={() =>
                    void run(
                      `weather-${layer.id}`,
                      () =>
                        api<Layer>('/live/weather/grid', {
                          method: 'POST',
                          body: {
                            bbox: layer.metadata?.bbox,
                            layer_id: layer.id,
                            grid: layer.metadata?.grid || 3,
                            name: layer.name,
                            visibility: layer.visibility,
                          },
                        }),
                      'Weather layer refreshed.',
                    )
                  }
                >
                  Refresh
                </button>
                <Link className="btn btn-ghost btn-xs" to={`/map?layer=${layer.id}`}>
                  Open
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Earthquakes</h2>
          <span className="badge">USGS · 24h</span>
        </div>
        <div className="grid-2">
          <Field label="Minimum magnitude" help="USGS current-day feed filtered by magnitude.">
            <input
              type="number"
              step="0.1"
              min={-2}
              max={10}
              value={minMagnitude}
              onChange={(e) => setMinMagnitude(Number(e.target.value))}
            />
          </Field>
          <Field label="Layer name">
            <input
              value={quakeName}
              onChange={(e) => setQuakeName(e.target.value)}
              placeholder={`Earthquakes M${minMagnitude}+`}
            />
          </Field>
        </div>
        <div className="button-row">
          <button
            className="btn btn-primary btn-sm"
            disabled={busy === 'quakes' || !canEdit}
            title={canEdit ? undefined : 'Editor access required'}
            onClick={() =>
              void run(
                'quakes',
                () =>
                  api<Layer>('/live/earthquakes', {
                    method: 'POST',
                    body: {
                      min_magnitude: minMagnitude,
                      name: quakeName || undefined,
                      visibility: 'private',
                    },
                  }),
                'Earthquake layer created.',
              )
            }
          >
            <Icon name="activity" size={14} />
            {busy === 'quakes' ? 'Fetching…' : 'Create earthquake layer'}
          </button>
        </div>

        {quakeLayers.length > 0 && (
          <div className="list live-list">
            {quakeLayers.map((layer) => (
              <div key={layer.id} className="list-row">
                <Icon name="activity" size={16} />
                <div className="grow">
                  <strong>{layer.name}</strong>
                  <small>
                    {layer.metadata?.generated_at
                      ? `Updated ${formatDate(layer.metadata.generated_at)}`
                      : 'USGS earthquakes'}
                  </small>
                </div>
                <button
                  className="btn btn-ghost btn-xs"
                  disabled={busy === `quake-${layer.id}` || !canEdit}
                  title={canEdit ? undefined : 'Editor access required'}
                  onClick={() =>
                    void run(
                      `quake-${layer.id}`,
                      () =>
                        api<Layer>('/live/earthquakes', {
                          method: 'POST',
                          body: {
                            min_magnitude: layer.metadata?.min_magnitude ?? 2.5,
                            layer_id: layer.id,
                            name: layer.name,
                            visibility: layer.visibility,
                          },
                        }),
                      'Earthquake layer refreshed.',
                    )
                  }
                >
                  Refresh
                </button>
                <Link className="btn btn-ghost btn-xs" to={`/map?layer=${layer.id}`}>
                  Open
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {canEdit && (
      <section className="panel">
        <div className="panel-head">
          <h2>Live feed library</h2>
          <span className="badge">{addableFeeds.length} one-click feeds</span>
        </div>
        <p className="muted">
          One-click public GeoJSON feeds with no API key. The map stores a snapshot and a
          Refresh replaces it with the latest observation.
        </p>
        {addableFeeds.length > 0 ? (
          <div className="source-grid">
            {addableFeeds.map((feed) => (
              <div key={feed.id} className="source-card">
                <div className="source-card-head">
                  <strong>{feed.label}</strong>
                  <span className="badge">{feed.category}</span>
                </div>
                <p>{feed.description}</p>
                <small>{feed.attribution}</small>
                <button
                  className="btn btn-secondary btn-xs"
                  disabled={busy === `feed-${feed.id}` || !canEdit}
                  title={canEdit ? undefined : 'Editor access required'}
                  onClick={() => void addFeed(feed)}
                >
                  {busy === `feed-${feed.id}` ? 'Adding…' : 'Add feed'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint">No keyless GeoJSON feeds are currently available on this server.</p>
        )}

        <details className="advanced-options">
          <summary>Add a custom GeoJSON feed</summary>
          <div className="stack" style={{ paddingTop: 10 }}>
            <Field
              label="GeoJSON URL"
              hint="Public HTTPS GeoJSON FeatureCollection. Refreshing replaces this layer’s features."
            >
              <input
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://example.org/events.geojson"
              />
            </Field>
            <Field label="Layer name">
              <input
                value={feedName}
                onChange={(e) => setFeedName(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <button
              className="btn btn-primary btn-sm"
              disabled={!feedUrl.trim() || busy === 'custom-feed' || !canEdit}
              onClick={() => void addCustomFeed()}
            >
              {busy === 'custom-feed' ? 'Fetching…' : 'Add custom feed'}
            </button>
          </div>
        </details>

        {feedLayers.length > 0 && (
          <div className="list live-list">
            {feedLayers.map((layer) => (
              <div key={layer.id} className="list-row">
                <Icon name="activity" size={16} />
                <div className="grow">
                  <strong>{layer.name}</strong>
                  <small>
                    {layer.metadata?.generated_at
                      ? `Updated ${formatDate(layer.metadata.generated_at)}`
                      : 'Live GeoJSON feed'}
                  </small>
                </div>
                <button
                  className="btn btn-ghost btn-xs"
                  disabled={busy === `feed-refresh-${layer.id}` || !canEdit}
                  title={canEdit ? undefined : 'Editor access required'}
                  onClick={() => void refreshFeed(layer)}
                >
                  Refresh
                </button>
                <Link className="btn btn-ghost btn-xs" to={`/map?layer=${layer.id}`}>
                  Open
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      )}

      <p className="hint">
        Weather: Open-Meteo and RainViewer. Earthquakes: USGS. Other feeds: GDACS, NASA EONET and
        the US National Weather Service. Respect each provider’s usage terms and attribution;
        attribution is stored on every layer.
      </p>
    </div>
  );
}
