#!/usr/bin/env bash
set -euo pipefail

API_KEY="${1:-}"
if [[ -z "$API_KEY" ]]; then
  if [[ -f "$(dirname "$0")/../docker/.env" ]]; then
    API_KEY=$(grep -oP 'OPENROUTER_API_KEY=\K.*' "$(dirname "$0")/../docker/.env" || true)
  fi
fi

if [[ -z "$API_KEY" ]]; then
  echo "Usage: $0 <openrouter-api-key>"
  echo "       or set OPENROUTER_API_KEY in docker/.env"
  exit 1
fi

echo "Testing OpenRouter API key: ${API_KEY:0:12}..."
echo

echo "=== GET /v1/models ==="
HTTP_CODE=$(curl -s -o /tmp/or_test_models.json -w "%{http_code}" \
  "https://openrouter.ai/api/v1/models" \
  -H "Authorization: Bearer $API_KEY")
echo "HTTP $HTTP_CODE"
if [[ "$HTTP_CODE" == "200" ]]; then
  jq -r '.data[:20][] | "  - \(.id)"' /tmp/or_test_models.json
else
  cat /tmp/or_test_models.json
fi
echo

echo "=== POST /v1/chat/completions (meta-llama/llama-3.1-8b-instruct) ==="
HTTP_CODE=$(curl -s -o /tmp/or_test_chat.json -w "%{http_code}" \
  -X POST "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"meta-llama/llama-3.1-8b-instruct","messages":[{"role":"user","content":"Say hello in one word"}],"max_tokens":10}')
echo "HTTP $HTTP_CODE"
if [[ "$HTTP_CODE" == "200" ]]; then
  jq -r '.choices[0].message.content' /tmp/or_test_chat.json
else
  cat /tmp/or_test_chat.json
fi

rm -f /tmp/or_test_models.json /tmp/or_test_chat.json
