'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { writeOffInventory } from '@/app/actions/finance'
import { formatNaira, toNumber } from '@/lib/money'

const TYPES = [
  { value: 'damage', label: 'Damaged' },
  { value: 'loss', label: 'Lost' },
  { value: 'write_off', label: 'Written off' },
] as const

/**
 * Removing stock is never a delete. It is a movement with a reason, an
 * approval, and a matching loss in the profit and loss statement.
 */
export function WriteOffDialog({
  lotId,
  productName,
  available,
  unitCost,
}: {
  lotId: string
  productName: string
  available: number
  unitCost: string
}) {
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState('')
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('damage')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const value = toNumber(quantity) * toNumber(unitCost)

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await writeOffInventory(lotId, Number(quantity), type, reason.trim())
      if (result.ok) {
        toast.success(result.message ?? 'Inventory written off.')
        setOpen(false)
        setQuantity('')
        setReason('')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Write off
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Write off inventory
            </DialogTitle>
            <DialogDescription>
              {productName} · {available} unit{available === 1 ? '' : 's'} available. This reduces
              Inventory Value and records a loss. It requires approval and is permanently recorded
              in the audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quantity" htmlFor="wo-qty" required>
                <Input
                  id="wo-qty"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  max={available}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </Field>

              <Field label="Reason type" htmlFor="wo-type" required>
                <Select
                  id="wo-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as (typeof TYPES)[number]['value'])}
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {value > 0 ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Value written off</span>
                  <span className="tabular font-semibold text-destructive">{formatNaira(value)}</span>
                </div>
              </div>
            ) : null}

            <Field label="Reason" htmlFor="wo-reason" error={error ?? undefined} required>
              <Textarea
                id="wo-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Water damage found during warehouse inspection on 12 August"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submit} loading={pending}>
              Write off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
