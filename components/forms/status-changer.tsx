'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Select, Textarea } from '@/components/ui/form-controls'
import { changeStatus } from '@/app/actions/records'
import {
  CYCLE, GOODS_RECEIPT, MURABAHA, PROCUREMENT, SHIPMENT, SUPPLIER, type Machine,
} from '@/lib/status'
import { titleCase } from '@/lib/utils'

const MACHINES = {
  cycle: CYCLE,
  procurement: PROCUREMENT,
  shipment: SHIPMENT,
  goodsReceipt: GOODS_RECEIPT,
  murabaha: MURABAHA,
  supplier: SUPPLIER,
} as const satisfies Record<string, Machine<string>>

export type MachineName = keyof typeof MACHINES

type Table =
  | 'procurement_orders' | 'shipments' | 'goods_receipts' | 'investment_cycles'
  | 'suppliers' | 'businesses' | 'investors' | 'murabaha_sales'

/**
 * Moves a record along its status machine. Only transitions the machine allows
 * are offered, and the reason is written to the audit trail — the database
 * rejects anything else.
 */
export function StatusChanger({
  table,
  id,
  current,
  machine,
  revalidate = [],
  label = 'Update status',
}: {
  table: Table
  id: string
  current: string
  machine: MachineName
  revalidate?: string[]
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const options = (MACHINES[machine].transitions as Record<string, readonly string[]>)[current] ?? []

  if (options.length === 0) {
    return null
  }

  function submit() {
    if (!status) {
      setError('Choose the new status.')
      return
    }
    if (reason.trim().length < 3) {
      setError('Give a short reason — it is written to the audit trail.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await changeStatus(table, id, status, reason.trim(), revalidate)
      if (result.ok) {
        toast.success(result.message ?? 'Status updated.')
        setOpen(false)
        setStatus('')
        setReason('')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ArrowRight className="h-4 w-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update status</DialogTitle>
            <DialogDescription>
              Currently <strong>{titleCase(current)}</strong>. Only the next valid steps are shown.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="New status" htmlFor="new-status" required>
              <Select
                id="new-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Select…</option>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {titleCase(o)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Reason" htmlFor="status-reason" error={error ?? undefined} required>
              <Textarea
                id="status-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Supplier confirmed production started"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Update status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
