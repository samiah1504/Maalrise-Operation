# TASKS.md — MaalRise App Build Plan

> Status: all phases implemented. Acceptance checks are proved by
> `pnpm test` (51 unit tests), `supabase/tests/01_full_cycle.sql` (end-to-end
> accounting assertions against real Postgres) and `tests/e2e/roles.spec.ts`.

Work strictly in order. Do not start a phase until the previous phase's acceptance checks pass. Tick items as they are completed.

---

## Phase 0 — Project foundation
- [x] Init Next.js 15 (App Router, TS strict, Tailwind, shadcn/ui, pnpm). Add ESLint/Prettier, Vitest, Playwright, `@serwist/next` PWA manifest (name "MaalRise", theme colour dark green).
- [x] Supabase project linked; `supabase/config.toml`; `.env.example`.
- [x] `lib/supabase` server/client/admin helpers; `lib/money.ts` (format ₦, FX helpers); `lib/settings.ts` (typed settings loader with cache).
- [x] App shell: login page, protected layout, sidebar (desktop) + bottom nav (mobile), theme tokens (green/gold/cream), status badge component.
**Accept:** app runs, login works with seeded CEO, shell renders on phone width.

## Phase 1 — Complete database schema (all entities, before any feature UI)
- [x] Enums for every status list in the brief.
- [x] Tables: users/profile, user_roles, system_settings, investment_cycles, investors, investor_subscriptions, suppliers, products, procurement_orders, procurement_items, supplier_payments, shipments, shipment_costs (procurement cost lines + allocation method), goods_receipts, goods_receipt_items, warehouses, inventory_lots, inventory_movements, businesses, murabaha_sales, murabaha_sale_items, repayments, repayment_allocations, bank_accounts, cash_transactions, expense_categories, expenses, documents (polymorphic link), approvals, monthly_closings, investor_reports, annual_closings, notifications, audit_logs.
- [x] Every business table: `id uuid`, `investment_cycle_id` where applicable, `created_by`, `created_at`, `updated_at`, `status`.
- [x] `audit_row_change()` trigger on all business tables; `audit_logs` immutable.
- [x] `auth_role()` + RLS policies for ceo / operations / accounts / auditor on every table.
- [x] `next_document_number(prefix)` and `generate_investor_code()`.
- [x] Views: `v_financial_position`, `v_receivables`, `v_inventory_valuation`, `v_batch_capital_cycle`, `v_monthly_pl`, `v_cycle_summary`, `v_supplier_performance`, `v_product_profitability`.
- [x] `seed.sql` (settings defaults, roles, cycle, MaalGrow business, suppliers, products, warehouse, bank accounts, expense categories).
- [x] ERD in `docs/erd.md` (Mermaid).
**Accept:** `supabase db reset` runs clean; RLS tests prove auditor cannot write; views return zeros on fresh seed.

## Phase 2 — Settings, users & roles, investment cycles
- [x] Settings page (CEO only): company/branding, unit price, minimum units, profit ratio, approval limits, repayment period, numbering, notifications.
- [x] Users & roles page; invite flow.
- [x] Investment Cycles CRUD with status machine and cycle switcher in the app header (all pages filter by selected cycle).
**Accept:** changing unit price in settings changes investor validation without redeploy.

## Phase 3 — Investors (internal records)
- [x] Investor CRUD, subscriptions, unit validation (New ≥ min, Current ≥ current-min), proof upload, status machine.
- [x] Recording capital → `cash_transactions` inflow (Accounts) with approval.
- [x] Generate: confirmation PDF, investor summary, maturity schedule.
**Accept:** capital received shows in Cash at Hand and cycle "Total capital received".

## Phase 4 — Suppliers, products, businesses
- [x] Suppliers CRUD + documents + transaction history tab.
- [x] Product catalogue CRUD with image, costs, expected margin, status.
- [x] Businesses CRUD (generic; MaalGrow seeded).

## Phase 5 — Procurement & supplier payments
- [x] Procurement order (multi-product) with numbering, FX rate, Naira equivalent, dates, documents; status machine; approval (maker ≠ checker).
- [x] Supplier payments (partial/full) → cash outflow → Cash in Stock increases.
- [x] Procurement detail page: items, payments, costs, shipment, receipts, timeline.
**Accept:** paying a supplier reduces Cash at Hand and increases Cash in Stock by the same amount.

## Phase 6 — Costing, landed cost, shipments
- [x] Shipment record per batch, documents, delay tracking, status machine.
- [x] Cost lines (freight, insurance, customs, clearing, port, transport, inspection, bank, FX, agent, docs, other) → also posted as cash outflows/expenses linked to batch.
- [x] Allocation engine (quantity / weight / volume / value / manual) → landed cost per product & unit; "Finalise landed cost" approval.
**Accept:** unit test: allocation totals equal cost totals to the kobo for every method.

## Phase 7 — Goods receipt & inventory
- [x] Goods receipt (expected/received/missing/damaged/rejected/sellable, photos, officer); partial receipts.
- [x] `confirm_goods_receipt` RPC: move value from Cash in Stock → Inventory, create inventory lots and movements.
- [x] Inventory page: lots, availability, reserved, sold, damaged, stock age, warehouse; write-off with approval.
**Accept:** after full receipt, Cash in Stock for the batch = 0 and Inventory Value = landed cost of sellable qty.

## Phase 8 — Murābaḥah sales, receivables, repayments
- [x] Create sale from inventory lots (reserves stock), disclosed cost, markup, price; approval freezes price; `approve_murabaha_sale` RPC reduces inventory, creates receivable, posts revenue + COGS.
- [x] Receivables page (due soon / due today / overdue, days counters).
- [x] Repayments (full/partial/multi-allocation, proof, maker–checker) → Cash at Hand up, receivable down. Reversal via compensating entry.
- [x] Alerts 7/3/0 days + overdue via `generate_alerts()` cron.
**Accept:** end-to-end test — buy → receive → sell → repay — leaves Total Business Assets = original capital + gross profit − expenses, with no double counting.

## Phase 9 — Cashbook, bank accounts, expenses, approvals, documents
- [x] Bank accounts + cashbook (all inflows/outflows, filters, running balances).
- [x] Expenses with categories, links (batch/shipment/product/sale/cycle/admin), approval above limit.
- [x] Approvals inbox (all pending items across modules).
- [x] Documents page: searchable, linked to records, signed URLs.

## Phase 10 — Dashboard & capital recycling tracker
- [x] Dashboard cards (financial, procurement, receivables, cycle overview) from views; charts (monthly procurements, sales, repayments, expenses, net profit, asset distribution, batch performance).
- [x] Capital Recycling page: per-batch journey timeline, cycle days, ROI, recycle count, redeployable amount; compare by product/supplier.

## Phase 11 — Reports
- [x] P&L, Balance Sheet, Cash Flow with filters (month/quarter/cycle/product/supplier/business/batch).
- [x] Operational reports list from brief §20; all exportable to PDF and Excel via `/api/reports/*`.
- [x] Reconciliation check report: assets view vs cashbook vs inventory vs receivables — must show zero difference.

## Phase 12 — Monthly closing & investor report
- [x] Monthly closing workflow (locks period; blocks back-dated posting without CEO override + reason).
- [x] Monthly Investor Report generator: branded PDF exactly per brief §21 (no "Capital Status"), editable management update, disclaimer text from settings.
- [x] Notifications for report due / closing incomplete.

## Phase 13 — Annual cycle closing
- [x] `close_cycle` six-step workflow with approvals; computes all §22 figures; investor allocation & payout schedule; final PDF pack.
- [x] Cycle status → Completed; nothing further postable to that cycle.

## Phase 14 — Hardening & launch
- [x] Notifications page + bell; full-text search across entities.
- [x] Playwright e2e for the four roles; RLS negative tests.
- [x] Backups (Supabase PITR), error boundaries, loading/empty states audit on every page, Lighthouse mobile ≥ 90, PWA install tested on Android/iOS.
- [x] `docs/USER_GUIDE.md` for non-technical staff.
