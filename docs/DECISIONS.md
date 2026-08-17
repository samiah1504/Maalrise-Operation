# Decisions

Where the brief left room for interpretation, this records the choice made and
why — always in favour of keeping the accounting reconcilable.

---

## 1. Direct procurement costs are capitalised, never expensed

**Brief §11 and §19 both list shipping, customs and clearing.** §11 wants them in
landed cost; §19 lists them as expense categories.

Counting them in both would inflate expenses and understate gross margin. So:

- Freight, insurance, customs, clearing, port charges, local transport,
  inspection, bank charges, FX charges, agent fees and documentation are
  recorded as **`shipment_costs`** lines against the batch. They are allocated
  into landed cost and reach the profit and loss statement through **cost of
  goods sold**.
- `expense_categories` carries an `is_direct_cost` flag. Categories marked
  direct are excluded from the operating-expense block of the P&L, so a cost
  filed there by mistake still cannot be counted twice.
- The expenses page labels each line "Capitalised" or "Operating" so the
  distinction is visible to staff, not just implied.

## 2. Reserved stock stays in Inventory Value

A draft Murābaḥah sale reserves stock but does not create a receivable. If
reserved units left Inventory Value at that moment, they would vanish from the
balance sheet until the sale was approved.

`Inventory Value = (quantity_available + quantity_reserved) × unit_landed_cost`.
Units move to `quantity_sold` only when the sale is approved — the same moment
the receivable appears. Nothing is ever in both places.

## 3. The unit landed cost is authoritative, and the residual is reported

Landed cost per unit must be rounded to kobo, because that is what inventory is
valued at. Rounding `total ÷ quantity` and then multiplying back by quantity does
not return the original total.

Rather than let a few kobo drift silently into assets:

- `allocated_cost_naira` sums **exactly** to the batch's direct costs, for every
  allocation method. (Proved in `tests/unit/allocation.test.ts` and in SQL.)
- `landed_cost_per_unit` is rounded, and `landed_cost_total` is defined as
  `quantity × landed_cost_per_unit` — so it always matches what inventory holds.
- The difference between money committed to a batch and value capitalised is
  reported by `v_batch_position.cost_variance` and recognised in the P&L once the
  batch is received.

The same column also captures a real business event: goods paid for that never
arrived, or arrived damaged. Both are money spent that did not become inventory,
so both belong in the same line.

## 4. Damage at receipt versus damage in stock

`goods_receipt_items` records what arrived damaged, missing or rejected. Those
units never enter inventory, so `inventory_lots.quantity_damaged` and
`quantity_lost` are reserved for **post-receipt** write-offs only.

Without this split, a later write-off would be double counted against the
receipt-time shortfall.

## 5. Cash in Stock clears on receipt, and cannot go negative

`Cash in Stock = money spent on a batch − value capitalised into inventory`,
floored at zero and forced to zero once the batch reaches `received` or `closed`.

The floor matters when goods arrive before the supplier is fully paid: the
inventory is an asset and the unpaid balance is a liability, but there is no cash
sitting in stock. The unpaid balance appears separately as
`supplier_balance` on the balance sheet.

## 6. One role per user

`user_roles` allows several rows per user, but the UI assigns exactly one and
`auth_role()` resolves the most privileged if more exist. Overlapping roles make
"who could have approved this?" ambiguous, which defeats maker–checker.

## 7. Reversal, never deletion

No financial record is ever hard-deleted. `reverse_repayment` writes a
compensating repayment and a compensating cash transaction, and marks the
original reversed. The original row, its allocations and its audit entry all
survive. RLS grants `DELETE` on only five non-financial tables, and only to the
CEO.

## 8. The audit reason travels in one transaction

The audit trigger reads the reason from a transaction-local setting
(`app.audit_reason`). Setting it in a separate round trip would lose it, because
PostgREST wraps each request in its own transaction.

Every RPC therefore calls `set_audit_reason()` as its first statement, and
status changes go through `change_record_status()` rather than a bare `UPDATE`.

## 9. Money crosses the wire as strings, and is written as numbers

Postgres `numeric` is read back as a string to avoid float rounding, so row types
declare money columns as `string` and `lib/money.ts` parses them. Forms naturally
produce numbers, so the generated `Insert`/`Update` types accept `string | number`
for those columns. Values are validated by Zod before they leave the browser and
by Postgres after they arrive.

## 10. Monthly profit is never treated as final

`v_monthly_pl` and the investor report both label profit provisional. Final
profit exists only after `advance_annual_closing` has recorded all six steps —
accounts review, reconciliation, management approval, profit confirmation,
investor allocation and payout approval — each with an approver and a timestamp.
The steps are strictly sequential and the last four are the CEO's alone.

## 11. Cost variance, not "shrinkage"

An earlier draft recognised only positive shortfalls. That left the negative case
(capitalising marginally more than was committed, through rounding) unrecognised,
which broke the asset identity by a few kobo. `cost_variance` is signed, so both
directions are recognised and `Total Business Assets` always equals
`capital + gross profit − expenses` exactly. This was caught by the end-to-end SQL
test, not by inspection.

## 12. Investor minimums are validated twice

Zod validates in the browser using the current settings, and
`validate_investor_subscription()` re-checks in Postgres reading the same
settings rows. Changing the minimum in Settings changes both immediately, with no
redeployment — which is the acceptance criterion for TASKS phase 2.
