# MaalRise — staff guide

A plain-language guide to running MaalRise day to day. No accounting background
needed.

---

## Signing in

Open the app and sign in with your work email. On a phone, tap **Add to home
screen** — MaalRise installs like an app and opens straight to the dashboard.

If you cannot sign in, ask the CEO to check your account is active and has a
role. Without a role you will not be able to see anything.

## Choosing the cycle you are working in

At the top of every screen there is a cycle selector. **Everything you see and
everything you record belongs to the cycle shown there.** If figures look wrong,
check you are in the right cycle first.

## What your role lets you do

| Role | What you do |
|---|---|
| **CEO** | Everything, including approvals, settings and closing the cycle |
| **Operations Officer** | Suppliers, products, procurement, shipments, goods receipt, inventory |
| **Accounts Officer** | Payments, expenses, capital, repayments, receivables, reports |
| **Auditor** | Look and export only — you cannot change anything |

You will never be shown a button you are not allowed to use.

---

## The five words the dashboard uses

These have exact meanings. Getting them straight makes the whole system easy.

**Cash at Hand** — money sitting in the bank or cash account right now, free to
spend.

**Cash in Stock** — money already spent on goods that have **not yet arrived** in
the warehouse. Still ours, just tied up in production, shipping or at the port.

**Inventory Value** — goods physically in the warehouse that we own and have not
sold yet, valued at what they actually cost us to land in Nigeria.

**Outstanding Receivables** — money the business owes us for goods we have
already sold to them.

**Total Business Assets** — all four added together. No naira is ever counted in
two of them at once.

---

## The everyday cycle

### 1. Raise a procurement batch — Operations

**Procurement → New procurement.** Pick the supplier, enter today's exchange rate,
add each product with its quantity and unit price. The batch number is created
for you.

> The rate you type is saved with the batch and never changes later, even if the
> Naira moves. That is deliberate: history should not move.

The batch goes for approval. **You cannot approve your own batch** — someone else
must.

### 2. Pay the supplier — Accounts

**Open the batch → Record supplier payment.** Enter the amount in the supplier's
currency and the rate you actually got.

Watch what happens: Cash at Hand goes down, Cash in Stock goes up by exactly the
same amount. Nothing was lost — the money simply moved from the bank into goods.

Part payments are fine. Record each one as it goes out.

### 3. Track the shipment — Operations

**Shipments → New shipment.** Record the container number, bill of lading, ports
and expected arrival. Update the status as it moves: shipped → in transit →
arrived at port → clearing → delivered.

Mark it **Delayed** as soon as you know. An alert appears for everyone.

### 4. Add the costs — Operations or Accounts

**Open the batch → Add cost line.** Freight, customs, clearing, port charges,
transport to the warehouse. Add each one as its invoice arrives.

These are **not** expenses. They become part of what the goods cost us — the
"landed cost". The app spreads them across the products in the batch for you.

### 5. Finalise the landed cost — Accounts or CEO

Once every invoice is in: **Finalise landed cost**.

> Do this only when you are sure nothing else is coming. After this, no more cost
> lines can be added to the batch — and until you do it, the goods cannot be sold.

### 6. Receive the goods — Operations

**Goods receipts → Record goods receipt.** For each product, enter how many
actually arrived, how many were damaged, how many were rejected. The app works
out what is sellable and what is missing.

Then **Confirm receipt**. The value moves out of Cash in Stock and into
Inventory. You will see Cash in Stock for that batch drop to zero.

### 7. Sell to the business — Operations

**Murābaḥah sales → New Murābaḥah sale.** Choose the business, pick the stock to
sell, and set the markup.

The screen shows the three figures that matter, exactly as they will appear on
the contract:

- **Our disclosed cost** — what the goods actually cost us to land
- **Murābaḥah profit** — the markup we have agreed
- **Final selling price** — cost plus profit

Once the CEO or Accounts approves it, **that price is fixed for good**. If the
business pays late, they still owe exactly the same amount. That is the rule, and
the system will not let anyone change it.

### 8. Record the repayment — Accounts

**Repayments → Record repayment.** Enter the amount received and which contracts
it settles. Tap **Allocate oldest first** and the app splits it for you.

One payment can settle several contracts. One contract can take several payments.
The allocations must add up to exactly the amount received — the app will not let
you save otherwise.

Cash at Hand goes up, the receivable goes down, and the money is available for
the next procurement batch.

**Made a mistake?** Use **Reverse**, not delete. It writes a correcting entry and
keeps the original, with your reason attached.

---

## Every month

### Close the month — Accounts or CEO

**Monthly closing → Close period.** This freezes the month's figures. Months must
be closed in order, oldest first.

After closing, nobody can post into that month without the CEO reopening it —
and the reason for reopening is recorded permanently.

### Send the investor report — Accounts or CEO

**Investor reports → Generate report.** Pick the month and write a short update
in normal language: what was bought, what arrived, what was sold, any problems,
what is coming next.

Then **Download PDF** and send it to investors. It is branded, easy to read, and
carries the note that monthly profit is provisional until the year ends.

---

## At the end of the 12 months

**Annual cycle closing.** Compute the figures, then work through six steps in
order:

1. Accounts review
2. Reconciliation
3. Management approval — CEO
4. Final profit confirmation — CEO
5. Investor allocation
6. Payout approval — CEO

Only after step 4 is the profit final. Everything before that is an estimate. The
app will not let you skip a step or take them out of order.

---

## Things the system will not let you do (and why)

| It refuses to… | Because |
|---|---|
| Let you approve something you created | Two pairs of eyes on every financial decision |
| Sell goods before the landed cost is finalised | We must know what goods cost before we can disclose it |
| Increase a Murābaḥah price after approval | The price is fixed at contract; late payment changes nothing |
| Delete a payment or a sale | Reverse it instead, so the history stays complete |
| Post into a closed month | Unless the CEO reopens it and gives a reason |
| Save a repayment whose parts do not add up | The cashbook must always balance |

## Every change is recorded

Whenever you do something significant you are asked for a short reason. It goes
into the **Audit log** with your name and the time, and nobody — not even the CEO
— can edit or delete it.

Write something useful: *"Supplier confirmed production started"* helps in six
months. *"Update"* does not.

---

## Alerts

**Notifications** shows what needs attention: supplier payments due, shipments
delayed, goods at port, repayments due in 7, 3 and 0 days, overdue payments,
expenses waiting for approval, and month-end tasks not done.

They refresh automatically each morning. **Refresh alerts** runs the checks now.

## Reports

Everything exports to PDF and Excel, from **Financial reports** and **Operational
reports**. Auditors can export everything without being able to change anything.

The **Reconciliation check** on the financial reports page compares the assets we
report against the cashbook, inventory and receivables. **Every line should read
zero.** If one does not, tell the CEO before doing anything else.

## Settings — CEO only

Unit price, minimum units for new and current investors, profit-sharing ratio,
expense approval limit, default repayment period, company details and the
investor-report disclaimer.

Change one and it takes effect immediately, everywhere, with no help from a
developer.

---

## If something looks wrong

1. Check you are in the right investment cycle.
2. Open **Financial reports → Reconciliation check**. Every line should be zero.
3. Open the **Audit log** and filter to the record — it will show what changed,
   who changed it, and why.
4. If a figure still looks wrong, tell the CEO. Do not adjust records to make
   numbers match; find out why they do not first.
