'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { recordRepayment } from '@/app/actions/finance'
import { formatNaira, toKobo, toNumber } from '@/lib/money'
import { formatDate, today } from '@/lib/dates'

export interface OpenContract {
  murabaha_sale_id: string
  contract_number: string
  business_id: string
  outstanding: string
  due_date: string | null
  days_overdue: number
}

const METHODS = ['bank_transfer', 'cash', 'cheque', 'wallet', 'other']

/**
 * One payment can settle several contracts, and one contract can take several
 * payments. Allocations must add up to the amount received exactly — the
 * database rejects anything else.
 */
export function RepaymentForm({
  businesses,
  contracts,
  accounts,
}: {
  businesses: { id: string; name: string }[]
  contracts: OpenContract[]
  accounts: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [date, setDate] = useState(today())
  const [method, setMethod] = useState('bank_transfer')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const open_ = useMemo(
    () =>
      contracts
        .filter((c) => c.business_id === businessId && toNumber(c.outstanding) > 0)
        // Oldest debt first, so allocation follows the natural order.
        .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')),
    [contracts, businessId],
  )

  const allocated = Object.values(allocations).reduce((sum, v) => sum + toNumber(v), 0)
  const difference = toKobo(toNumber(amount) - allocated)

  /** Spreads the payment across the oldest contracts first. */
  function autoAllocate() {
    let remaining = toKobo(amount)
    const next: Record<string, string> = {}
    for (const contract of open_) {
      if (remaining <= 0) break
      const take = Math.min(remaining, toKobo(contract.outstanding))
      if (take > 0) {
        next[contract.murabaha_sale_id] = take.toFixed(2)
        remaining = toKobo(remaining - take)
      }
    }
    setAllocations(next)
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await recordRepayment(
        {
          business_id: businessId,
          amount,
          bank_account_id: accountId,
          payment_date: date,
          method,
          payment_reference: reference,
          notes,
          allocations: Object.entries(allocations)
            .filter(([, v]) => toNumber(v) > 0)
            .map(([murabaha_sale_id, value]) => ({ murabaha_sale_id, amount: value })),
        },
        'Murabaha repayment received',
      )

      if (result.ok) {
        toast.success(result.message ?? 'Repayment recorded.')
        setOpen(false)
        setAmount('')
        setReference('')
        setAllocations({})
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
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Record repayment
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record repayment</DialogTitle>
            <DialogDescription>
              Cash at Hand rises and the receivable falls. The money becomes available for new
              procurement immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business" htmlFor="rep-business" required>
                <Select
                  id="rep-business"
                  value={businessId}
                  onChange={(e) => {
                    setBusinessId(e.target.value)
                    setAllocations({})
                  }}
                >
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Amount received (₦)" htmlFor="rep-amount" required>
                <Input
                  id="rep-amount"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>

              <Field label="Received into" htmlFor="rep-account" required>
                <Select id="rep-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Payment date" htmlFor="rep-date" required>
                <Input id="rep-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>

              <Field label="Payment method" htmlFor="rep-method">
                <Select id="rep-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Payment reference" htmlFor="rep-ref">
                <Input
                  id="rep-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="TRF/MG/0001"
                />
              </Field>
            </div>

            {/* --- Allocation --------------------------------------------- */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Allocate to contracts</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!amount || open_.length === 0}
                  onClick={autoAllocate}
                >
                  <Wand2 className="h-4 w-4" />
                  Allocate oldest first
                </Button>
              </div>

              {open_.length === 0 ? (
                <p className="rounded-md border p-3 text-sm text-muted-foreground">
                  This business has no outstanding contracts.
                </p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-2">
                  {open_.map((c) => (
                    <div
                      key={c.murabaha_sale_id}
                      className="flex flex-wrap items-end justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{c.contract_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatNaira(c.outstanding)} outstanding · due {formatDate(c.due_date)}
                          {c.days_overdue > 0 ? (
                            <span className="ml-1 font-medium text-destructive">
                              ({c.days_overdue}d overdue)
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <Field label="Allocate (₦)" htmlFor={`alloc-${c.murabaha_sale_id}`}>
                        <Input
                          id={`alloc-${c.murabaha_sale_id}`}
                          type="number"
                          inputMode="decimal"
                          step="any"
                          className="w-40"
                          value={allocations[c.murabaha_sale_id] ?? ''}
                          onChange={(e) =>
                            setAllocations((prev) => ({
                              ...prev,
                              [c.murabaha_sale_id]: e.target.value,
                            }))
                          }
                        />
                      </Field>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {toNumber(amount) > 0 ? (
              <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Amount received</span>
                  <span className="tabular font-medium">{formatNaira(amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Allocated</span>
                  <span className="tabular font-medium">{formatNaira(allocated)}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-1">
                  <span className="font-medium">Unallocated</span>
                  <span
                    className={
                      Math.abs(difference) < 0.005
                        ? 'tabular font-semibold text-success'
                        : 'tabular font-semibold text-destructive'
                    }
                  >
                    {formatNaira(difference)}
                  </span>
                </div>
              </div>
            ) : null}

            <Field label="Notes" htmlFor="rep-notes" error={error ?? undefined}>
              <Textarea id="rep-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              loading={pending}
              disabled={toNumber(amount) <= 0 || Math.abs(difference) >= 0.005}
            >
              Record {amount ? formatNaira(amount) : 'repayment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
