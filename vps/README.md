# jugest VPS relay

This directory is the Netlify-independent replacement for the existing `/api/relay` contract. It intentionally keeps the current pairing/send/peek/receive/ack/unlink request and response shapes so the frontend and ana-slo Launcher can switch hosts without changing judgment logic.

## Runtime

- Node.js 22 or newer
- Linux VPS
- Caddy (or another HTTPS reverse proxy)
- Persistent writable directory for `JUGEST_RELAY_DATA_DIR`

The Node process listens on `127.0.0.1:8787` by default. Caddy should be the only public listener and should proxy an HTTPS hostname to that local port.

## Environment

- `HOST` — default `127.0.0.1`
- `PORT` — default `8787`
- `JUGEST_RELAY_DATA_DIR` — persistent relay storage directory; default `./data/relay`
- `JUGEST_ALLOWED_ORIGINS` — comma-separated browser origins. Production should include the GitHub Pages origin and ana-slo origins.

## Health check

`GET /healthz` returns `{ "ok": true, "service": "jugest-relay-vps" }`.

## Cutover order

1. Provision the VPS and install Node.js + Caddy.
2. Clone/update this repository at `/opt/jugest`.
3. Create a locked-down `jugest` system user and `/var/lib/jugest-relay` owned by that user.
4. Install `jugest-relay.service`, start it, and verify `/healthz` locally.
5. Configure the final HTTPS hostname in Caddy and verify `/healthz` over HTTPS.
6. Change the frontend/Launcher Relay endpoint from the old Netlify URL to the new VPS URL.
7. Run the repository regression suite, deploy GitHub Pages, then perform one real pair/send/receive/ack test.
8. After the live test passes, Netlify Relay can be retired.

The relay storage is intentionally separate from the future analytics/store-data database. This migration only removes the Netlify dependency; it does not alter setting-judgment math, ranking, calibration, probability tables, acquisition rules, or store analysis.
