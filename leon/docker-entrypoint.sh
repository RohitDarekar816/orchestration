#!/bin/bash
# Inject Oz credentials from env vars into the oz_skill settings file on every startup.
# This ensures fresh volumes and image-baked defaults are always overridden by
# the values configured in docker-compose, without requiring manual UI setup.

OZ_SETTINGS_FILE="/root/.leon/profiles/just-me/skills/native/oz_skill/settings.json"

if [ -n "${OZ_API_URL}${OZ_EMAIL}${OZ_PASSWORD}${OZ_AUTH_TOKEN}${OZ_DEFAULT_AGENT_TYPE}${OZ_PUBLIC_URL}" ]; then
  mkdir -p "$(dirname "${OZ_SETTINGS_FILE}")"
  python3 - <<PYEOF
import json, os

path = "${OZ_SETTINGS_FILE}"
try:
    with open(path) as f:
        cfg = json.load(f)
except Exception:
    cfg = {}

updates = {
    "oz_api_url":            os.environ.get("OZ_API_URL", cfg.get("oz_api_url", "http://api:8000/api")),
    "oz_auth_token":         os.environ.get("OZ_AUTH_TOKEN", cfg.get("oz_auth_token", "")),
    "oz_email":              os.environ.get("OZ_EMAIL", cfg.get("oz_email", "")),
    "oz_password":           os.environ.get("OZ_PASSWORD", cfg.get("oz_password", "")),
    "oz_public_url":         os.environ.get("OZ_PUBLIC_URL", cfg.get("oz_public_url", "http://localhost:8090")),
    "default_agent_type":    os.environ.get("OZ_DEFAULT_AGENT_TYPE", cfg.get("default_agent_type", "oz-local")),
    "default_max_runtime":   int(os.environ.get("OZ_DEFAULT_MAX_RUNTIME", cfg.get("default_max_runtime", 300))),
}
cfg.update(updates)
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
print(f"[entrypoint] oz_skill settings updated at {path}")
PYEOF
fi

exec "$@"
