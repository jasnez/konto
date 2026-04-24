# Query performance runbook

Run these against a local Supabase with realistic data (≥ 5 000 transactions).
Use `pnpm supabase:seed` or import a GDPR export to seed.

## Seed realistic data first

```sql
-- Quick row-count check — target ≥ 5 000 before running EXPLAIN.
select count(*) from transactions;
select count(*) from accounts;
select count(*) from merchants;
```

## Top-5 queries to verify

### 1. Dashboard RPC — the most expensive query in the app

```sql
-- Use a real user ID + real base currency from your local DB.
explain (analyze, buffers, format text)
select public.get_monthly_summary(2026, 4, 'BAM', '2026-04-24');
```

**What to look for**

- `idx_tx_user_date` (partial index) should appear on the `tx` CTE scan.
- `Index Cond: (user_id = $1)` — planner uses the leading column.
- `Filter: transaction_date between ...` applies inside the partial scan (rows ≪ full table).
- `idx_fx_quote_date` used for the `latest_fx` window.
- No `Seq Scan` on `transactions` or `fx_rates` if those tables are large.

### 2. Transactions list — account detail page

```sql
explain (analyze, buffers)
select id, transaction_date, amount_cents, merchant_raw, category_id
from transactions
where account_id = '<uuid>'
  and deleted_at is null
order by transaction_date desc, id desc
limit 50;
```

**Expected:** `idx_tx_account` (`account_id, transaction_date desc`).

### 3. Dedup check — fast path before insert

```sql
explain (analyze, buffers)
select id from transactions
where user_id = '<uuid>'
  and dedup_hash = '<hash>'
  and deleted_at is null;
```

**Expected:** `idx_tx_dedup` (partial, `user_id, dedup_hash`).

### 4. Merchant search (autocomplete)

```sql
explain (analyze, buffers)
select * from public.search_merchants('<query>', 10);
```

**Expected:** `idx_merchants_trgm` (GIN trigram) for the ilike path inside
`search_merchants`. Anything over ~5 ms for a 3+ character query warrants
a pg_trgm similarity threshold review.

### 5. Category hierarchy listing

```sql
explain (analyze, buffers)
select id, parent_id, name, kind, sort_order
from categories
where user_id = '<uuid>'
  and deleted_at is null
order by sort_order;
```

**Expected:** `idx_categories_user` (partial).

## Index inventory

| Index                      | Table        | Columns                             | Partial?             |
| -------------------------- | ------------ | ----------------------------------- | -------------------- |
| `idx_tx_user_date`         | transactions | (user_id, transaction_date desc)    | `deleted_at is null` |
| `idx_tx_account`           | transactions | (account_id, transaction_date desc) | —                    |
| `idx_tx_dedup`             | transactions | (user_id, dedup_hash)               | `deleted_at is null` |
| `idx_tx_category`          | transactions | (category_id)                       | `deleted_at is null` |
| `idx_tx_merchant`          | transactions | (merchant_id)                       | `deleted_at is null` |
| `idx_tx_merchant_raw_trgm` | transactions | merchant_raw GIN trgm               | —                    |
| `idx_accounts_user`        | accounts     | (user_id)                           | `deleted_at is null` |
| `idx_categories_user`      | categories   | (user_id)                           | `deleted_at is null` |
| `idx_merchants_trgm`       | merchants    | canonical_name GIN trgm             | —                    |
| `idx_fx_quote_date`        | fx_rates     | (quote, date desc)                  | —                    |

## Red flags

- Any `Seq Scan` on `transactions` with > 1 000 rows → missing or bypassed index.
- Any `Hash Join` on `transactions × fx_rates` → the FX subquery expanded too wide.
- `rows=1` estimates with actual rows in thousands → stale `pg_statistics`; run `ANALYZE transactions;`.
