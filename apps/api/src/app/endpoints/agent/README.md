# Agent Module

AI-powered portfolio assistant built as a NestJS module inside the Ghostfolio fork. Sonnet 4.6 with 5 tools, SSE streaming, structured observability, 2-tier eval suite, and CI-gated golden tests.

**Live**: https://ghostfolio-4eid.onrender.com/api/v1/agent/ui

---

## Architecture

- **Model**: Sonnet 4.6 via Vercel AI SDK v6 (`ai@6.0.97`, `@ai-sdk/anthropic@3.0.46`)
- **Schemas**: Zod v4 (`zod@4.3.6`) -- required by AI SDK v6 `inputSchema`
- **Max steps**: 5 per chat (multi-tool chaining via `stopWhen: stepCountIs(5)`)
- **Auth**: Ghostfolio JWT + `readAiPrompt` permission guard
- **Stream**: SSE UI message stream (`text-delta`, `tool-input-start` events)

## Tools

| Tool | Description |
|------|-------------|
| `portfolio_analysis` | Holdings, allocations, total value, account breakdown |
| `portfolio_performance` | Returns, net performance, chart data over a date range |
| `holdings_lookup` | Deep dive on a single position (dividends, fees, sectors, countries) |
| `market_data` | Live quotes for 1-10 symbols. Default provider: FMP (Financial Modeling Prep). Also supports CoinGecko, Yahoo, etc. via `dataProviderService.getQuotes()` |
| `transaction_history` | Buy/sell/dividend/fee activity log, filterable + sortable |

All tools wrapped in try/catch -- errors returned to LLM as `{ error: ... }` so it can recover gracefully.

## Observability

| Layer | Detail |
|-------|--------|
| Structured logs | `chat_start`, `step_finish`, `chat_complete`, `chat_error` -- JSON with requestId, userId, latency, tools, tokens |
| In-memory metrics | Ring buffer (last 1000 chats) via `AgentMetricsService`, served at `GET /api/v1/agent/metrics?since=1h` |
| Postgres persistence | `AgentChatLog` table -- survives deploys, queryable via Prisma |
| Error handling | `onError` callback in `streamText()` records error metrics; controller wrapped in try/catch returns clean 500 |
| Security | Error messages sanitized -- DB URLs, Redis URLs, API keys redacted before storage/exposure |

## Eval Suite (2-tier)

| Tier | Cases | Scorers | Threshold | Purpose |
|------|-------|---------|-----------|---------|
| Golden Set | 18 | `GoldenCheck` (deterministic, binary pass/fail, seed-data agnostic) | 100% required | CI gate -- runs every push to main |
| Scenarios | 30 | `ToolCallAccuracy` + `HasResponse` + `ResponseQuality` (Haiku 4.5 judge) | 80%+ acceptable | Manual regression check |

**Golden Set breakdown**: tool routing (7), structural output (4), no-tool behavioral (4), guardrails (3).

**Scenarios breakdown**: single-tool (10), multi-tool (8), ambiguous (6), edge (6).

```bash
# Run golden set
COLUMNS=200 npx evalite run evals/golden/agent-golden.eval.ts

# Run scenarios
COLUMNS=200 npx evalite run evals/scenarios/agent-scenarios.eval.ts
```

## CI Pipeline

`.github/workflows/golden-evals.yml` -- triggers on push to `main` (agent/eval file changes) or manual dispatch. Hits the deployed Render instance, fails if golden set drops below 100%.

**Required secrets**: `RENDER_URL`, `TEST_USER_ACCESS_TOKEN`

## Deployment

| Resource | Config |
|----------|--------|
| Platform | Render (Docker) via `render.yaml` blueprint |
| URL | https://ghostfolio-4eid.onrender.com |
| Web | Standard plan, 2GB RAM |
| Redis | Starter, volatile-lru eviction |
| Postgres | Basic 1GB |
| Data provider | FMP (paid tier, `batch-quote-short` endpoint) |
| Entrypoint | `prisma migrate deploy` -> `prisma db seed` -> `node main` |

**Env vars**: `ANTHROPIC_API_KEY`, `API_KEY_FINANCIAL_MODELING_PREP`, `DATA_SOURCES`, `DATA_SOURCE_EXCHANGE_RATES`, `DATA_SOURCE_IMPORT`, `NODE_ENV`

**Endpoints**:
- Chat UI: `/api/v1/agent/ui`
- Metrics: `/api/v1/agent/metrics`

## Test User

Seed script: `scripts/seed-test-portfolio.sh`

Creates an anonymous user, imports 6 stocks via FMP + 1 ETF (VOO) via MANUAL, then triggers data gathering.

| Symbol | Shares |
|--------|--------|
| AAPL | 10 |
| MSFT | 5 |
| GOOGL | 8 |
| VOO | 15 |
| NVDA | 3 |
| AMZN | 7 |
| TSLA | 4 |

## Key Files

| Path | Purpose |
|------|---------|
| `apps/api/src/app/endpoints/agent/` | Agent module (controller, service, metrics) |
| `apps/api/src/app/endpoints/agent/tools/` | Tool definitions |
| `apps/api/src/app/endpoints/agent/agent-metrics.service.ts` | In-memory metrics + Postgres logging |
| `apps/api/src/assets/chat.html` | Chat UI |
| `evals/golden/` | Golden eval set (18 cases) |
| `evals/scenarios/` | Scenario eval set (30 cases) |
| `evals/scorers/` | Custom scorers (GoldenCheck, deterministic) |
| `evals/helpers.ts` | Eval utilities |
| `.github/workflows/golden-evals.yml` | CI workflow |
| `scripts/seed-test-portfolio.sh` | Test user + portfolio seed |
| `render.yaml` | Render blueprint |
| `prisma/schema.prisma` | AgentChatLog model |
| `prisma/migrations/20260224210123_added_agent_chat_log/` | Chat log migration |

## Quickstart

### Local Dev

```bash
# 1. Start infra
docker compose -f docker/docker-compose.dev.yml up -d

# 2. Start server
npx nx serve api

# 3. Get JWT
curl http://localhost:3333/api/v1/auth/anonymous/$TEST_USER_ACCESS_TOKEN
# -> { "authToken": "eyJ..." }

# 4. Chat UI
open http://localhost:3333/api/v1/agent/ui

# 5. Run golden evals
COLUMNS=200 npx evalite run evals/golden/agent-golden.eval.ts

# 6. Check metrics
curl -H "Authorization: Bearer <jwt>" http://localhost:3333/api/v1/agent/metrics?since=1h
```

### Against Render

```bash
API_BASE=https://ghostfolio-4eid.onrender.com \
  TEST_USER_ACCESS_TOKEN=<token> \
  npx evalite run evals/golden/agent-golden.eval.ts
```

---

## Validation Report

Metrics snapshot (production, 1h window):
- 43 chats tracked
- Avg latency: 6.5s, avg 1.7 steps, avg 2.5K tokens
- Tool usage: portfolio_analysis(9), market_data(9), transaction_history(7), portfolio_performance(5), holdings_lookup(3)
- Per-chat detail: requestId, userId, latency, steps, tools, tokens

### MVP Checklist

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Agent responds to natural language | PASS | All 5 tools return coherent natural language responses |
| 2 | 3+ functional tools | PASS | 5 tools: portfolio_analysis, portfolio_performance, holdings_lookup, market_data, transaction_history |
| 3 | Tool calls execute + structured results | PASS | Tools return tables, dollar amounts, percentages |
| 4 | Agent synthesizes tool results | PASS | Combines tool data into markdown tables, summaries, key takeaways |
| 5 | Conversation history across turns | PASS | "What is its current price?" correctly resolved to VOO from prior turn |
| 6 | Basic error handling | PASS | 401 on bad auth, tool errors caught, clean 500s |
| 7 | Domain-specific verification | PASS | Rejects trades ("read-only"), rejects advice, rejects role-play |
| 8 | 5+ eval test cases | PASS | 18 golden (100%) + 30 scenarios |
| 9 | Deployed + publicly accessible | PASS | https://ghostfolio-4eid.onrender.com, health OK |
