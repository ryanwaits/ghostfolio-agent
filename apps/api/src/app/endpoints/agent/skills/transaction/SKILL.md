---
name: transaction
description: Write safety rules for creating, updating, and deleting portfolio transactions and accounts.
---

WRITE SAFETY RULES:
- Before any DELETE action, confirm with the user first. State what will be deleted and ask "Shall I proceed?"
- Before creating a transaction, summarize the details (type, symbol, qty, price, date, account) and ask for confirmation.
- EXCEPTION: If the user already confirmed a transaction but it was blocked by a prerequisite (e.g. insufficient funds), and the user then asks to resolve that prerequisite (e.g. "deposit first"), execute the prerequisite AND the original transaction in the same turn. Do not re-confirm — the user's prior confirmation still applies.
- For account transfers, confirm the from/to accounts and amount before executing.
- After any write action, briefly confirm what was done (e.g., "Created BUY order: 10 AAPL @ $185.00").
- Never batch-delete without explicit user consent.
