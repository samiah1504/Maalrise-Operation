'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Banknote, Calculator, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { recordProcurementCost, recordSupplierPayment, setAllocationMethod } from '@/app/actions/finance'
import { formatNaira, toNaira, toNumber } from '@/lib/money'
import { today } from '@/lib/dates'
import { titleCase } from '@/lib/utils'

/** Supplier payment: Cash at Hand down, Cash in Stock up by the same amount. */
export function SupplierPaymentDialog({
  procurementId,
  batchNumber,
  currency,
  defaultRate,
  outstandingForeign,
  accounts,
}: {
  procurementId: string
  batchNumber: string
  currency: string
  defaultRate: string
  outstandingForeign: number
  accounts: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState(String(toNumber(defaultRate)))
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [date, setDate] = useState(today())
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const naira = toNaira(amount || 0, rate || 0)

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await recordSupplierPayment(
        {
          procurement_order_id: procurementId,
          amount_foreign: amount,
          exchange_rate: rate,
          bank_account_id: accountId,
          payment_date: date,
          payment_reference: reference,
          notes,
        },
        `Supplier payment for ${batchNumber}`,
      )

      if (result.ok) {
        toast.success(result.message ?? 'Payment recorded.')
        setOpen(false)
        setAmount('')
        setReference('')
        router.refresh()
      } else {
        setError(
          result.fieldErrors ? Object.values(result.fieldErrors)[0] ?? result.error : result.error,
        )
      }
    })
  }

  return (
    <>
      <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
        <Banknote className="h-4 w-4" />
        Record supplier payment
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record supplier payment</DialogTitle>
            <DialogDescription>
              {batchNumber} · Partial payments are supported. The rate you enter is stored with
              the payment and never recalculated later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={`Amount (${currency})`}
                htmlFor="pay-amount"
                required
                hint={outstandingForeign > 0 ? `${currency} ${outstandingForeign.toFixed(2)} outstanding` : undefined}
              >
                <Input
                  id="pay-amount"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>

              <Field label="Exchange rate" htmlFor="pay-rate" required>
                <Input
                  id="pay-rate"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </Field>
            </div>

            {naira > 0 ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Naira equivalent</span>
                  <span className="tabular font-semibold">{formatNaira(naira)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cash at Hand falls by this amount and Cash in Stock rises by the same amount.
                </p>
              </div>
            ) : null}

            <Field label="Paid from" htmlFor="pay-account" required>
              <Select id="pay-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment date" htmlFor="pay-date" required>
                <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Payment reference" htmlFor="pay-ref">
                <Input
                  id="pay-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="SWIFT/2026/0001"
                />
              </Field>
            </div>

            <Field label="Notes" htmlFor="pay-notes" error={error ?? undefined}>
              <Textarea id="pay-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const COST_TYPES = [
  'international_shipping', 'freight', 'insurance', 'customs', 'clearing', 'port_charges',
  'local_transport', 'inspection', 'bank_charges', 'fx_charges', 'agent_fees',
  'documentation', 'other',
] as const

/** A direct procurement cost line. Capitalised into landed cost, not expensed. */
export function ProcurementCostDialog({
  procurementId,
  batchNumber,
  shipmentId,
  accounts,
}: {
  procurementId: string
  batchNumber: string
  shipmentId?: string | null
  accounts: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [costType, setCostType] = useState<(typeof COST_TYPES)[number]>('international_shipping')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [accountId, setAccountId] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await recordProcurementCost(
        {
          procurement_order_id: procurementId,
          cost_type: costType,
          amount_naira: amount,
          incurred_date: date,
          description,
          shipment_id: shipmentId ?? '',
          bank_account_id: accountId,
          payment_reference: reference,
        },
        `${titleCase(costType)} for ${batchNumber}`,
      )

      if (result.ok) {
        toast.success(result.message ?? 'Cost recorded.')
        setOpen(false)
        setAmount('')
        setDescription('')
        router.refresh()
      } else {
        setError(
          result.fieldErrors ? Object.values(result.fieldErrors)[0] ?? result.error : result.error,
        )
      }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Receipt className="h-4 w-4" />
        Add cost line
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add procurement cost</DialogTitle>
            <DialogDescription>
              Freight, customs, clearing and the rest. These are capitalised into the batch&apos;s
              landed cost — they are not operating expenses, so they never appear twice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cost type" htmlFor="cost-type" required>
                <Select
                  id="cost-type"
                  value={costType}
                  onChange={(e) => setCostType(e.target.value as (typeof COST_TYPES)[number])}
                >
                  {COST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {titleCase(t)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Amount (₦)" htmlFor="cost-amount" required>
                <Input
                  id="cost-amount"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>

              <Field label="Date incurred" htmlFor="cost-date" required>
                <Input id="cost-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>

              <Field
                label="Paid from"
                htmlFor="cost-account"
                hint="Leave blank if this cost has not been paid yet"
              >
                <Select id="cost-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">Not yet paid</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Description" htmlFor="cost-desc">
              <Input
                id="cost-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Sea freight — 1 x 40ft container"
              />
            </Field>

            <Field label="Payment reference" htmlFor="cost-ref" error={error ?? undefined}>
              <Input id="cost-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Add cost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const METHODS = ['quantity', 'weight', 'volume', 'value', 'manual'] as const

/** Switches how shared costs are spread across the products in a batch. */
export function AllocationMethodPicker({
  procurementId,
  current,
  disabled,
}: {
  procurementId: string
  current: string
  disabled?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <label className="flex items-center gap-2">
      <Calculator className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Allocate by</span>
      <Select
        value={current}
        disabled={disabled || pending}
        className="h-9 w-auto text-sm"
        onChange={(e) => {
          const method = e.target.value as (typeof METHODS)[number]
          startTransition(async () => {
            const result = await setAllocationMethod(procurementId, method)
            if (result.ok) {
              toast.success(result.message ?? 'Costs reallocated.')
              router.refresh()
            } else {
              toast.error(result.error)
            }
          })
        }}
      >
        {METHODS.map((m) => (
          <option key={m} value={m}>
            {titleCase(m)}
          </option>
        ))}
      </Select>
    </label>
  )
}
