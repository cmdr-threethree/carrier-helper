# Carrier Helper

A local-first, browser-only fleet carrier tracker for Elite Dangerous. It talks
to Frontier's OAuth2 directly from the browser, sends CAPI requests through a
tiny same-origin Cloudflare Pages Function, and stores everything in IndexedDB.
There is no database or application backend, no telemetry, and no third-party
scripts loaded at runtime.

The proxy exists because Frontier's **actual CAPI responses omit
`Access-Control-Allow-Origin`**, even though the preflight response includes it.
A browser therefore cannot read a direct `companion.orerve.net` response. The
Pages Function forwards only `GET /fleetcarrier` and adds no application state.

## Features

- Frontier OAuth2 Authorization Code flow with PKCE
- Multiple Frontier accounts with fully separated carriers and history
- Manual `/fleetcarrier` sync, limited to one request per commander every
  15 minutes
- Carrier dashboard: balance, fuel, capacity, upkeep, market profit, state
- Detail views: market and orders, finances, cargo, itinerary, service crew,
  raw JSON
- 7 days of raw snapshots (latest per carrier always kept) and 90 days of
  trend summaries
- Balance, fuel, free-space, and market-profit charts
- Versioned JSON import/export; tokens are never exported
- Dark, responsive UI with no UI framework

## Requirements

- Node.js 22+ (Node 24 is used in development)
- An approved Frontier CAPI developer application
  - Client ID from the Frontier Developer Zone
  - The exact redirect URI registered for that application
  - A client secret is **not** used and must never be shipped to a browser

This app is configured for the redirect URI:

```
https://edcarrier.threethree.cc/
```

The redirect URI from the Frontier developer application must match exactly,
including the trailing slash.

## Setup

```bash
npm install
cp .env.example .env.local
```

Set the Client ID in `.env.local` (or the build environment):

```env
VITE_FRONTIER_CLIENT_ID=your-approved-client-id
VITE_FRONTIER_REDIRECT_URI=https://edcarrier.threethree.cc/
VITE_MOCK_AUTH=false
```

The Client ID is public by design in a static OAuth public client. Do not put
the Frontier shared key/client secret in any `VITE_*` variable.

### Development

```bash
npm run dev
```

Local development uses `.env.development`, which enables **demo mode**. Demo
accounts are generated entirely in the browser with 30 days of history, so no
Frontier login is required. Real OAuth should be tested on the deployed origin
because no localhost redirect URI is registered.

### Build and preview

```bash
npm run build
npm run preview
```

Output is static in `dist/`.

## Deployment

The app uses hash routing, so no SPA rewrite is required. The OAuth callback is
handled at the site root.

Security headers are provided for:

- Netlify / Cloudflare Pages: `public/_headers`
- Vercel: `vercel.json`

The CSP allows requests only to:

- same-origin `/api/capi/*` (`'self'`)
- `https://auth.frontierstore.net` for token exchange, refresh, and `/me`

CAPI traffic goes to the same origin and is forwarded by the Pages Function in
`functions/api/capi/[endpoint].ts` to `https://companion.orerve.net`. If you
deploy somewhere other than Cloudflare Pages, you must provide an equivalent
same-origin proxy; the `functions/` directory is Cloudflare-specific.

If you deploy to a different origin, update the Frontier redirect URI and the
`VITE_FRONTIER_REDIRECT_URI` build variable.

## How it works

### Authentication

1. Generate a 32-byte verifier, base64url-encoded **with padding** (Frontier
   expects the verifier padding to remain).
2. Create an S256 challenge with the padding stripped.
3. Redirect to `https://auth.frontierstore.net/auth` with `scope=auth capi`.
4. Exchange the code at `/token` with `redirect_uri`, `code`,
   `grant_type=authorization_code`, `code_verifier`, and `client_id`.
5. Fetch `/me` for the Frontier customer ID and platform. Email and real names
   are not stored.
6. Store the rotating refresh token in IndexedDB and refresh lazily at sync
   time, serialized per account with Web Locks.

The app does not send `client_secret`; PKCE public clients should not need it.
Refresh tokens have a limited lifetime, so accounts occasionally need to be
re-authorized. The UI surfaces that state instead of deleting data.

To add a second Frontier account, sign out of Frontier first or use a private
window if the browser silently reuses the current Frontier login session.

### Sync and rate limit

One sync is one request:

```
GET https://companion.orerve.net/fleetcarrier?language=en
```

The 15-minute cooldown is reserved before the request. It is refunded only for
network-level failures, where no request reached Frontier. HTTP responses keep
the cooldown.

Handled statuses:

| Status | Behavior |
| --- | --- |
| `200` | Store raw snapshot + summary |
| `204` | Account owns no carrier |
| `401` / `422` | Refresh token once, retry once |
| `418` | Frontier maintenance message |
| `429` | Honor `Retry-After` and keep the 15-minute minimum |
| `5xx` | Show error, keep cooldown |

There is no background polling. Sync is manual by design.

The cooldown is stored in the browser per Frontier account. Two browsers using
the same Frontier account do not share the cooldown, so avoid syncing the same
account from multiple browsers at the same time.

### Storage and retention

IndexedDB database `carrier-helper`:

- `accounts` — identity, tokens, sync state
- `carriers` — callsign, decoded name, system, last snapshot
- `snapshots` — full raw CAPI JSON
- `summaries` — small chart-friendly metrics
- `meta` — schema metadata

Retention runs on startup and after each sync:

- Summaries older than 90 days are deleted.
- Raw snapshots older than 7 days are deleted, except the latest raw snapshot
  for each carrier.
- Raw storage is capped at roughly 100 MB, dropping the oldest unprotected
  snapshots first.

`navigator.storage.persist()` can be requested from Settings. Browsers may
still evict local data, so export backups regularly.

### Backups

Export creates a versioned JSON file containing accounts (without tokens),
carriers, snapshots, and summaries. Tokens are excluded by the export schema
itself, and token fields in imported files are stripped.

Imported accounts start as “reconnect required” and cooldowns reset to zero.
Import supports merge (deduplicate by account ID and snapshot UUID) or replace.

## Privacy and security

- All account and carrier data stays in the browser.
- No analytics, telemetry, external fonts, or third-party scripts.
- Strict CSP, no `innerHTML` for external data, minimal runtime dependencies.
- Tokens are readable by same-origin JavaScript and browser extensions; that is
  inherent to a browser-only OAuth public client.
- Frontier PII such as email addresses and real names is not stored.

## Frontier CAPI notes

Frontier's CAPI preflight response includes `Access-Control-Allow-Origin: *`,
but the actual GET response does not. Browsers therefore discard direct CAPI
responses, which shows up as an empty or failed request in the Network tab.

The OAuth `/token` and `/me` endpoints are different: their actual responses do
include `Access-Control-Allow-Origin: *`, so authentication stays direct.

The Pages Function:

- accepts only `GET /api/capi/fleetcarrier`
- forwards only `Authorization`, `Accept`, `Accept-Language`, and the
  `language` query parameter
- sends a `User-Agent` identifying Carrier Helper
- forwards the upstream status, JSON body, and `Retry-After`
- strips cookies and caches nothing

Before using a real Frontier account, verify these on the deployed origin:

1. PKCE login completes and `/me` returns the customer ID.
2. The refresh-token grant succeeds without `client_secret`.
3. `/api/capi/fleetcarrier` returns `200` and carrier JSON in the browser.
4. The response appears in the Network tab without a CORS failure.

If Frontier ever requires a client secret for token refresh, a similar proxy
for `/token` can be added without changing storage or UI code.

## Scripts

```bash
npm run dev        # Vite dev server (demo mode by default)
npm run typecheck  # strict TypeScript check
npm run test       # Vitest unit/integration tests
npm run build      # typecheck + production build
npm run preview    # serve the production build
npm run check      # typecheck + tests + build
```

## Project layout

```
src/
  auth/       PKCE, OAuth callback, token refresh, account management
  backup/     versioned export, import, zod validation
  capi/       CAPI client, types, summaries, cooldown
  lib/        errors, formatting, time, hex decoding, logging
  mock/       generated demo accounts and 30-day history
  storage/    IndexedDB schema, repositories, retention
  ui/         DOM helpers, router, pages, components, layout
  sync.ts     per-account lock, cooldown, fetch, snapshot persistence
functions/
  api/capi/[endpoint].ts   same-origin Cloudflare Pages Function proxy
```

## License

0BSD. See `LICENSE-0BSD.txt`.
