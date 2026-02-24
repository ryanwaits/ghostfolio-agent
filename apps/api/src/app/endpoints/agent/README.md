## What We've Built

### Core Agent (5 tools, 1 LLM)

| Tool | What it does |
|------|-------------|
| `portfolio_analysis` | Holdings, allocations, total value, account breakdown |
| `portfolio_performance` | Returns, net performance, chart data over a date range |
| `holdings_lookup` | Deep dive on a single position (dividends, fees, sectors, countries) |
| `market_data` | Live quotes for 1-10 symbols via Yahoo/CoinGecko |
| `transaction_history` | Buy/sell/dividend/fee activity log, filterable + sortable |

- **Model**: Sonnet 4.6 via Vercel AI SDK v6
- **Max steps**: 5 per chat (multi-tool chaining)
- **Auth**: Ghostfolio JWT + `readAiPrompt` permission guard
- **Stream**: SSE UI message stream (`text-delta`, `tool-input-start` events)

### Observability

| Layer | What it captures |
|-------|-----------------|
| Structured logs | `chat_start`, `step_finish`, `chat_complete`, `chat_error` — JSON with requestId, userId, latency, tools, tokens |
| In-memory metrics | Ring buffer (last 1000), served via `GET /agent/metrics?since=1h` |
| Postgres persistence | `AgentChatLog` table — survives deploys, queryable |
| Error handling | All 5 tools catch + return `{ error }` to LLM; `onError` callback records error metrics; controller returns clean 500 |
| Security | Error messages sanitized — DB URLs, Redis URLs, API keys redacted before storage/exposure |

### Eval Suite (2-tier)

| Tier | Cases | Scorers | Threshold | Purpose |
|------|-------|---------|-----------|---------|
| Golden Set | 17 | `GoldenCheck` (deterministic, binary) | 100% | CI gate — runs every push |
| Scenarios | 30 | `ToolCallAccuracy` + `HasResponse` + `ResponseQuality` (LLM-judged) | 80%+ | Manual regression check |

### CI Pipeline

`.github/workflows/golden-evals.yml` — triggers on push to `main` (agent/eval file changes) or manual dispatch. Hits the deployed Render instance, fails if golden set drops below 100%.

---

### Quickstart (Local Dev)

```bash
# 1. Start infra
docker compose -f docker/docker-compose.dev.yml up -d

# 2. Start server
npx nx serve api

# 3. Get JWT
curl http://localhost:3333/api/v1/auth/anonymous/$TEST_USER_ACCESS_TOKEN
# → { "authToken": "eyJ..." }

# 4. Chat UI
open http://localhost:3333/api/v1/agent/ui

# 5. Run golden evals
COLUMNS=200 npx evalite run evals/golden/agent-golden.eval.ts

# 6. Check metrics
curl -H "Authorization: Bearer <jwt>" http://localhost:3333/api/v1/agent/metrics?since=1h
```
