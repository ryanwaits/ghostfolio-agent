# Seed Data — Demo Portfolios

Sample CSV files for quickly loading portfolio data into Ghostfolio. Use these for demos, grading, or testing the agent chat.

## Quick Start

1. **Create an account** — Click "Get Started" on the Ghostfolio homepage. Save your Security Token.
2. **Import a portfolio** — Go to Portfolio → Activities → Import (upload icon), select one of these CSVs.
3. **Use the agent** — Navigate to `/api/v1/agent/ui`, enter your Security Token, and start chatting.

## Portfolios

| File | Focus | Holdings | Transactions |
|------|-------|----------|-------------|
| `stocks-portfolio.csv` | US equities | VOO, AAPL, MSFT, GOOGL, AMZN, NVDA, META | 16 (buys, sells, dividends) |
| `crypto-portfolio.csv` | Crypto | BTC, ETH, SOL, LINK, UNI | 15 (buys, sells) |
| `hybrid-portfolio.csv` | Mixed | VOO, AAPL, MSFT, NVDA, TSLA + BTC, ETH, SOL | 18 (buys, sells, dividends) |

## Notes

- **Stocks** use `YAHOO` data source (auto-detected, DataSource column optional)
- **Crypto** uses `COINGECKO` data source (DataSource column required — uses slug IDs like `bitcoin`, `ethereum`, `solana`)
- All prices are in USD
- Dates span Jan 2024 – Feb 2025
- Fee is 0 across all transactions for simplicity
