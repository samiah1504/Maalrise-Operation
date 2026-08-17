'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Banknote, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { saveSubscription } from '@/app/actions/records'
import { recordInvestorCapital } from '@/app/actions/finance'
import { formatNaira } from '@/lib/money'
import { today } from '@/lib/dates'

/**
 * Unit subscription. The minimum depends on whether the investor is new or
 * current; both the number shown here and the rule enforced in Postgres come
 * from system settings, so changing the setting changes the rule with no
 * redeploy.
 */
export function SubscriptionDialog({
  investors,
  cycleId,
  cycleName,
  unitPrice,
  minNew,
  minCurrent,
}: {
  investors: { id: string; full_name: string; category: string }[]
  cycleId: string
  cycleName: string
  unitPrice: number
  minNew: number
  minCurrent: number
}) {
  const [open, setOpen] = useState(false)
  const [investorId, setInvestorId] = useState('')
  const [units, setUnits] = useState('')
  const [paymentDate, setPaymentDate] = useState(today())
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const investor = investors.find((i) => i.id === investorId)
  const minimum = investor?.category === 'current_investor' ? minCurrent : minNew
  const unitCount = Number(units) || 0
  const total = unitCount * unitPrice

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await saveSubscription({
        investor_id: investorId,
        investment_cycle_id: cycleId,
        units,
        payment_date: paymentDate,
        payment_reference: reference,
        notes,
      })

      if (result.ok) {
        toast.success(result.message ?? 'Subscription recorded.')
        setOpen(false)
        setInvestorId('')
        setUnits('')
        setReference('')
        setNotes('')
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
        Record subscription
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record unit subscription</DialogTitle>
            <DialogDescription>{cycleName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Investor" htmlFor="sub-investor" required>
              <Select
                id="sub-investor"
                value={investorId}
                onChange={(e) => setInvestorId(e.target.value)}
              >
                <option value="">Select an investor…</option>
                {investors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.full_name} ({i.category === 'new_investor' ? 'New' : 'Current'})
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Number of units"
              htmlFor="sub-units"
              required
              hint={
                investorId
                  ? `${investor?.category === 'current_investor' ? 'Current' : 'New'} investor — minimum ${minimum} unit${minimum === 1 ? '' : 's'} at ${formatNaira(unitPrice)} each`
                  : `One unit is ${formatNaira(unitPrice)}`
              }
            >
              <Input
                id="sub-units"
                type="number"
                inputMode="numeric"
                min={1}
                value={units}
                onChange={(e) => setUnits(e.target.value)}
              />
            </Field>

            {unitCount > 0 ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total amount</span>
                  <span className="tabular font-semibold">{formatNaira(total)}</span>
                </div>
                {investorId && unitCount < minimum ? (
                  <p className="mt-2 text-xs font-medium text-destructive">
                    Below the minimum of {minimum} unit{minimum === 1 ? '' : 's'} for this investor
                    category.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment date" htmlFor="sub-date">
                <Input
                  id="sub-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </Field>
              <Field label="Payment reference" htmlFor="sub-ref">
                <Input
                  id="sub-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="TRF/2026/0001"
                />
              </Field>
            </div>

            <Field label="Notes" htmlFor="sub-notes" error={error ?? undefined}>
              <Textarea
                id="sub-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Record subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Confirms the money actually arrived. This is what turns a subscription into
 * Cash at Hand — the subscription alone does not.
 */
export function RecordCapitalDialog({
  subscriptionId,
  investorName,
  amount,
  accounts,
}: {
  subscriptionId: string
  investorName: string
  amount: string
  accounts: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [date, setDate] = useState(today())
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await recordInvestorCapital(subscriptionId, accountId, date, reference)
      if (result.ok) {
        toast.success(result.message ?? 'Capital recorded.')
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <Button variant="gold" size="sm" onClick={() => setOpen(true)}>
        <Banknote className="h-4 w-4" />
        Record capital
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record capital received</DialogTitle>
            <DialogDescription>
              Confirm that {formatNaira(amount)} from {investorName} has landed. This adds to Cash
              at Hand and to the cycle&apos;s total capital received.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Received into" htmlFor="cap-account" required>
              <Select
                id="cap-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment date" htmlFor="cap-date" required>
                <Input id="cap-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Payment reference" htmlFor="cap-ref" error={error ?? undefined}>
                <Input
                  id="cap-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="TRF/2026/0001"
                />
              </Field>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Record {formatNaira(amount)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
