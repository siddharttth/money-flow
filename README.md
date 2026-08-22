# Money Flow

A personal expense tracker built to replace a Google Sheet — keeping the sheet's speed while
modelling the one thing a spreadsheet can't:

> **Category tells you WHAT you spent on. Person tells you WHO it was with.**
> They are independent dimensions of the *same* transaction.

One ₹800 dinner with Sankalp is **one** ₹800 row. It shows up as ₹800 under *Outside Food*,
₹800 under *Sankalp*, and ₹800 in your monthly total — never ₹1,600.

---

## Stack

Everything here runs on free tiers.

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | One Vercel deploy serves the UI and the API |
| Database | Postgres (Neon) | Free tier; any Postgres URL works |
| ORM | Drizzle | SQL-first migrations, tiny runtime |
| Auth | JWT in an httpOnly cookie (`jose` + `bcryptjs`) | No paid auth service |
| Validation | Zod | One schema per endpoint, reused for error messages |
| UI | Tailwind v4, Recharts, SWR | Mobile-first, dark mode, no component library |
| Tests | Vitest + PGlite | Real Postgres in-process; no external DB needed |

---

## Getting started

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL and AUTH_SECRET
npm run db:migrate        # create the tables
npm run seed              # optional: demo account with two months of data
npm run dev
```

`npm run seed` creates `demo@moneyflow.app` / `demo1234`.

Generate a secret with `openssl rand -base64 32`.

---

## Deploying to Vercel (free)

1. **Database** — in the Vercel dashboard, *Storage → Create Database → Neon (Postgres)*.
   This sets `DATABASE_URL` on the project automatically. (Any Postgres connection
   string works — Neon, Supabase, Railway.)
2. **Import the repo** into Vercel. It auto-detects Next.js; no build settings to change.
3. **Environment variables** — add:
   - `AUTH_SECRET` — a long random string.
   - `SIGNUP_CODE` — *optional but recommended*. When set, registration requires this
     code, which keeps a public URL from becoming an open signup form.
4. **Run migrations once** against the production database:
   ```bash
   DATABASE_URL="<your production url>" npm run db:migrate
   ```
5. Visit `/register`, create your account, and you're in.

Everything runs on the Node.js serverless runtime. The DB client is a cached singleton with
`max: 1`, which keeps warm invocations inside Neon's free connection budget.

---

## The data model

```
users
  ├── categories      (what)      name, slug, icon, color, kind, sort_order, is_active
  ├── people          (who)       name, relationship_type, avatar, is_self, is_active
  ├── groups ──┬── group_members ── people
  └── expenses (THE money)        amount_minor, category_id, expense_date, note, deleted_at
        └── expense_people        (expense_id, person_id, share_amount_minor NULL)
```

Four decisions worth knowing:

**Money is stored as integer paise.** `amount_minor = 80000` is ₹800.00. Conversion happens
only at the API boundary, so every `SUM()` is exact — 1,000 additions of ₹0.10 give exactly
₹100, which floats do not.

**`expenses` is the only table holding money.** Category totals come from grouping it;
person totals come from joining `expense_people` to it. Nothing else can contribute
to a total, so nothing can inflate one.

**`expense_people.share_amount_minor` is nullable and unused in V1.** It's the seat reserved
for expense splitting. Filling it in later changes person analytics
(`COALESCE(share_amount_minor, amount_minor)` already reads it) without migrating a
single existing row.

**Deletes are soft.** `deleted_at` is set and every query filters on it, so a mistaken
delete is recoverable and analytics update instantly either way.

### Why person totals can exceed the month total

Tag one ₹2,000 dinner with three people and each of them shows ₹2,000 — that *is* what
"associated with" means. Actual spending is still ₹2,000. So any endpoint returning a
person breakdown also returns `grandTotalMinor` (real money) separately from
`associationTotalMinor`, and the UI states the distinction in plain language. Person filtering
uses `EXISTS` rather than a `JOIN` precisely so a multi-person expense is counted once.

---

## Peers — money lent and borrowed

The old sheet's PEERS tab, modelled properly. **Lending is not spending**: you expect the money
back, so it must never touch expense totals or category analytics. Borrowing is not income.
Hence `ledger_entries`, a table no spending query reads.

Every case reduces to two directions:

```
'out'  money left you toward them   (gave / lent / paid on their behalf)
'in'   money came to you from them  (took / borrowed / got repaid)

balance = SUM(out) - SUM(in)
  > 0   they owe you    (the sheet's GIVEN column)
  < 0   you owe them    (the sheet's TAKEN column)
```

A repayment is just an entry in the opposite direction, so the running balance settles itself
with no special "settlement" concept. The per-peer page shows every sub-transaction with the
balance after it, and **Settle up** pre-fills an entry for the exact outstanding amount.

## API

All routes require the session cookie and return JSON errors as `{ error, details }`.

```
POST   /api/auth/register        POST   /api/auth/login
POST   /api/auth/logout          GET    /api/auth/me

GET    /api/expenses             ?start &end &categoryIds &personIds &minAmount
POST   /api/expenses             &maxAmount &search &sort &limit &offset
GET    |PATCH |DELETE  /api/expenses/:id
POST   /api/expenses/:id/duplicate

GET    |POST   /api/categories           PATCH |DELETE  /api/categories/:id
POST   /api/categories/reorder
GET    |POST   /api/people               GET |PATCH |DELETE  /api/people/:id
GET    /api/people/:id/detail            person page in one request
GET    |POST   /api/groups               PATCH |DELETE  /api/groups/:id

GET    |POST   /api/ledger              peer balances + GIVEN/TAKEN totals
PATCH  |DELETE /api/ledger/:id          POST /api/ledger/:id/restore
GET    /api/ledger/person/:personId     one peer's history + running balance

GET    /api/analytics/summary    ?month
GET    /api/analytics/categories ?month|start&end &personIds
GET    /api/analytics/people     ?month|start&end &categoryIds
GET    /api/analytics/daily      ?month &categoryIds &personIds
GET    /api/analytics/trends     ?months=6

POST   /api/import/preview       parse a sheet CSV, write nothing
POST   /api/import/commit        write the previewed rows
GET    /api/export               CSV, one row per transaction
```

`personIds=none` filters to expenses with nobody attached. New expenses never land there —
an empty person list resolves to the **Me** person, enforced in the service layer so the UI,
the raw API and the importer all behave the same. The filter still finds older rows created
before that rule.

---

## Importing your existing sheet

Export a month tab as CSV, then *Settings → Import*.

The importer's job is undoing the spreadsheet's shape. Given:

```
DATE      | OUTSIDE FOOD | TRANSPORT | SANKALP | TOTAL
2-Aug-26  |          484 |           |     484 |   484
8-Aug-26  |          300 |       200 |     500 |   500
```

it produces one ₹484 Outside Food expense tagged to Sankalp, and — for the second row —
a ₹300 and a ₹200 expense both tagged to Sankalp. Never ₹968 or ₹1,000.

The rules, in order:

1. A person amount equal to a category amount **pairs** with it.
2. A person amount equal to a sum of 2–3 category amounts pairs with all of them.
3. Leftover category amounts become expenses attributed to **Me** (your own spending).
4. Leftover person amounts are filed under a fallback category, with a warning.

The preview shows the reconstructed total beside your sheet's own `TOTAL` column and
**refuses to look correct** if they differ — that mismatch is what catches a person column
accidentally mapped as a category. You can fix any column's role in the preview and it
re-reconstructs immediately. Nothing is written until you confirm.

---

## Tests

```bash
npm test
```

55 tests, no external services required. `tests/aggregation.test.ts` runs the real service
and analytics code against Postgres compiled to WASM (PGlite), built from the same migration
SQL that ships to production — so these exercise actual `SUM`/`GROUP BY`/`EXISTS`, not mocks.

Covered: the ₹800 + ₹500 + ₹1,620 scenario totalling ₹2,920; category totals summing to the
grand total; person totals as a separate dimension; **a 3-person ₹2,000 expense staying
₹2,000**; edits to amount, category, person and date each updating every aggregation;
soft delete removing an expense from all of them; month isolation; cross-account isolation;
decimal exactness; and the importer's pairing rules including the mis-mapped-column case.

---

## Keyboard & speed

- `n` or `a` — open Add Expense from anywhere
- `⌘/Ctrl + Enter` — save
- **Save & add another** keeps the sheet open with the category and person still selected
- Recently used categories and people sort to the front of the chip rows (stored locally)
- Date defaults to today, with one-tap Today / Yesterday

---

## Not built yet (but the schema is ready)

Splitting (`share_amount_minor`), amounts owed, recurring expenses, budgets, income,
accounts and payment methods (`payment_method` column exists), receipts. None of these
need a schema rewrite.
