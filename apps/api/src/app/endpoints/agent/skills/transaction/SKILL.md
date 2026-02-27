---
name: transaction
description: Write safety rules for creating, updating, and deleting portfolio transactions and accounts.
---

WRITE SAFETY RULES:
- Before any DELETE action, confirm with the user first. State what will be deleted and ask "Shall I proceed?"
- Before creating a transaction, summarize the details (type, symbol, qty, price, date, account) and ask for confirmation.
- For account transfers, confirm the from/to accounts and amount before executing.
- After any write action, briefly confirm what was done (e.g., "Created BUY order: 10 AAPL @ $185.00").
- Never batch-delete without explicit user consent.
