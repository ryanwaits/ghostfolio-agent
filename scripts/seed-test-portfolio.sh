#!/usr/bin/env bash
#
# Seeds a test user + portfolio for golden evals.
# Usage: ./scripts/seed-test-portfolio.sh
#
# Env vars:
#   API_BASE     — server URL (default: http://localhost:3333)
#   DATA_SOURCE  — data provider (default: FINANCIAL_MODELING_PREP)
#
# Outputs:
#   TEST_USER_ACCESS_TOKEN — the raw access token for the created user
#
# The script creates a new anonymous user via POST /api/v1/user,
# then imports 6 stock BUY activities via the configured data source
# and 1 ETF (VOO) via MANUAL (FMP free tier doesn't support ETF imports).

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3333}"
DATA_SOURCE="${DATA_SOURCE:-FINANCIAL_MODELING_PREP}"

echo "==> Creating test user at ${API_BASE}"
SIGNUP_RESPONSE=$(curl -sf -X POST "${API_BASE}/api/v1/user" \
  -H "Content-Type: application/json")

ACCESS_TOKEN=$(echo "$SIGNUP_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
AUTH_TOKEN=$(echo "$SIGNUP_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['authToken'])")

echo "==> Test user created"
echo "    ACCESS_TOKEN=${ACCESS_TOKEN}"

echo "==> Importing stock activities (${DATA_SOURCE})"
STOCK_BODY=$(cat <<ENDJSON
{
  "activities": [
    {"currency":"USD","dataSource":"${DATA_SOURCE}","date":"2024-01-15T00:00:00.000Z","fee":0,"quantity":10,"symbol":"AAPL","type":"BUY","unitPrice":185},
    {"currency":"USD","dataSource":"${DATA_SOURCE}","date":"2024-01-15T00:00:00.000Z","fee":0,"quantity":5,"symbol":"MSFT","type":"BUY","unitPrice":390},
    {"currency":"USD","dataSource":"${DATA_SOURCE}","date":"2024-01-15T00:00:00.000Z","fee":0,"quantity":8,"symbol":"GOOGL","type":"BUY","unitPrice":141},
    {"currency":"USD","dataSource":"${DATA_SOURCE}","date":"2024-01-15T00:00:00.000Z","fee":0,"quantity":3,"symbol":"NVDA","type":"BUY","unitPrice":547},
    {"currency":"USD","dataSource":"${DATA_SOURCE}","date":"2024-01-15T00:00:00.000Z","fee":0,"quantity":7,"symbol":"AMZN","type":"BUY","unitPrice":155},
    {"currency":"USD","dataSource":"${DATA_SOURCE}","date":"2024-01-15T00:00:00.000Z","fee":0,"quantity":4,"symbol":"TSLA","type":"BUY","unitPrice":218}
  ]
}
ENDJSON
)

curl -sf -X POST "${API_BASE}/api/v1/import" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d "${STOCK_BODY}" > /dev/null

echo "==> 6 stocks imported"

echo "==> Creating VOO asset profile (MANUAL)"
curl -sf -X POST "${API_BASE}/api/v1/admin/profile-data/MANUAL/VOO" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" > /dev/null 2>&1 || true

curl -sf -X PATCH "${API_BASE}/api/v1/admin/profile-data/MANUAL/VOO" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Vanguard S&P 500 ETF","assetClass":"EQUITY","assetSubClass":"ETF","currency":"USD"}' > /dev/null 2>&1 || true

curl -sf -X POST "${API_BASE}/api/v1/market-data/MANUAL/VOO" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"marketData":[{"date":"2024-01-15T00:00:00.000Z","marketPrice":437}]}' > /dev/null 2>&1 || true

echo "==> Importing VOO activity (MANUAL)"
curl -sf -X POST "${API_BASE}/api/v1/import" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d '{"activities":[{"currency":"USD","dataSource":"MANUAL","date":"2024-01-15T00:00:00.000Z","fee":0,"quantity":15,"symbol":"VOO","type":"BUY","unitPrice":437}]}' > /dev/null

echo "==> Triggering data gathering"
curl -sf -X POST "${API_BASE}/api/v1/admin/gather" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" > /dev/null 2>&1 || true

echo "==> Portfolio seeded successfully (7 positions)"
echo ""
echo "# Add to .env or GitHub secrets:"
echo "TEST_USER_ACCESS_TOKEN=${ACCESS_TOKEN}"
