# Build Brief — MaalRise Internal Operations and Financial Management App

A standalone, mobile-first internal web application for **MaalRise**, under
**Maalvest Investment Limited**.

The application manages MaalRise's procurement, inventory, Murābaḥah sales,
repayments, financial records, and monthly investor summary reports. It is an
internal operations and finance system. Investors do not have login access.

> **Correction recorded 2026-08-19.** §2 of the original brief gave the colour
> direction as "elegant dark green, gold, cream, white, or another professional
> Islamic-finance-inspired theme". That was a mistake. The brand colours are
> **purple and gold**, and §2 below reflects the correction. `CLAUDE.md` §8 and
> the implemented theme match it.

---

## 1. Business model

MaalRise receives investment capital for a 12-month investment cycle and uses it
to procure products — mainly furniture and children's cars — directly from
manufacturers and suppliers in China.

The procurement cycle works like this:

1. MaalRise purchases goods from China.
2. Goods may remain in production for some time.
3. Goods are shipped to Nigeria.
4. Goods arrive and are received into MaalRise inventory.
5. MaalRise sells the goods to an operating business under a Murābaḥah cost-plus
   transaction.
6. The business repays MaalRise after approximately one month or one and a half
   months.
7. MaalRise reinvests the money received into new procurement transactions.
8. This cycle continues throughout the 12-month investment period.
9. Investors receive their capital and share of actual profit only after the
   12-month cycle is completed.

The application must make it easy to answer:

> **Where is every naira belonging to MaalRise currently located?**

The system distinguishes between: cash at hand, cash in stock, goods in
production, goods in transit, goods received into inventory, goods sold to a
business, outstanding Murābaḥah receivables, repayments received, profit earned,
and expenses incurred.

## 2. Application type

- Standalone application
- Mobile-first, fully responsive on phones, tablets and desktop
- Installable as a Progressive Web App where possible
- Simple and easy for non-technical staff to use
- Secure, with role-based access
- Designed for internal operations and financial management

Clean, professional design.

**Branding**

- Brand name: MaalRise
- Platform: Maalvest Investment Limited
- **Colour direction: purple and gold** — a professional,
  Islamic-finance-inspired theme
- Avoid an overcrowded interface
- Use simple cards, tables, clear labels, filters and status badges

## 3. User roles

**Super Admin / CEO** — complete access: dashboard, procurement, suppliers,
products, shipments, inventory, Murābaḥah transactions, repayments, expenses,
financial reports, investor records, investment cycles, monthly investor
reports, user management, settings, editing and deleting records, approval
functions, audit trail.

**Operations Officer** — create and update procurement records; manage suppliers
and products; update production and shipment statuses; record goods received;
manage inventory; prepare goods for sale to a business; upload operational
documents; view relevant reports. Must not approve sensitive financial changes
unless given permission.

**Accounts Officer** — record payments and expenses; record MaalRise capital
received; record business repayments; view receivables; calculate landed costs;
view profit and loss; generate financial reports; prepare investor reports;
upload payment evidence.

**Read-Only Auditor** — view transactions, documents, reports and audit history;
export reports. Must not create, edit, approve or delete records.

## 4. Main dashboard

**Financial overview** — Cash at Hand, Cash in Stock, Goods in Production, Goods
in Transit, Inventory Value, Outstanding Murābaḥah Receivables, Repayments
Received This Month, Total Murābaḥah Sales, Estimated Gross Profit, Net Profit,
Total Business Assets, Total Expenses.

**Procurement overview** — New Procurement Orders, Orders in Production, Orders
Ready for Shipment, Goods in Transit, Goods at Port, Goods Awaiting Clearing,
Goods Received, Delayed Procurement Orders.

**Receivables overview** — Payments Due This Week, Payments Due This Month,
Overdue Payments, Fully Repaid Transactions, Total Outstanding Balance.

**Investment cycle overview** — Current Investment Cycle, Cycle Start Date, Cycle
Maturity Date, Months Completed, Months Remaining, Total Capital Introduced,
Cumulative Estimated Profit.

**Charts** — monthly procurements, monthly Murābaḥah sales, monthly repayments,
monthly expenses, monthly net profit, asset distribution, procurement batch
performance.

## 5. Financial definitions

Use these definitions consistently throughout the application.

**Cash at Hand** — money currently available in MaalRise's bank account, cash
account or approved wallet, and available for use.

**Cash in Stock** — the value of goods already purchased by MaalRise but not yet
physically received into MaalRise's warehouse. May include goods in production,
goods completed but not shipped, goods in transit, goods at the port, and goods
undergoing clearing. Goods already received in the warehouse are **not** Cash in
Stock; those become Inventory Value.

**Inventory Value** — the landed cost value of goods physically received, owned
by MaalRise, and not yet sold to a business.

**Outstanding Receivables** — the amount owed to MaalRise by a business for goods
sold under a Murābaḥah transaction.

**Total Business Assets** — automatically calculated as:

```
Cash at Hand
+ Cash in Stock
+ Inventory Value
+ Outstanding Murābaḥah Receivables
+ Other Approved Assets
```

Avoid double counting the same money or goods across multiple categories.

## 6. Investment cycle management

Each cycle: cycle name, cycle code, start date, maturity date, duration, total
target capital, total capital received, status, notes.

Statuses: Draft, Subscription Open, Active, Approaching Maturity, Matured,
Accounts Under Review, Profit Approved, Payout in Progress, Completed.

Transactions link to a particular investment cycle. The software must support
more than one investment cycle in future without mixing records.

## 7. Internal investor records

No investor login portal, but investor records are maintained internally.

Capture: full name, phone number, email address, address, investor category,
number of units, unit price, total amount invested, payment date, investment
cycle, payment reference, proof of payment, investor code, notes, status.

Investor category: New Investor, Current Investor.

**Rules** — one unit is ₦100,000; new investors must subscribe to a minimum of 5
units; current investors have no minimum unit requirement. The system validates
this automatically.

Investor statuses: Pending Confirmation, Active, Matured, Payout Pending, Paid,
Cancelled.

Generate a short, unique, non-guessable investor code automatically. The system
can generate: investment confirmation, investor summary, unit subscription
record, maturity schedule, payout calculation.

## 8. Supplier management

Capture: supplier name, contact person, country, address, phone number, email,
WeChat or WhatsApp contact, bank details, currency used, products supplied,
supplier rating, average production time, average delivery time, notes, uploaded
supplier documents.

Supplier status: Active, Under Review, Suspended, Inactive.

The system maintains supplier transaction history.

## 9. Product catalogue

For every product capture: product name, product category, description, image,
supplier, product code, model, colour options, size or dimensions, packaging
details, purchase currency, purchase cost, estimated shipping cost, estimated
landed cost, expected Murābaḥah selling price, expected margin, unit of
measurement, status.

Categories may include: office furniture, home furniture, children's furniture,
kids' ride-on cars, other approved products.

## 10. Procurement management

Every procurement creates a unique procurement batch, numbered
`MR-PO-YYYY-00001`.

Capture: procurement batch number, investment cycle, supplier, procurement date,
products, quantity per product, unit purchase price, total purchase cost,
currency, exchange rate, Naira equivalent, initial payment, balance payable to
supplier, payment due date, production start date, expected production
completion date, expected shipment date, expected arrival date, purchase
documents, notes.

Procurement statuses: Draft, Awaiting Approval, Approved, Supplier Payment
Pending, Partially Paid, Fully Paid, In Production, Production Completed, Ready
for Shipment, Shipped, In Transit, At Port, Clearing, Received, Partially
Received, Closed, Cancelled.

Allow one procurement batch to contain several products. Allow partial supplier
payments and partial receipt of goods.

## 11. Procurement costing and landed cost

Track: product purchase price, international shipping, freight, insurance,
customs, clearing, port charges, local transportation, inspection, bank charges,
foreign exchange charges, agent fees, documentation costs, other direct
procurement costs.

Allocate shared costs across products using one of: quantity, weight, volume,
purchase value, manual allocation.

Calculate: total procurement cost, total landed cost, landed cost per product,
landed cost per unit. The final landed cost becomes the cost basis for the
Murābaḥah sale.

## 12. Shipment tracking

A shipment record links to each procurement batch.

Capture: shipment number, shipping method, shipping company, freight forwarder,
container number, bill of lading number, tracking number, port of departure,
port of arrival, shipment date, expected arrival date, actual arrival date,
clearing agent, clearing status, shipping documents, delays, notes.

Shipment statuses: Awaiting Shipment, Booked, Shipped, In Transit, Delayed,
Arrived at Port, Clearing, Released, Delivered to Warehouse, Closed.

Allow upload of: supplier invoice, packing list, bill of lading, shipping
receipt, customs documents, clearing documents, delivery evidence.

## 13. Goods receipt and inventory

When goods arrive, create a Goods Receipt record capturing: procurement batch,
warehouse, date received, product, expected quantity, quantity received, missing
quantity, damaged quantity, rejected quantity, sellable quantity, inspection
notes, photos, receiving officer.

Goods receipt statuses: Pending Inspection, Partially Received, Fully Received,
Damaged, Disputed, Closed.

When goods are confirmed received: remove the value from Cash in Stock, add the
value to Inventory Value, and update product stock automatically.

Inventory tracks: product, procurement batch, quantity received, quantity
available, quantity reserved, quantity sold, quantity damaged, quantity lost,
unit landed cost, total stock value, warehouse, stock age. Inventory movements
must have a complete audit trail.

## 14. Business management

MaalRise may sell to one or more businesses.

Capture: business name, contact person, phone, email, address, registration
details, credit limit, standard repayment period, notes, status.

Business statuses: Active, Suspended, Inactive.

Do not hardcode MaalGrow as the only business. Use the general term Business so
MaalRise can sell to other operating businesses in future.

## 15. Murābaḥah sales management

Create a Murābaḥah Sale from received inventory, numbered `MR-MUR-YYYY-00001`.

Capture: Murābaḥah contract number, business, investment cycle, procurement
batch, products sold, quantity, cost per unit, total cost, agreed markup, profit
amount, final Murābaḥah selling price, sale date, repayment period, due date,
contract document, approval status, notes.

The system must clearly show: MaalRise's disclosed cost, Murābaḥah profit, final
selling price, amount paid, outstanding amount, due date.

The final selling price becomes fixed once the Murābaḥah sale is approved. Do
not allow the system to increase the amount owed merely because payment is late.

Murābaḥah statuses: Draft, Awaiting Approval, Approved, Goods Released, Active,
Partially Paid, Fully Paid, Overdue, Disputed, Cancelled.

When a Murābaḥah sale is completed: reduce MaalRise inventory, create a
receivable from the business, record the Murābaḥah revenue, record the cost of
goods sold, calculate gross profit.

## 16. Repayment management

The operating business usually repays MaalRise after one month or one and a half
months.

For every repayment capture: business, Murābaḥah contract, payment date, amount
received, payment method, bank account, payment reference, proof of payment,
notes, recorded by, approved by.

Support full payment, partial payment, multiple repayments against one
transaction, and one payment allocated across multiple Murābaḥah transactions.

Automatically calculate: amount due, amount received, outstanding balance, days
until due, days overdue, payment status.

Repayment statuses: Not Due, Due Soon, Due Today, Partially Paid, Paid, Overdue,
Disputed.

Create alerts for payments due in 7 days, 3 days, today, and overdue payments.

When repayment is received: reduce outstanding receivables, increase Cash at
Hand, record the inflow, and make the amount available for new procurement.

## 17. Capital recycling tracker

Track the full journey of capital through each procurement batch:

```
Capital Available → Procurement Paid → Goods in Production → Goods in Transit
→ Goods Received → Goods Sold under Murābaḥah → Receivable Created
→ Repayment Received → Capital Available for Redeployment
```

For each procurement batch calculate: procurement date, arrival date, Murābaḥah
sale date, repayment date, total capital cycle days, gross profit, direct
expenses, net profit, return on capital, number of times capital has been
recycled, amount available for redeployment.

This helps management compare which products, suppliers and batches recycle
capital fastest.

## 18. Cashbook and bank accounts

Support multiple accounts: bank accounts, cash account, foreign currency
account, payment wallet, other approved accounts.

Track every inflow and outflow. Inflows may include investor capital, business
repayments, refunds from suppliers, other approved income. Outflows may include
supplier payments, shipping, clearing, customs, local transportation, salaries,
software, bank charges, professional fees, office expenses, other expenses.

Every transaction includes: date, amount, category, account, description,
related procurement batch, related Murābaḥah transaction, payment reference,
proof, created by, approved by.

## 19. Expense management

Categories: procurement, shipping, clearing, customs, insurance, port charges,
local logistics, storage, staff salaries, professional fees, software, bank
charges, foreign exchange charges, marketing, office expenses, legal and
compliance, miscellaneous.

Expenses may link to a procurement batch, a shipment, a product, a Murābaḥah
transaction, an investment cycle, or general administration.

Expenses require approval above a configurable limit.

## 20. Financial reports

**Profit and Loss Statement** — Murābaḥah sales revenue, cost of goods sold,
gross profit, operating expenses, net profit or loss. Filterable by month,
quarter, investment cycle, product, supplier, business, procurement batch.

**Balance Sheet** — Assets (Cash at Hand, Cash in Stock, Inventory Value,
Outstanding Receivables, Other Assets); Liabilities (supplier balances,
outstanding expenses, other liabilities); Equity / Investment Funds (investor
capital, retained earnings, current-cycle profit).

**Cash Flow Statement** — cash inflows, cash outflows, procurement spending,
repayments received, operating expenses, closing cash balance.

**Other reports** — procurement, supplier payment, shipment, inventory
valuation, stock movement, Murābaḥah sales, receivables, repayment, overdue,
batch profitability, product profitability, supplier performance, capital
recycling, expense, investor capital, investment-cycle.

Reports must be exportable to PDF and Excel.

## 21. Monthly investor summary report

A simple, professional monthly investor report. Investors do not log in — staff
generate and download the report as a branded PDF. It should not be too
technical.

**Structure**

*MaalRise Monthly Investment Report* — reporting month, investment cycle, month
number (for example Month 4 of 12).

*Business Performance* — purchases made this month, goods received this month,
sales to business this month, repayments received this month, estimated net
profit this month, cumulative estimated net profit.

*Financial Position* — Cash at Hand, Cash in Stock, Inventory Value, Outstanding
Receivables, Total Business Assets.

*Monthly Result* — clearly show the profit for the month, or the loss for the
month, in wording a layperson can understand.

*Management Update* — a short editable paragraph covering major activities,
progress made, important challenges, and outlook for the following month.

*Disclaimer*

> Monthly profit figures are provisional and provided for performance reporting
> purposes only. Final distributable profit will be determined after the
> completion of the 12-month investment cycle and the closing of the accounts.
> Investment returns are based on actual business performance and are not
> guaranteed.

Do **not** include "Capital Status" in the investor report.

## 22. Annual cycle closing

At the end of the 12-month cycle, a structured closing process calculates: total
capital received, total procurement spending, total Murābaḥah sales, total
repayments received, total outstanding receivables, closing cash, closing Cash
in Stock, closing inventory, gross profit, total expenses, net profit, investor
profit pool, MaalRise profit share, investor profit allocation, capital
repayment, total investor payout.

The system must not automatically treat estimated monthly profit as final
profit. Final profit requires: accounts review, reconciliation, management
approval, final profit confirmation, investor allocation, payout approval.

## 23. Documents and file storage

Attach documents to relevant records: investor payment proof, supplier invoices,
purchase orders, product quotations, shipping invoices, packing lists, bills of
lading, customs documents, clearing receipts, goods receipt evidence, Murābaḥah
contracts, business invoices, repayment proof, expense receipts, bank
statements, investor reports, annual closing reports.

Documents are searchable and linked to their related transactions.

## 24. Approvals and controls

Approval workflows for: procurement orders, supplier payments, landed cost
finalisation, goods receipt adjustment, inventory write-off, Murābaḥah sale,
repayment reversal, high-value expenses, financial period closing, final
investor profit calculation, investor payouts.

The person who creates a sensitive transaction should not approve the same
transaction where possible.

## 25. Audit trail

Maintain a permanent audit trail showing user, date, time, action, record
affected, previous value, new value and reason for the change.

Ordinary users must not be able to delete audit records. Sensitive deletions
should preferably be replaced by Cancel, Void, Reverse or Archive.

## 26. Notifications and alerts

In-app notifications for: supplier payment due, production completion due,
shipment delayed, expected arrival approaching, goods at port, clearing delayed,
goods received, Murābaḥah repayment due, repayment overdue, expense awaiting
approval, investment cycle approaching maturity, monthly investor report due,
month-end closing incomplete.

## 27. Search and filters

Search by: procurement batch, supplier, product, shipment, container number,
Murābaḥah contract, business, investor, investor code, payment reference, date,
amount, status.

## 28. Settings

The CEO can manage: company name, logo, address, contact information, currency,
unit price, new-investor minimum units, current-investor minimum units,
profit-sharing ratio, expense approval limits, default repayment period,
document numbering, investment cycle settings, report branding, user roles and
permissions, notification preferences.

Do not hardcode values that may change later.

## 29. Important system rules

1. MaalRise and the operating business must remain financially separate.
2. MaalRise's sales are sales to a business under Murābaḥah.
3. The business's retail customer sales must not be recorded as MaalRise sales.
4. Goods must be purchased and owned by MaalRise before they can be sold under
   Murābaḥah.
5. Once the Murābaḥah selling price is approved, it should not increase because
   of late repayment.
6. Monthly investor profit is provisional, not final or guaranteed.
7. Investor payout happens after the 12-month cycle closes.
8. Every transaction must be traceable to its source document.
9. Avoid double counting assets.
10. Financial reports must reconcile with the cashbook, inventory and
    receivables.

## 30. Recommended pages

Login · Dashboard · Investment Cycles · Investors · Suppliers · Products ·
Procurement Orders · Procurement Details · Shipments · Goods Receipts ·
Inventory · Businesses · Murābaḥah Sales · Receivables · Repayments · Cashbook ·
Bank Accounts · Expenses · Approvals · Documents · Monthly Closing · Annual
Cycle Closing · Investor Reports · Financial Reports · Operational Reports ·
Notifications · Audit Log · Users and Roles · Settings

## 31. Technical expectations

A secure and maintainable production-ready structure: mobile-first responsive
frontend, secure authentication, role-based permissions, strong database
relationships, form validation, transaction-safe financial updates, file upload
support, PDF report generation, Excel export, search, filters, sorting and
pagination, audit logs, error handling, loading states, empty states,
confirmation prompts for sensitive actions, automatic calculations, database
backups, clean API structure, proper environment variables, secure deployment
configuration.

Design the database carefully before building the interface.

**Core database entities** — Users, Roles, InvestmentCycles, Investors,
InvestorSubscriptions, Suppliers, Products, ProcurementOrders, ProcurementItems,
SupplierPayments, Shipments, ShipmentCosts, GoodsReceipts, GoodsReceiptItems,
Warehouses, InventoryLots, InventoryMovements, Businesses, MurabahaSales,
MurabahaSaleItems, Repayments, RepaymentAllocations, BankAccounts,
CashTransactions, Expenses, ExpenseCategories, Documents, Approvals,
MonthlyClosings, InvestorReports, AnnualClosings, Notifications, AuditLogs,
SystemSettings.

Build in phases, but design the database for the complete workflow from the
beginning.

**First usable version priorities** — dashboard, investment cycle, supplier and
product management, procurement, shipment tracking, goods receipt, inventory,
Murābaḥah sales, repayments, cashbook and expenses, profit and loss, monthly
investor report, user roles and audit trail.

The application should give MaalRise management a complete and reliable view of
its operations, assets, liabilities, cash position, trading profit and capital
recycling throughout each 12-month investment cycle.
