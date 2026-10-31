import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Layer, User } from '../api/types';
import { ErrorBox, Field, Modal } from './ui';

interface Permission {
  id: string;
  role: 'editor' | 'viewer';
  user: User;
  created_at: string;
}

interface ShareLinkInfo {
  id: string;
  token: string;
  url: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  active: boolean;
  expired: boolean;
}

export default function LayerSharing({
  layer,
  onClose,
}: {
  layer: Layer;
  onClose: () => void;
}) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLinkInfo[]>([]);
  const [expiresDays, setExpiresDays] = useState('30');
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    try {
      setPermissions(await api<Permission[]>(`/layers/${layer.id}/permissions`));
      if (!['raster', 'table'].includes(layer.geometry_type)) {
        setShareLinks(await api<ShareLinkInfo[]>(`/layers/${layer.id}/share-links`));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sharing settings');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.id]);

  async function createShareLink() {
    setBusy(true);
    setError(null);
    try {
      const link = await api<ShareLinkInfo>(`/layers/${layer.id}/share-links`, {
        method: 'POST',
        body: { expires_in_days: Number(expiresDays) },
      });
      setShareLinks((current) => [link, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create public link');
    } finally {
      setBusy(false);
    }
  }

  async function copyShareLink(link: ShareLinkInfo) {
    const url = `${window.location.origin}${link.url}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(link.id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt('Copy this public link', url);
    }
  }

  async function revokeShareLink(link: ShareLinkInfo) {
    try {
      await api(`/layers/${layer.id}/share-links/${link.id}`, { method: 'DELETE' });
      setShareLinks((current) =>
        current.map((item) =>
          item.id === link.id ? { ...item, active: false, revoked_at: new Date().toISOString() } : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke public link');
    }
  }

  async function grant(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/layers/${layer.id}/permissions`, {
        method: 'POST',
        body: { email, role },
      });
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share layer');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/layers/${layer.id}/permissions/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke access');
    }
  }

  return (
    <Modal title={`Share · ${layer.name}`} onClose={onClose}>
      <div className="stack">
        <p className="muted">
          Visibility is <strong>{layer.visibility}</strong>. Explicit grants add access to this
          layer only. Layer editors must also have a global editor or admin role.
        </p>

        {!['raster', 'table'].includes(layer.geometry_type) && (
          <section className="public-share">
            <div className="panel-head">
              <div>
                <h3>Public read-only link</h3>
                <p className="hint">
                  Anyone with the link can view and download this layer without an account.
                  Photos and attachments are not included.
                </p>
              </div>
            </div>
            <div className="public-share-create">
              <select
                value={expiresDays}
                onChange={(e) => setExpiresDays(e.target.value)}
                aria-label="Share link expiry"
              >
                <option value="7">Expires in 7 days</option>
                <option value="30">Expires in 30 days</option>
                <option value="90">Expires in 90 days</option>
                <option value="365">Expires in 1 year</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={createShareLink} disabled={busy}>
                {busy ? 'Creating…' : 'Create public link'}
              </button>
            </div>
            {shareLinks.length === 0 ? (
              <p className="hint">No public links yet.</p>
            ) : (
              <div className="list">
                {shareLinks.map((link) => (
                  <div key={link.id} className="list-row share-link-row">
                    <div className="grow">
                      <strong className="mono">/share/{link.token.slice(0, 10)}…</strong>
                      <small>
                        {link.revoked_at
                          ? 'Revoked'
                          : link.expired
                            ? 'Expired'
                            : link.expires_at
                              ? `Expires ${new Date(link.expires_at).toLocaleDateString()}`
                              : 'No expiry'}
                      </small>
                    </div>
                    {link.active && (
                      <>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => void copyShareLink(link)}
                        >
                          {copied === link.id ? 'Copied' : 'Copy link'}
                        </button>
                        <a
                          className="btn btn-ghost btn-xs"
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                        <button
                          className="btn btn-ghost btn-xs danger"
                          onClick={() => void revokeShareLink(link)}
                        >
                          Revoke
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <form onSubmit={grant} className="stack">
          <div className="grid-2">
            <Field label="User email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.org"
                required
              />
            </Field>
            <Field label="Layer role">
              <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </Field>
          </div>
          <button className="btn btn-secondary" disabled={busy}>
            {busy ? 'Sharing…' : 'Grant access'}
          </button>
        </form>
        <ErrorBox message={error} />
        <div className="list">
          {permissions.length === 0 ? (
            <p className="muted">No explicit grants. The owner and admins always have access.</p>
          ) : (
            permissions.map((permission) => (
              <div key={permission.id} className="list-row">
                <div className="grow">
                  <strong>{permission.user.display_name || permission.user.email}</strong>
                  <small>
                    {permission.user.email} · {permission.user.role}
                  </small>
                </div>
                <span className="badge badge-info">{permission.role}</span>
                <button className="btn btn-ghost btn-xs danger" onClick={() => revoke(permission.id)}>
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
