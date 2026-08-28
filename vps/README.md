# jugest VPS relay

This directory is the Netlify-independent replacement for the existing `/api/relay` contract. It intentionally keeps the current pairing/send/peek/receive/ack/unlink request and response shapes so the frontend and ana-slo Launcher can switch hosts without changing judgment logic.

## Runtime

- Node.js 20 or newer (bootstrap installs Node.js 22 when needed)
- Linux VPS; Ubuntu 24.04 LTS is the prepared path
- Caddy HTTPS reverse proxy
- Persistent writable directory for `JUGEST_RELAY_DATA_DIR`

The Node process listens on `127.0.0.1:8787` by default. Caddy is the public listener. Caddy also serves the existing `relay-bridge.html` at the same HTTPS origin, preserving the Safari bridge transport used by the Launcher.

## Environment

- `HOST` — default `127.0.0.1`
- `PORT` — default `8787`
- `JUGEST_RELAY_DATA_DIR` — persistent relay storage directory; production service uses `/var/lib/jugest-relay`
- `JUGEST_ALLOWED_ORIGINS` — comma-separated browser origins. Production includes the GitHub Pages origin and ana-slo origins.

## Health and bridge checks

- `GET /healthz` -> `{ "ok": true, "service": "jugest-relay-vps" }`
- `GET /relay-bridge.html` -> Safari bridge page; it calls `/api/relay` on the same VPS origin

## Prepared install path

After a VPS and an HTTPS hostname exist, the intended Ubuntu path is:

1. Clone this repository to `/opt/jugest` or use `bootstrap-ubuntu.sh` to install prerequisites and clone it.
2. Run `sudo bash /opt/jugest/vps/configure-host.sh relay.example.com`.
3. The script creates the locked-down `jugest` service user, persistent storage, systemd unit, Caddy config, and verifies local + HTTPS health plus the bridge page.
4. Run `node scripts/switch-relay-origin.mjs https://relay.example.com` from the repository first. This is dry-run only.
5. Only after VPS health and bridge checks pass, run the same command with `--write`, run the full regression suite, and deploy GitHub Pages.
6. Perform one real pair -> send -> receive -> ack test from iPhone Safari.
7. After that live test passes, the old Netlify Relay can be retired.

`switch-relay-origin.mjs` updates the tool and Launcher together and refuses to proceed if their current Relay wiring is already split across different origins. It also requires root/public byte parity before writing, reducing the chance of a half-cutover.

## Operations

- `update-relay.sh` fetches `main`, checks the VPS server syntax, restarts the service, and requires local health to recover.
- `backup-relay.sh` creates a private tar.gz snapshot of `/var/lib/jugest-relay` and keeps 14 days by default. Relay data is transport state only; future analytics/store history should use a separate persistence/backup design.
- Logs are available with `journalctl -u jugest-relay.service`.

The migration layer is intentionally separate from setting analysis. It does not alter judgment math, ranking, strict Champion, calibration, probability tables, acquisition pacing/rate rules, or store-analysis evidence.
