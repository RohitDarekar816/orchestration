#!/usr/bin/env bash
set -e

# Write SSH private key to a secure temp file before the agent starts.
# The key is injected as OZ_SSH_KEY by the Oz API when server_id is provided.
if [ -n "$OZ_SSH_KEY" ]; then
    printf '%s' "$OZ_SSH_KEY" > /tmp/oz_ssh_key
    chmod 600 /tmp/oz_ssh_key
    export SSH_KEY_FILE=/tmp/oz_ssh_key
fi

# Minimal git identity so the agent can commit if needed.
git config --global user.email "oz-agent@local" 2>/dev/null || true
git config --global user.name "Oz Agent" 2>/dev/null || true

# Disable strict host key checking globally so SSH doesn't block on unknown hosts.
mkdir -p /root/.ssh
cat >> /root/.ssh/config <<'SSH_EOF'
Host *
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    LogLevel ERROR
SSH_EOF
chmod 600 /root/.ssh/config

exec "$@"
