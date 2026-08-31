#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root: sudo bash bootstrap-full-ubuntu.sh jugest.com relay.jugest.com" >&2
  exit 1
fi

APP_HOST=${1:-}
RELAY_HOST=${2:-}
valid_host() {
  local value=${1:-}
  [[ -n "$value" && "$value" != *"/"* && "$value" != *":"* && "$value" != *" "* ]]
}
if ! valid_host "$APP_HOST" || ! valid_host "$RELAY_HOST" || [[ "$APP_HOST" == "$RELAY_HOST" ]]; then
  echo "Usage: sudo bash bootstrap-full-ubuntu.sh jugest.com relay.jugest.com" >&2
  exit 2
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git caddy

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)
fi
if (( NODE_MAJOR < 20 )); then
  TMP=$(mktemp)
  curl -fsSL https://deb.nodesource.com/setup_22.x -o "$TMP"
  bash "$TMP"
  rm -f "$TMP"
  apt-get install -y nodejs
fi

if [[ -d /opt/jugest/.git ]]; then
  git -C /opt/jugest fetch --depth=1 origin main
  git -C /opt/jugest reset --hard origin/main
else
  rm -rf /opt/jugest
  git clone --depth 1 https://github.com/2qt9wrwbj9-web/jugest.git /opt/jugest
fi

REPO_DIR=/opt/jugest
DATA_DIR=/var/lib/jugest-relay
SERVICE_SRC="$REPO_DIR/vps/jugest-relay.service"

if [[ ! -f "$REPO_DIR/public/index.html" || ! -f "$REPO_DIR/public/relay-bridge.html" || ! -f "$REPO_DIR/vps/relay-server.mjs" ]]; then
  echo "Incomplete jugest checkout at $REPO_DIR" >&2
  exit 3
fi

node --check "$REPO_DIR/vps/relay-server.mjs"

if ! id jugest >/dev/null 2>&1; then
  useradd --system --home /nonexistent --shell /usr/sbin/nologin jugest
fi
install -d -o jugest -g jugest -m 0750 "$DATA_DIR"
install -m 0644 "$SERVICE_SRC" /etc/systemd/system/jugest-relay.service
install -d -m 0755 /etc/systemd/system/jugest-relay.service.d
cat > /etc/systemd/system/jugest-relay.service.d/origins.conf <<EOF
[Service]
Environment="JUGEST_ALLOWED_ORIGINS=https://${APP_HOST},https://jugglerest.netlify.app,https://2qt9wrwbj9-web.github.io,https://ana-slo.com,https://www.ana-slo.com"
EOF

cat > /etc/caddy/Caddyfile <<EOF
${APP_HOST} {
  encode zstd gzip
  root * /opt/jugest/public

  @html path / /index.html
  header @html Cache-Control "no-store"
  header X-Content-Type-Options "nosniff"
  header Referrer-Policy "strict-origin-when-cross-origin"

  file_server
}

${RELAY_HOST} {
  encode zstd gzip

  @bridge path /relay-bridge.html
  handle @bridge {
    root * /opt/jugest/public
    header Cache-Control "no-store"
    header X-Content-Type-Options "nosniff"
    header Referrer-Policy "no-referrer"
    header Content-Security-Policy "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors https://ana-slo.com https://www.ana-slo.com https://${APP_HOST} https://jugglerest.netlify.app https://2qt9wrwbj9-web.github.io"
    file_server
  }

  handle {
    reverse_proxy 127.0.0.1:8787
  }
}
EOF

caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now jugest-relay.service
systemctl enable --now caddy.service
systemctl restart jugest-relay.service
systemctl reload caddy.service

for _ in {1..20}; do
  if curl -fsS http://127.0.0.1:8787/healthz >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:8787/healthz

echo
printf 'Waiting for HTTPS (DNS for both hostnames must already point to this VPS)...\n'
for _ in {1..36}; do
  if curl -fsS "https://${APP_HOST}/" >/dev/null 2>&1 && curl -fsS "https://${RELAY_HOST}/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

curl -fsS "https://${APP_HOST}/" >/dev/null
curl -fsS "https://${APP_HOST}/ana-launcher.js" >/dev/null
curl -fsS "https://${RELAY_HOST}/healthz"
curl -fsS "https://${RELAY_HOST}/relay-bridge.html" | grep -q "juggler-relay-bridge-ready"

echo
echo "Full jugest VPS ready"
echo "App:   https://${APP_HOST}"
echo "Relay: https://${RELAY_HOST}"
echo "Production wiring has NOT been changed by this script. Keep Netlify live until the final cutover test passes."
