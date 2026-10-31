# Sharing layers

Strata has two independent sharing paths.

## Named users and permissions

Use **Map → layer → Share** to grant a specific account `viewer` or `editor`
access to one layer. The account must exist, and editors also need a global
`editor` or `admin` role. Explicit grants are useful for collaborators inside
the same Strata instance.

Layer visibility still applies:

- **Private**: owner, admins and explicit grants.
- **Internal**: any signed-in user can read the layer.
- **Public**: any signed-in user can read the layer. It is still an
  authenticated instance; use a public share link for anonymous access.

## Public read-only links

The same **Share** dialog can create a public link for a vector layer.

- The link contains a random token and requires no Strata account.
- Visitors can pan/zoom the map, inspect feature properties, read attribution
  and download the feature collection as GeoJSON.
- Links are read-only. They cannot edit the layer, see other layers, manage
  permissions or access attachments.
- Choose an expiry between 7 days and 1 year. Revoke a link at any time from the
  Share dialog; revocation is immediate.
- Photos, attachments and internal `_nasmap*` properties are not included.
- Share links are currently limited to vector layers. Raster layers need an
  authenticated map session.

## Operational notes

- Treat public links like unlisted URLs: anyone who has one can read the data.
  Do not create them for sensitive layers.
- Revoke links when a project ends or a collaborator leaves.
- Public link use is not written to the audit log for every feature request;
  link creation and revocation are audited.
- If you need user-level access control, use visibility and explicit grants
  instead of a public link.
