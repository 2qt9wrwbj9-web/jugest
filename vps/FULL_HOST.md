# Full VPS hosting plan

This is the prepared Netlify-independent path for hosting both the static jugest app and the Relay/API on one Ubuntu 24.04 VPS.

Example final layout:

- `https://jugest.com` -> static app from `/opt/jugest/public`
- `https://relay.jugest.com` -> Caddy -> Relay API on `127.0.0.1:8787`
- `https://relay.jugest.com/relay-bridge.html` -> same-origin Safari Relay bridge
- GitHub `main` remains the source of truth and deployment source.

## Safe migration order

1. Create the VPS with Ubuntu 24.04 LTS.
2. Buy the domain.
3. Point DNS A/AAAA records for the app host and Relay host at the VPS. Do not change the live jugest code yet.
4. On the VPS, run `bootstrap-full-ubuntu.sh` with the app hostname and Relay hostname.
5. Verify the app URL, `/healthz`, and `/relay-bridge.html` over HTTPS.
6. Run the existing Relay-origin switch in dry-run mode against the new Relay origin.
7. Change the GitHub source only after VPS health checks pass; run the full regression suite.
8. Change the bookmarklet loader from Netlify to the new app hostname.
9. From iPhone Safari, test pair -> send -> receive -> ack with real data.
10. Keep Netlify available as rollback until the live test has passed and the new origin's browser data has been restored/verified.

## Bootstrap

From the repository on the VPS:

```bash
sudo bash /opt/jugest/vps/bootstrap-full-ubuntu.sh jugest.com relay.jugest.com
```

The script installs/updates Node.js and Caddy, clones `main` into `/opt/jugest`, creates the locked-down Relay service/storage, serves the app from `public/`, configures Caddy HTTPS for both hostnames, and checks the public HTTPS endpoints.

It intentionally does **not** edit the app/Launcher production Relay URL. That final cutover remains a separate guarded step.

## DNS expectations

Both hostnames must resolve to the VPS before the public HTTPS verification step. Caddy obtains and renews TLS certificates automatically once DNS and ports 80/443 are reachable.

For an apex app domain such as `jugest.com`, point the apex record at the VPS. Point `relay.jugest.com` at the same VPS. A `www` redirect can be added later if wanted; it is not required for the migration.

## Rollback boundary

Until the final GitHub cutover, Netlify remains the live Relay/app dependency. The full-host bootstrap only prepares the new server in parallel. If the new VPS check fails, no production URL has changed.

This hosting work is infrastructure-only. It must not change setting judgment math, probability tables, evidence selection, ranking, strict Champion, calibration, store-share constraints, or acquisition pacing rules.
