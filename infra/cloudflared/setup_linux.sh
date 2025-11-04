#!/usr/bin/env bash
set -euo pipefail

# Cloudflare Tunnel setup helper for Ubuntu/Linux
# - Installs cloudflared via Cloudflare repo if missing
# - Creates/updates credentials for the known tunnel
# - Writes ~/.cloudflared/config.yml pointing to http://127.0.0.1:8000
#
# Usage:
#   bash infra/cloudflared/setup_linux.sh
#
# Notes:
# - You will be prompted to run `cloudflared tunnel login` once to create cert.pem.
# - Backend must be published on port 8000 on the host (compose exposes 8000:8000).

TUNNEL_NAME="kid-to-story"
TUNNEL_ID="620de6cc-b84e-4580-bb4a-8bf448ce7ef0"
DOMAIN="kid-to-story.win"
TARGET_HOST="127.0.0.1"
TARGET_PORT="8000"

CF_DIR="${HOME}/.cloudflared"
CF_CERT="${CF_DIR}/cert.pem"
CF_CRED_JSON="${CF_DIR}/${TUNNEL_ID}.json"
CF_CONFIG="${CF_DIR}/config.yml"

echo "[1/5] Checking cloudflared installation"
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found; installing from Cloudflare apt repo..."
  sudo mkdir -p /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare.gpg] https://pkg.cloudflare.com/ $(lsb_release -cs) main" | \
    sudo tee /etc/apt/sources.list.d/cloudflared.list
  sudo apt update
  sudo apt install -y cloudflared
else
  echo "cloudflared present: $(cloudflared --version | head -n1)"
fi

echo "[2/5] Ensuring Cloudflare login exists (${CF_CERT})"
mkdir -p "${CF_DIR}"
if [ ! -f "${CF_CERT}" ]; then
  echo "- No cert.pem found. Running 'cloudflared tunnel login'..."
  echo "  This will open a browser or print a URL to authorize."
  cloudflared tunnel login
else
  echo "- Found: ${CF_CERT}"
fi

echo "[3/5] Creating credentials for tunnel ${TUNNEL_NAME} (${TUNNEL_ID})"
cloudflared tunnel token --cred-file "${CF_CRED_JSON}" "${TUNNEL_NAME}"
echo "- Credentials written to ${CF_CRED_JSON}"

echo "[4/5] Writing ${CF_CONFIG} (service -> http://${TARGET_HOST}:${TARGET_PORT})"
cat > "${CF_CONFIG}" <<YAML
tunnel: ${TUNNEL_ID}
credentials-file: ${CF_CRED_JSON}

ingress:
  - hostname: ${DOMAIN}
    service: http://${TARGET_HOST}:${TARGET_PORT}
  - service: http_status:404
YAML
echo "- Wrote config to ${CF_CONFIG}"

echo "[5/5] Next steps"
echo "- Quick test (foreground): cloudflared tunnel run ${TUNNEL_NAME}"
echo "- Install as a service:"
echo "    sudo mkdir -p /etc/cloudflared"
echo "    sudo cp ${CF_CONFIG} /etc/cloudflared/"
echo "    sudo cp ${CF_CRED_JSON} /etc/cloudflared/"
echo "    sudo chmod 600 /etc/cloudflared/*.json"
echo "    sudo cloudflared service install && sudo systemctl enable --now cloudflared"
echo "- Verify: cloudflared tunnel info ${TUNNEL_NAME} && curl -I https://${DOMAIN}/health"
echo "Done."

