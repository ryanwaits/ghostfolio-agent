#!/usr/bin/env bash
#
# Seeds a test user + portfolio for golden evals.
# Usage: ./scripts/seed-test-portfolio.sh
#
# Env vars:
#   API_BASE  — server URL (default: http://localhost:3333)
#
# Outputs:
#   TEST_USER_ACCESS_TOKEN — the raw access token for the created user
#
# The script creates a new anonymous user via POST /api/v1/user,
# then imports 7 BUY activities via POST /api/v1/import.

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3333}"

echo "==> Creating test user at ${API_BASE}"
SIGNUP_RESPONSE=$(curl -sf -X POST "${API_BASE}/api/v1/user" \
  -H "Content-Type: application/json")

ACCESS_TOKEN=$(echo "$SIGNUP_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
AUTH_TOKEN=$(echo "$SIGNUP_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['authToken'])")

echo "==> Test user created"
echo "    ACCESS_TOKEN=${ACCESS_TOKEN}"

echo "==> Importing portfolio activities"
IMPORT_BODY=$(cat <<'ENDJSON'
{
  "activities": [
    {
      "currency": "USD",
      "dataSource": "YAHOO",
      "date": "2024-01-15T00:00:00.000Z",
      "fee": 0,
      "quantity": 10,
      "symbol": "AAPL",
      "type": "BUY",
      "unitPrice": 185.00
    },
    {
      "currency": "USD",
      "dataSource": "YAHOO",
      "date": "2024-01-15T00:00:00.000Z",
      "fee": 0,
      "quantity": 5,
      "symbol": "MSFT",
      "type": "BUY",
      "unitPrice": 390.00
    },
    {
      "currency": "USD",
      "dataSource": "YAHOO",
      "date": "2024-01-15T00:00:00.000Z",
      "fee": 0,
      "quantity": 8,
      "symbol": "GOOGL",
      "type": "BUY",
      "unitPrice": 141.00
    },
    {
      "currency": "USD",
      "dataSource": "YAHOO",
      "date": "2024-01-15T00:00:00.000Z",
      "fee": 0,
      "quantity": 15,
      "symbol": "VOO",
      "type": "BUY",
      "unitPrice": 437.00
    },
    {
      "currency": "USD",
      "dataSource": "YAHOO",
      "date": "2024-01-15T00:00:00.000Z",
      "fee": 0,
      "quantity": 3,
      "symbol": "NVDA",
      "type": "BUY",
      "unitPrice": 547.00
    },
    {
      "currency": "USD",
      "dataSource": "YAHOO",
      "date": "2024-01-15T00:00:00.000Z",
      "fee": 0,
      "quantity": 7,
      "symbol": "AMZN",
      "type": "BUY",
      "unitPrice": 155.00
    },
    {
      "currency": "USD",
      "dataSource": "YAHOO",
      "date": "2024-01-15T00:00:00.000Z",
      "fee": 0,
      "quantity": 4,
      "symbol": "TSLA",
      "type": "BUY",
      "unitPrice": 218.00
    }
  ]
}
ENDJSON
)

IMPORT_RESPONSE=$(curl -sf -X POST "${API_BASE}/api/v1/import" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d "${IMPORT_BODY}")

echo "==> Portfolio imported successfully"
echo ""
echo "# Add to .env or GitHub secrets:"
echo "TEST_USER_ACCESS_TOKEN=${ACCESS_TOKEN}"
