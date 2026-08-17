# MaalRise — Internal Operations & Finance

Internal operations and financial management for **MaalRise**, a product of
**Maalvest Investment Limited**.

MaalRise takes investor capital for a 12-month cycle, buys furniture and
children's cars from manufacturers in China, lands them in Nigeria, sells them to
an operating business under a Murābaḥah cost-plus contract, collects repayment,
and redeploys the money. This app tracks every naira through that loop.

It exists to answer one question at any moment: **where is every naira belonging
to MaalRise right now?**

---

## Quick start

```bash
pnpm install
cp .env.example .env.local        # fill in your Supabase project keys

supabase start                    # local Postgres, Auth and Storage
supabase db reset                 # applies migrations, then seed.sql

pnpm dev                          # http://localhost:3000
```

The seed creates one user per role. Local demo password: `MaalRise2026!`

| Email | Role |
|---|---|
| `ceo@maalrise.test` | Super Admin / CEO |
| `operations@maalrise.test` | Operations Officer |
| `accounts@maalrise.test` | Accounts Officer |
| `auditor@maalrise.test` | Read-Only Auditor |

## Commands

```bash
pnpm dev          # development server
pnpm build        # production build
pnpm typecheck    # TypeScript, strict
pnpm test         # Vitest — finance calculations and status machines
pnpm test:e2e     # Playwright — the four roles, mobile and desktop
pnpm db:reset     # rebuild the database from migrations and seed
```

To run the end-to-end accounting test against the database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01_full_cycle.sql
```

It drives a full cycle — buy, pay, ship, receive, sell, repay — and asserts that
Total Business Assets equals capital + gross profit − expenses to the kobo, with
cost allocation exact for all five methods.

---

## How it is built

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 App Router, TypeScript strict, Tailwind |
| Data | Supabase — Postgres, Auth, Storage, RLS, `pg_cron` |
| Validation | Zod, shared between React Hook Form and the server actions |
| Charts | Recharts, with a colour-blind-validated palette |
| Reports | `@react-pdf/renderer` for PDF, `exceljs` for Excel |
| PWA | `@serwist/next` — installable on Android and iOS |
| Tests | Vitest, Playwright, plus SQL assertions against real Postgres |

### The rules the architecture enforces

**Money moves in Postgres, not in React.** Every financial state change is an
RPC that validates, writes all affected tables and the audit log inside one
transaction: `approve_procurement`, `record_supplier_payment`,
`confirm_goods_receipt`, `approve_murabaha_sale`, `record_repayment`,
`close_month`, `advance_annual_closing`. The UI calls the RPC and shows the
result.

**Nothing is counted twice.** Cash at Hand, Cash in Stock, Inventory Value and
Outstanding Receivables are defined so that a naira can only ever be in one of
them. Paying a supplier moves value from the first to the second; receiving goods
moves it to the third; selling moves it to the fourth; repayment returns it to
the first. `reconciliation_check()` proves it, and the reconciliation report shows
zero on every line.

**Every table has RLS.** Roles are `ceo`, `operations`, `accounts`, `auditor`.
The auditor has SELECT and nothing else, everywhere. The service-role key is used
only by scheduled jobs and report generation, never in the browser.

**Nothing sensitive happens without two people.** `approvals` records who asked
and who decided, and the RPC refuses when they are the same person.

**Nothing financial is deleted.** Records are cancelled, voided, reversed or
archived. A reversal writes a compensating entry and leaves the original intact.

**Everything is audited.** A trigger on every business table records the user,
the action, the before and after values and the reason. `audit_logs` has no
UPDATE or DELETE policy for anyone.

**Nothing configurable is hardcoded.** Unit price, minimum units, profit-sharing
ratio, approval limits, repayment period, numbering prefixes, branding and the
investor-report disclaimer all live in `system_settings`. Changing one takes
effect immediately, with no redeployment.

**Cycles never mix.** Every financial row carries `investment_cycle_id`, and the
cycle selector in the header scopes every page.

---

## Layout

```
app/(app)/…              29 pages: dashboard, cycles, investors, suppliers,
                         products, procurement, shipments, goods receipts,
                         inventory, businesses, Murābaḥah, receivables,
                         repayments, cashbook, bank accounts, expenses,
                         approvals, documents, closings, reports, notifications,
                         audit log, users, settings
app/actions/…            server actions — every write path
app/api/reports/…        PDF and Excel generation
app/api/cron             daily alerts where pg_cron is unavailable
components/…             ui, forms, tables, charts, shell
lib/…                    supabase clients, money, dates, status machines,
                         Zod schemas, settings, report specs
supabase/migrations/…    schema, RPCs, views, RLS
supabase/tests/…         SQL assertions for the full capital cycle
docs/                    ERD, decisions, staff guide
```

Further reading: [`docs/erd.md`](docs/erd.md) for the data model,
[`docs/DECISIONS.md`](docs/DECISIONS.md) for the judgement calls and why, and
[`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) for non-technical staff.

---

## Deployment

**App** — Vercel. Set `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`.

**Database** — Supabase. Run `supabase db push`, enable Point-in-Time Recovery for
backups, and confirm the `documents` storage bucket is private.

**Scheduled jobs** — `pg_cron` runs `run_daily_jobs()` at 06:00 where available.
Otherwise point a scheduler at `/api/cron` once a day with the `CRON_SECRET` as a
bearer token.

Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser or prefix it with
`NEXT_PUBLIC_`.

---

Internal system. Investors do not have accounts — staff generate and send their
monthly reports.
