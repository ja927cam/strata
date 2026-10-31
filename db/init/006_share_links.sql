-- Read-only public links for vector layers.
CREATE TABLE IF NOT EXISTS app.share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id UUID NOT NULL REFERENCES app.layers(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_by UUID REFERENCES app.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS share_links_layer_idx ON app.share_links(layer_id);
CREATE INDEX IF NOT EXISTS share_links_token_idx ON app.share_links(token);
