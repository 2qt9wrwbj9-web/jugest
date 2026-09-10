#!/usr/bin/env bash
set -euo pipefail

if [[ "${JUGEST_INSTALL_TEST_MODE:-0}" != "1" && "${EUID}" -ne 0 ]]; then
  echo "install-auto-deploy.sh must run as root" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"
ROOT="${JUGEST_ROOT:-/opt/jugest}"
CURRENT="${ROOT}/current"
RELEASES="${ROOT}/releases"
DEPLOYER="${ROOT}/deployer"
STATE_DIR="${JUGEST_STATE_DIR:-/var/lib/jugest-deploy}"
SYSTEMD_DIR="${JUGEST_SYSTEMD_DIR:-/etc/systemd/system}"
SYSTEMCTL="${JUGEST_SYSTEMCTL:-systemctl}"

mkdir -p "${RELEASES}" "${DEPLOYER}/src" "${DEPLOYER}/scripts" "${STATE_DIR}" "${SYSTEMD_DIR}"

# Install the deploy control plane outside /opt/jugest/current so it stays usable
# while the application release symlink is being switched.
install -m 0644 "${SOURCE_ROOT}/vps/src/deploy-core.mjs" "${DEPLOYER}/src/deploy-core.mjs"
install -m 0644 "${SOURCE_ROOT}/vps/src/deploy-runner.mjs" "${DEPLOYER}/src/deploy-runner.mjs"
install -m 0755 "${SOURCE_ROOT}/vps/scripts/deploy-vps.mjs" "${DEPLOYER}/scripts/deploy-vps.mjs"
install -m 0755 "${SOURCE_ROOT}/vps/scripts/deploy-status.mjs" "${DEPLOYER}/scripts/deploy-status.mjs"
install -m 0644 "${SOURCE_ROOT}/vps/systemd/jugest-deploy.service" "${SYSTEMD_DIR}/jugest-deploy.service"
install -m 0644 "${SOURCE_ROOT}/vps/systemd/jugest-deploy.timer" "${SYSTEMD_DIR}/jugest-deploy.timer"

current_sha=""
if [[ -L "${CURRENT}" ]]; then
  current_target="$(readlink -f "${CURRENT}")"
  if [[ ! -d "${current_target}" ]]; then
    echo "current symlink target does not exist: ${current_target}" >&2
    exit 1
  fi
  current_sha="$(git -C "${CURRENT}" rev-parse HEAD)"
elif [[ -d "${CURRENT}" ]]; then
  current_sha="$(git -C "${CURRENT}" rev-parse HEAD)"
  if [[ ! "${current_sha}" =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "could not resolve current Git SHA" >&2
    exit 1
  fi

  echo "Verifying existing JUGEST before release migration..."
  (
    cd "${CURRENT}/vps"
    npm test
  )

  target="${RELEASES}/${current_sha}"
  if [[ -e "${target}" ]]; then
    echo "release target already exists: ${target}" >&2
    exit 1
  fi

  tmp_link="${ROOT}/.current-install-$${RANDOM}"
  rm -f "${tmp_link}"
  mv "${CURRENT}" "${target}"
  ln -s "${target}" "${tmp_link}"
  mv -Tf "${tmp_link}" "${CURRENT}"
else
  echo "existing JUGEST current path is missing: ${CURRENT}" >&2
  exit 1
fi

if [[ ! "${current_sha}" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "could not resolve current Git SHA after migration" >&2
  exit 1
fi

if [[ ! -f "${STATE_DIR}/state.json" ]]; then
  cat > "${STATE_DIR}/state.json" <<EOF
{
  "lastSuccessfulSha": "${current_sha}",
  "previousSuccessfulSha": null,
  "lastAttemptSha": null,
  "lastResult": "success",
  "lastError": null,
  "updatedAt": null
}
EOF
  chmod 600 "${STATE_DIR}/state.json"
fi

"${SYSTEMCTL}" daemon-reload

echo "JUGEST auto-deploy files installed."
echo "Current release: ${current_sha}"
echo "The timer remains disabled until explicit approval."
echo "After approval, enable it with: systemctl enable --now jugest-deploy.timer"
