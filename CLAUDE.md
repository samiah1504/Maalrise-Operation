# CLAUDE.md — MaalRise Internal Operations & Finance App

Read this file and `BUILD_BRIEF.md` fully before writing any code. `BUILD_BRIEF.md` is the source of truth for scope; this file is the source of truth for *how* to build it. Work through `TASKS.md` in order.

## 1. What this is
An internal, mobile-first operations and finance web app for **MaalRise** (a product of **Maalvest Investment Limited**). It tracks capital through a 12-month investment cycle: investor capital → procurement from China → production → shipping → goods receipt → Murābaḥah cost-plus sale to an operating business → receivable → repayment → capital redeployed. Investors do **not** log in.

The app must always be able to answer: **"Where is every naira belonging to MaalRise right now?"**

## 2. Stack (do not substitute)
- Next.js 15, App Router, TypeScript (strict), Tailwind CSS, shadcn/ui
- Supabase: Postgres, Auth, Storage, RLS, `pg_cron`
- React Hook Form + Zod (client + server validation, one shared schema per entity)
- TanStack Query (data), TanStack Table (lists), Recharts (charts)
- `@react-pdf/renderer` for PDFs (server-side route handlers), `exceljs` for Excel
- PWA via `@serwist/next`
- Vitest (unit, esp. finance calculations) + Playwright (critical flows)
- Deploy: Vercel (app) + Supabase (DB/storage/cron)

## 3. Architecture rules
1. **Database first.** Complete the full schema migration (all entities in brief §31) before building any page. Every later phase adds pages, not tables, unless a genuine gap is found.
2. **Financial state changes happen in Postgres functions (RPC), inside a transaction, never in React or route handlers.** Examples: `approve_procurement`, `record_supplier_payment`, `confirm_goods_receipt`, `approve_murabaha_sale`, `record_repayment`, `post_expense`, `close_month`, `close_cycle`. The UI calls the RPC; the RPC validates, writes all affected tables, and writes the audit log.
3. **Dashboard and reports read from views**, not ad-hoc client aggregation: `v_financial_position`, `v_receivables`, `v_inventory_valuation`, `v_batch_capital_cycle`, `v_monthly_pl`, `v_cycle_summary`.
4. **RLS on every table.** Roles: `ceo`, `operations`, `accounts`, `auditor`. Store in `user_roles`. Helper `auth_role()` used in policies. Auditor is SELECT-only everywhere. Service-role key is only used in cron jobs and PDF generation, never exposed to the browser.
5. **Audit trail is a trigger** (`audit_row_change()`) on every business table writing `user_id, action, table_name, record_id, old_data jsonb, new_data jsonb, reason, created_at`. `audit_logs` has no UPDATE/DELETE policy for anyone.
6. **No hard deletes on financial records.** Use status transitions: Cancelled / Voided / Reversed / Archived. Reversal creates a compensating record; it never edits the original.
7. **Maker–checker.** `approvals` table; the approver must differ from the creator (`CHECK` in the RPC). Which actions need approval and expense thresholds come from `system_settings`, not code.
8. **Money.** `numeric(18,2)` everywhere. FX rate is captured on each procurement/supplier payment and stored with the row; Naira equivalent is computed once and stored. Never recompute historical Naira values from a current rate.
9. **Nothing configurable is hardcoded**: unit price, minimum units, profit-sharing ratio, approval limits, default repayment period, numbering prefixes, company branding all live in `system_settings` (typed key/value, cached server-side).
10. **Multi-cycle from day one.** Every financial row carries `investment_cycle_id`. Nothing may aggregate across cycles unless a report explicitly asks for it.
11. **Business is generic.** MaalGrow is one row in `businesses`, seeded, never referenced in code.

## 4. Financial definitions (implement exactly; brief §5)
- **Cash at Hand** = sum of balances of active `bank_accounts` (from `cash_transactions`).
- **Cash in Stock** = Naira value of procurement paid for goods **not yet received** (status from Approved through Clearing, and partially-received remainders). Includes shipping/clearing costs paid to date on those batches.
- **Inventory Value** = Σ (`quantity_available` × `unit_landed_cost`) over `inventory_lots` for goods physically received and unsold.
- **Outstanding Receivables** = Σ (`selling_price` − `amount_paid`) over active Murābaḥah sales.
- **Total Business Assets** = Cash at Hand + Cash in Stock + Inventory Value + Outstanding Receivables + Other Approved Assets. **No item may appear in two buckets.** Write a Vitest test that seeds a full cycle and asserts the sum reconciles with the cashbook.
- **Landed cost** = purchase cost + all direct procurement costs allocated per the batch's allocation method (quantity / weight / volume / value / manual). Landed cost is finalised via approval; only then may the batch be sold.
- **Murābaḥah**: disclosed cost = finalised landed cost; selling price = cost + agreed markup; **frozen once approved**; late payment never increases the amount owed. Approving a sale: reduce inventory, create receivable, record revenue + COGS in the same transaction.
- **Repayment**: increases Cash at Hand, reduces receivable; supports partial, multiple, and one payment split across several contracts (`repayment_allocations`).
- **Monthly profit is provisional.** Final profit exists only after `close_cycle` passes: accounts review → reconciliation → management approval → profit confirmation → investor allocation → payout approval. Store each step with approver + timestamp.

## 5. State machines (enforce with enums + transition tables in RPCs)
Use the exact status lists in the brief for: investment cycles, investors, suppliers, procurement, shipments, goods receipts, Murābaḥah sales, repayments, businesses. Illegal transitions must throw. Keep a `status_transitions` helper in `lib/status.ts` mirrored by a Postgres check in each RPC.

## 6. Numbering
Sequences per year via a `next_document_number(prefix)` function using an advisory lock: `MR-PO-YYYY-00001` (procurement), `MR-MUR-YYYY-00001` (Murābaḥah), `MR-SHP-`, `MR-GRN-`, `MR-RCP-`, `MR-EXP-`, `MR-INV-` (investor code: short, random, non-guessable, e.g. 8 chars base32, uniqueness enforced).

## 7. Investor rules
Unit price and minimums come from `system_settings` (defaults: ₦100,000/unit, new investor ≥ 5 units, current investor ≥ 1). Validate in Zod **and** in a DB check function. Investor category: New / Current. Investor status list per brief.

## 8. UI conventions
- Mobile first: bottom nav on phones, sidebar on ≥ md. Every table has a card view on small screens.
- Theme: dark green primary, gold accent, cream/white surfaces. Status badges colour-coded and consistent across modules.
- Every list: search, filters, sort, pagination, empty state, loading skeleton. Every destructive/financial action: confirmation dialog with reason field (feeds audit log).
- Currency shown as ₦ with thousands separators; foreign currency shown with code and stored FX rate.
- Notifications: `notifications` table filled by daily `pg_cron` job (`generate_alerts()`), shown in a bell + Notifications page.

## 9. Repo layout
```
app/(auth)/login
app/(app)/dashboard, cycles, investors, suppliers, products, procurement, shipments, goods-receipts, inventory, businesses, murabaha, receivables, repayments, cashbook, bank-accounts, expenses, approvals, documents, monthly-closing, annual-closing, investor-reports, financial-reports, operational-reports, notifications, audit-log, users, settings
app/api/reports/*         # PDF / Excel route handlers (server only)
components/ui, components/forms, components/tables, components/charts
lib/supabase (server/client/admin), lib/schemas (Zod), lib/status.ts, lib/money.ts, lib/settings.ts
supabase/migrations/*.sql, supabase/seed.sql, supabase/functions (cron SQL)
tests/unit (finance), tests/e2e
```

## 10. Working style for Claude Code
- Before starting each task in `TASKS.md`, restate the acceptance criteria, then implement, then run `pnpm typecheck && pnpm test`, then tick the task.
- Never skip ahead to UI before the migration for that entity exists.
- When the brief and this file conflict on *how*, follow this file; on *what*, follow the brief. If something is ambiguous, choose the option that keeps the accounting reconcilable and note the assumption in `DECISIONS.md`.
- Seed data: one cycle, one business (MaalGrow), two suppliers, five products, one CEO user, one of each other role — enough to demo the full flow.
- Environment: `.env.example` with all keys; never commit real keys.
