#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root: sudo bash bootstrap-ubuntu.sh relay.example.com" >&2
  exit 1
fi

HOSTNAME_ARG=${1:-}
if [[ -z "$HOSTNAME_ARG" ]]; then
  echo "Usage: sudo bash bootstrap-ubuntu.sh relay.example.com" >&2
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

bash /opt/jugest/vps/configure-host.sh "$HOSTNAME_ARG"
