'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Banknote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/form-controls'
import { payExpense } from '@/app/actions/finance'
import { formatNaira } from '@/lib/money'

/** Posts an approved expense to the cashbook. */
export function PayExpenseDialog({
  expenseId,
  description,
  amount,
  accounts,
}: {
  expenseId: string
  description: string
  amount: string
  accounts: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await payExpense(expenseId, accountId, reference)
      if (result.ok) {
        toast.success(result.message ?? 'Expense paid.')
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
        Pay
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay expense</DialogTitle>
            <DialogDescription>
              {description} — {formatNaira(amount)}. This posts an outflow to the cashbook and
              reduces Cash at Hand.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Paid from" htmlFor="exp-account" required>
              <Select id="exp-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Payment reference" htmlFor="exp-ref" error={error ?? undefined}>
              <Input id="exp-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Pay {formatNaira(amount)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
