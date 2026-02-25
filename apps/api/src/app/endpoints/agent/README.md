# Agent Module

AI-powered portfolio assistant built as a NestJS module inside the Ghostfolio fork. Sonnet 4.6 with 6 tools, SSE streaming, structured observability, 2-tier eval suite, and CI-gated golden tests.

**Live**: https://ghostfolio-4eid.onrender.com/api/v1/agent/ui

---

## Prerequisites

- Node.js 22+
- Docker (for local Postgres + Redis)
- python3 (used by seed script to parse JSON)
- npm

## Architecture

- **Model**: Sonnet 4.6 via Vercel AI SDK v6 (`ai@6.0.97`, `@ai-sdk/anthropic@3.0.46`)
- **Schemas**: Zod v4 (`zod@4.3.6`) -- required by AI SDK v6 `inputSchema`
- **Max steps**: 5 per chat (multi-tool chaining via `stopWhen: stepCountIs(5)`)
- **Auth**: Ghostfolio JWT + `readAiPrompt` permission guard
- **Stream**: SSE UI message stream (`text-delta`, `tool-input-start` events)

## Tools

| Tool                    | Description                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `symbol_search`         | Disambiguate crypto vs stock symbols, find correct CoinGecko slugs or Yahoo tickers. Use before `market_data` for any non-obvious crypto.                 |
| `portfolio_analysis`    | Holdings, allocations, total value, account breakdown                                                                                                     |
| `portfolio_performance` | Returns, net performance, chart data over a date range                                                                                                    |
| `holdings_lookup`       | Deep dive on a single position (dividends, fees, sectors, countries)                                                                                      |
| `market_data`           | Live quotes for 1-10 symbols. Default provider: FMP (Financial Modeling Prep). Also supports CoinGecko, Yahoo, etc. via `dataProviderService.getQuotes()` |
| `transaction_history`   | Buy/sell/dividend/fee activity log, filterable + sortable                                                                                                 |

All tools wrapped in try/catch -- errors returned to LLM as `{ error: ... }` so it can recover gracefully.

## Observability

| Layer                | Detail                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Structured logs      | `chat_start`, `step_finish`, `chat_complete`, `chat_error` -- JSON with requestId, userId, latency, tools, tokens |
| In-memory metrics    | Ring buffer (last 1000 chats) via `AgentMetricsService`, served at `GET /api/v1/agent/metrics?since=1h`           |
| Postgres persistence | `AgentChatLog` table -- survives deploys, queryable via Prisma                                                    |
| Error handling       | `onError` callback in `streamText()` records error metrics; controller wrapped in try/catch returns clean 500     |
| Security             | Error messages sanitized -- DB URLs, Redis URLs, API keys redacted before storage/exposure                        |

## Eval Suite (2-tier)

| Tier       | Cases | Scorers                                                                  | Threshold       | Purpose                            |
| ---------- | ----- | ------------------------------------------------------------------------ | --------------- | ---------------------------------- |
| Golden Set | 18    | `GoldenCheck` (deterministic, binary pass/fail, seed-data agnostic)      | 100% required   | CI gate -- runs every push to main |
| Scenarios  | 30    | `ToolCallAccuracy` + `HasResponse` + `ResponseQuality` (Haiku 4.5 judge) | 80%+ acceptable | Manual regression check            |

**Golden Set breakdown**: tool routing (7), structural output (4), no-tool behavioral (4), guardrails (3).

**Scenarios breakdown**: single-tool (10), multi-tool (8), ambiguous (6), edge (6).

```bash
# Run golden set (requires ANTHROPIC_API_KEY + TEST_USER_ACCESS_TOKEN in env)
npx evalite run evals/golden/agent-golden.eval.ts

# Run scenarios
npx evalite run evals/scenarios/agent-scenarios.eval.ts
```

## CI Pipeline

`.github/workflows/golden-evals.yml` -- triggers on push to `main` (agent/eval file changes) or manual dispatch. Hits the deployed Render instance, fails if golden set drops below 100%.

**Required GitHub secrets**: `RENDER_URL`, `TEST_USER_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`

## Deployment

| Resource      | Config                                                     |
| ------------- | ---------------------------------------------------------- |
| Platform      | Render (Docker) via `render.yaml` blueprint                |
| URL           | https://ghostfolio-4eid.onrender.com                       |
| Web           | Standard plan, 2GB RAM                                     |
| Redis         | Starter, volatile-lru eviction                             |
| Postgres      | Basic 1GB                                                  |
| Data provider | FMP (paid tier, `batch-quote-short` endpoint)              |
| Entrypoint    | `prisma migrate deploy` -> `prisma db seed` -> `node main` |

**Render env vars**:

| Var                               | Required | Notes                                                                                    |
| --------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`               | Yes      | Powers the agent LLM                                                                     |
| `API_KEY_FINANCIAL_MODELING_PREP` | Yes      | Primary data provider for stocks/ETFs                                                    |
| `API_KEY_COINGECKO_DEMO`          | Yes      | Free demo key from [CoinGecko](https://www.coingecko.com/en/api/pricing) -- 30 calls/min |
| `DATA_SOURCES`                    | Yes      | `["FINANCIAL_MODELING_PREP","COINGECKO","MANUAL"]`                                       |
| `DATA_SOURCE_EXCHANGE_RATES`      | Yes      | `FINANCIAL_MODELING_PREP`                                                                |
| `DATA_SOURCE_IMPORT`              | Yes      | `FINANCIAL_MODELING_PREP`                                                                |
| `NODE_ENV`                        | Yes      | `production`                                                                             |

**Endpoints**:

- Chat UI: `/api/v1/agent/ui`
- Metrics: `/api/v1/agent/metrics`

## Test User

The test user is required for evals and manual testing. The seed script creates an anonymous user, imports a portfolio, and outputs an access token.

### Creating the test user

```bash
# 1. Make sure the server is running (local or Render)

# 2. Run the seed script
./scripts/seed-test-portfolio.sh
# For Render:
API_BASE=https://ghostfolio-4eid.onrender.com ./scripts/seed-test-portfolio.sh

# 3. The script outputs:
#    TEST_USER_ACCESS_TOKEN=<some-uuid>
#    Save this value — you need it for auth and evals.
```

### Access token vs auth token

- **Access token** (`TEST_USER_ACCESS_TOKEN`): permanent UUID identifying the user. Stored in env / GitHub secrets. Used to obtain short-lived JWTs.
- **Auth token** (JWT): short-lived bearer token for API calls. Obtained by exchanging the access token:

```bash
curl http://localhost:3333/api/v1/auth/anonymous/$TEST_USER_ACCESS_TOKEN
# -> { "authToken": "eyJ..." }
```

### Seeded portfolio

| Symbol | Shares | Data Source |
| ------ | ------ | ----------- |
| AAPL   | 10     | FMP         |
| MSFT   | 5      | FMP         |
| GOOGL  | 8      | FMP         |
| VOO    | 15     | MANUAL      |
| NVDA   | 3      | FMP         |
| AMZN   | 7      | FMP         |
| TSLA   | 4      | FMP         |

## Key Files

| Path                                                        | Purpose                                     |
| ----------------------------------------------------------- | ------------------------------------------- |
| `apps/api/src/app/endpoints/agent/`                         | Agent module (controller, service, metrics) |
| `apps/api/src/app/endpoints/agent/tools/`                   | Tool definitions (6 tools)                  |
| `apps/api/src/app/endpoints/agent/agent-metrics.service.ts` | In-memory metrics + Postgres logging        |
| `apps/api/src/services/data-provider/coingecko/`            | CoinGecko API client                        |
| `apps/api/src/assets/chat.html`                             | Chat UI                                     |
| `evals/golden/`                                             | Golden eval set (18 cases)                  |
| `evals/scenarios/`                                          | Scenario eval set (30 cases)                |
| `evals/scorers/`                                            | Custom scorers (GoldenCheck, deterministic) |
| `evals/helpers.ts`                                          | Eval utilities                              |
| `.github/workflows/golden-evals.yml`                        | CI workflow                                 |
| `scripts/seed-test-portfolio.sh`                            | Test user + portfolio seed                  |
| `render.yaml`                                               | Render blueprint                            |
| `prisma/schema.prisma`                                      | AgentChatLog model                          |
| `prisma/migrations/20260224210123_added_agent_chat_log/`    | Chat log migration                          |

## Quickstart

### Local Dev

```bash
# 1. Copy env and fill in values
cp .env.example .env

# 2. Start infra
docker compose -f docker/docker-compose.dev.yml up -d

# 3. Install deps + run migrations
npm install
npx prisma migrate deploy
npx prisma db seed

# 4. Start server
npx nx serve api

# 5. Seed test user (server must be running)
./scripts/seed-test-portfolio.sh
# Save the TEST_USER_ACCESS_TOKEN from the output

# 6. Get JWT (for manual API calls)
curl http://localhost:3333/api/v1/auth/anonymous/$TEST_USER_ACCESS_TOKEN
# -> { "authToken": "eyJ..." }

# 7. Chat UI
open http://localhost:3333/api/v1/agent/ui

# 8. Run golden evals (requires ANTHROPIC_API_KEY + TEST_USER_ACCESS_TOKEN in env)
TEST_USER_ACCESS_TOKEN=<token> \
  npx evalite run evals/golden/agent-golden.eval.ts

# 9. Eval dashboard (http://localhost:3006)
TEST_USER_ACCESS_TOKEN=<token> \
  npx evalite serve evals/golden/agent-golden.eval.ts

# 10. Check metrics
curl -H "Authorization: Bearer <jwt>" http://localhost:3333/api/v1/agent/metrics?since=1h
```

### Against Render

```bash
# Seed test user on Render (only needed once)
API_BASE=https://ghostfolio-4eid.onrender.com ./scripts/seed-test-portfolio.sh

# Run golden evals
API_BASE=https://ghostfolio-4eid.onrender.com \
  TEST_USER_ACCESS_TOKEN=<token> \
  npx evalite run evals/golden/agent-golden.eval.ts

# Eval dashboard (http://localhost:3006)
API_BASE=https://ghostfolio-4eid.onrender.com \
  TEST_USER_ACCESS_TOKEN=<token> \
  npx evalite serve evals/golden/agent-golden.eval.ts
```

> **Note**: Without `API_BASE`, evals default to `http://localhost:3333`. Make sure either the local server is running or `API_BASE` points to Render.

---

## Validation Report

Metrics snapshot (production, 1h window):

- 43 chats tracked
- Avg latency: 6.5s, avg 1.7 steps, avg 2.5K tokens
- Tool usage: portfolio_analysis(9), market_data(9), transaction_history(7), portfolio_performance(5), holdings_lookup(3)
- Per-chat detail: requestId, userId, latency, steps, tools, tokens

### MVP Checklist

| #   | Requirement                             | Status | Evidence                                                                                                             |
| --- | --------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Agent responds to natural language      | PASS   | All 6 tools return coherent natural language responses                                                               |
| 2   | 3+ functional tools                     | PASS   | 6 tools: symbol_search, portfolio_analysis, portfolio_performance, holdings_lookup, market_data, transaction_history |
| 3   | Tool calls execute + structured results | PASS   | Tools return tables, dollar amounts, percentages                                                                     |
| 4   | Agent synthesizes tool results          | PASS   | Combines tool data into markdown tables, summaries, key takeaways                                                    |
| 5   | Conversation history across turns       | PASS   | "What is its current price?" correctly resolved to VOO from prior turn                                               |
| 6   | Basic error handling                    | PASS   | 401 on bad auth, tool errors caught, clean 500s                                                                      |
| 7   | Domain-specific verification            | PASS   | Rejects trades ("read-only"), rejects advice, rejects role-play                                                      |
| 8   | 5+ eval test cases                      | PASS   | 18 golden (100%) + 30 scenarios                                                                                      |
| 9   | Deployed + publicly accessible          | PASS   | https://ghostfolio-4eid.onrender.com, health OK                                                                      |
