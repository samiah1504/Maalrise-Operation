# Entity relationship diagram

Every financial row carries `investment_cycle_id`, so cycles never mix. Money
columns are `numeric(18,2)`; quantities are `numeric(18,3)`.

## The capital journey

```mermaid
flowchart LR
  A["Capital available<br/>bank_accounts"] --> B["Procurement paid<br/>supplier_payments"]
  B --> C["Goods in production<br/>procurement_orders"]
  C --> D["Goods in transit<br/>shipments + shipment_costs"]
  D --> E["Goods received<br/>goods_receipts → inventory_lots"]
  E --> F["Sold under Murābaḥah<br/>murabaha_sales"]
  F --> G["Receivable created<br/>selling_price − amount_paid"]
  G --> H["Repayment received<br/>repayments"]
  H --> A

  classDef cash fill:#efe8f6,stroke:#4f2574,color:#4f2574
  classDef stock fill:#f8f1de,stroke:#b58a2b,color:#5c4712
  class A,H cash
  class B,C,D,E,F,G stock
```

## Core schema

```mermaid
erDiagram
  investment_cycles ||--o{ investor_subscriptions : funds
  investment_cycles ||--o{ procurement_orders : scopes
  investment_cycles ||--o{ murabaha_sales : scopes
  investment_cycles ||--o{ cash_transactions : scopes
  investment_cycles ||--o{ expenses : scopes
  investment_cycles ||--o{ monthly_closings : "closed month by month"
  investment_cycles ||--o| annual_closings : "closed once at maturity"

  investors ||--o{ investor_subscriptions : holds
  investor_subscriptions ||--o{ annual_closing_allocations : "paid out through"

  suppliers ||--o{ products : supplies
  suppliers ||--o{ procurement_orders : "sells to MaalRise"

  procurement_orders ||--|{ procurement_items : contains
  procurement_orders ||--o{ supplier_payments : "paid by"
  procurement_orders ||--o{ shipment_costs : "costed by"
  procurement_orders ||--o{ shipments : "shipped as"
  procurement_orders ||--o{ goods_receipts : "received via"

  products ||--o{ procurement_items : "ordered as"
  products ||--o{ inventory_lots : "stocked as"

  goods_receipts ||--|{ goods_receipt_items : contains
  goods_receipts ||--o{ inventory_lots : creates
  warehouses ||--o{ inventory_lots : holds
  inventory_lots ||--o{ inventory_movements : "audited by"
  inventory_lots ||--o{ murabaha_sale_items : "sold as"

  businesses ||--o{ murabaha_sales : buys
  murabaha_sales ||--|{ murabaha_sale_items : contains
  murabaha_sales ||--o{ repayment_allocations : "settled by"

  repayments ||--|{ repayment_allocations : "spread across"
  businesses ||--o{ repayments : pays
  bank_accounts ||--o{ cash_transactions : records
  bank_accounts ||--o{ repayments : "received into"

  expense_categories ||--o{ expenses : classifies

  profiles ||--o{ user_roles : "granted"
  profiles ||--o{ approvals : approves
  profiles ||--o{ audit_logs : "acted"

  documents }o--|| investment_cycles : "filed under"
  annual_closings ||--o{ annual_closing_allocations : schedules
  monthly_closings ||--o| investor_reports : "reported by"
```

## Where each figure comes from

| Dashboard figure | View | Source of truth |
|---|---|---|
| Cash at Hand | `v_financial_position` | `cash_transactions` + `bank_accounts.opening_balance` |
| Cash in Stock | `v_batch_position` | supplier payments + direct costs − value capitalised |
| Inventory Value | `v_inventory_valuation` | `(available + reserved) × unit_landed_cost` |
| Outstanding Receivables | `v_receivables` | `selling_price − amount_paid` on active contracts |
| Total Business Assets | `v_financial_position` | the four above plus `other_assets` |
| Gross profit | `v_financial_position` | Σ `murabaha_sales.markup_amount` |
| Operating expenses | `v_monthly_pl` | approved/paid expenses in non-direct categories |
| Capital cycle days | `v_batch_capital_cycle` | last repayment date − procurement date |

## Tables by area

**Access & configuration** — `profiles`, `user_roles`, `system_settings`,
`document_sequences`

**Investors** — `investment_cycles`, `investors`, `investor_subscriptions`

**Supply** — `suppliers`, `products`, `warehouses`

**Procurement** — `procurement_orders`, `procurement_items`, `supplier_payments`,
`shipments`, `shipment_costs`

**Inventory** — `goods_receipts`, `goods_receipt_items`, `inventory_lots`,
`inventory_movements`

**Sales** — `businesses`, `murabaha_sales`, `murabaha_sale_items`

**Money** — `bank_accounts`, `cash_transactions`, `repayments`,
`repayment_allocations`, `expense_categories`, `expenses`, `other_assets`

**Governance** — `documents`, `approvals`, `monthly_closings`,
`investor_reports`, `annual_closings`, `annual_closing_allocations`,
`notifications`, `audit_logs`
