import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from './Icon';

interface HelpContent {
  title: string;
  summary: string;
  points: string[];
  next?: { label: string; to: string };
}

function contentFor(pathname: string): HelpContent {
  if (pathname === '/') {
    return {
      title: 'Your dashboard',
      summary: 'Start a task or continue from a recent layer or import.',
      points: [
        'Import data creates a new layer from a file, URL, folder, photo set or OSM area.',
        'Draw a layer creates an empty vector layer you can edit directly on the map.',
        'Live data adds weather, hazards or other public feeds as refreshable layers.',
      ],
      next: { label: 'Open the map', to: '/map' },
    };
  }
  if (pathname.startsWith('/map')) {
    return {
      title: 'Working on the map',
      summary: 'The guidance bar under the toolbar always tells you the next useful action.',
      points: [
        'Select a layer on the left. Point, Line and Polygon become enabled only when that layer is editable.',
        'Click a feature to edit its fields, attachments and history. Drag the white handles to reshape geometry.',
        'For OSM layers, edit the local copy first, then use Attach / publish to OSM on a point feature. Existing OSM tags are kept.',
        'Add imports from the + Add menu; use Layers on a phone to open the layer drawer.',
      ],
      next: { label: 'Read the full map guide', to: '/help' },
    };
  }
  if (pathname.startsWith('/jobs')) {
    return {
      title: 'Imports and jobs',
      summary: 'Everything Strata is processing, with progress, errors and retries.',
      points: [
        'Open a job to see its detailed progress and result counts.',
        'Failed imports show the upstream error and can be retried.',
        'Scheduled sources refresh URL imports automatically; disable one here if needed.',
      ],
    };
  }
  if (pathname.startsWith('/live')) {
    return {
      title: 'Live data',
      summary: 'Live feeds are snapshots added as normal layers, with a Refresh action.',
      points: [
        'RainViewer radar is capped at zoom 7 and upscaled above that because the provider does not support closer zoom.',
        'Weather points sample Open-Meteo across an area you choose.',
        'The feed library adds public GeoJSON feeds such as GDACS, NASA EONET and US weather alerts without an API key.',
      ],
      next: { label: 'Add a live layer', to: '/live' },
    };
  }
  if (pathname.startsWith('/overlays')) {
    return {
      title: 'Overlay catalogue',
      summary: 'Reference maps, imagery, terrain and transport overlays are normal raster layers.',
      points: [
        'Search or filter the free catalogue, then press Add. The new layer appears on the map.',
        'Use imagery for context, labels for a transparent overlay, and hillshade for terrain.',
        'Attribution and licence are stored on each layer. Check provider terms before production use.',
      ],
      next: { label: 'Browse overlays', to: '/overlays' },
    };
  }
  if (pathname.startsWith('/settings')) {
    return {
      title: 'Account and integrations',
      summary: 'Manage your profile, OpenStreetMap connection and API keys.',
      points: [
        'Connect OpenStreetMap before publishing changesets.',
        'API keys are shown once and can be used with the X-API-Key header.',
        'Changing your password requires the current password.',
      ],
    };
  }
  return {
    title: 'Strata help',
    summary: 'Use the guidance bar and contextual help to learn each screen as you work.',
    points: [
      'Layers hold editable vector features or raster imagery.',
      'Imports run in the background; follow them on the Imports page.',
      'Public share links are read-only and can be revoked from the layer Share dialog.',
    ],
    next: { label: 'Open full help', to: '/help' },
  };
}

export default function ContextHelp() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const content = contentFor(pathname);

  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [open]);

  return (
    <>
      <button
        className="context-help-button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Explain this screen"
        title="Explain this screen"
      >
        <Icon name="help" size={17} />
      </button>
      {open && (
        <aside className="context-help" role="dialog" aria-label={content.title}>
          <div className="context-help-head">
            <span className="context-help-icon"><Icon name="help" size={15} /></span>
            <div>
              <strong>{content.title}</strong>
              <small>Contextual help</small>
            </div>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close help">
              <Icon name="close" size={15} />
            </button>
          </div>
          <p className="context-help-summary">{content.summary}</p>
          <ul>
            {content.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          {content.next && (
            <Link className="btn btn-secondary btn-sm" to={content.next.to} onClick={() => setOpen(false)}>
              {content.next.label}
            </Link>
          )}
          <Link className="context-help-full" to="/help" onClick={() => setOpen(false)}>
            Open the full guide
          </Link>
        </aside>
      )}
    </>
  );
}
