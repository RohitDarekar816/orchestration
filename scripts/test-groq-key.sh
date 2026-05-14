#!/usr/bin/env bash
set -euo pipefail

API_KEY="${1:-}"
if [[ -z "$API_KEY" ]]; then
  if [[ -f "$(dirname "$0")/../docker/.env" ]]; then
    API_KEY=$(grep -oP 'GROQ_API_KEY=\K.*' "$(dirname "$0")/../docker/.env" || true)
  fi
fi

if [[ -z "$API_KEY" ]]; then
  echo "Usage: $0 <groq-api-key>"
  echo "       or set GROQ_API_KEY in docker/.env"
  exit 1
fi

echo "Testing Groq API key: ${API_KEY:0:7}..."
echo

echo "=== GET /v1/models ==="
HTTP_CODE=$(curl -s -o /tmp/groq_test_models.json -w "%{http_code}" \
  "https://api.groq.com/openai/v1/models" \
  -H "Authorization: Bearer $API_KEY")
echo "HTTP $HTTP_CODE"
if [[ "$HTTP_CODE" == "200" ]]; then
  jq -r '.data[] | "  - \(.id)"' /tmp/groq_test_models.json
else
  cat /tmp/groq_test_models.json
fi
echo

echo "=== POST /v1/chat/completions (llama3-8b-8192) ==="
HTTP_CODE=$(curl -s -o /tmp/groq_test_chat.json -w "%{http_code}" \
  -X POST "https://api.groq.com/openai/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3-8b-8192","messages":[{"role":"user","content":"Say hello in one word"}],"max_tokens":10}')
echo "HTTP $HTTP_CODE"
if [[ "$HTTP_CODE" == "200" ]]; then
  jq -r '.choices[0].message.content' /tmp/groq_test_chat.json
else
  cat /tmp/groq_test_chat.json
fi

rm -f /tmp/groq_test_models.json /tmp/groq_test_chat.json
