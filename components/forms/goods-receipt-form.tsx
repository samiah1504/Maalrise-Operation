'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PackagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { createGoodsReceipt } from '@/app/actions/finance'
import { formatNaira, formatNumber, toNumber } from '@/lib/money'
import { today } from '@/lib/dates'

export interface ReceivableItem {
  procurement_item_id: string
  product_id: string
  product_name: string
  product_code: string
  outstanding: number
  landed_cost_per_unit: string
}

interface Line {
  quantity_received: string
  damaged_quantity: string
  rejected_quantity: string
  notes: string
}

/**
 * Records what physically arrived. Sellable quantity is derived as
 * received − damaged − rejected; the value only moves out of Cash in Stock and
 * into Inventory when the receipt is confirmed.
 */
export function GoodsReceiptForm({
  batches,
  warehouses,
  itemsByBatch,
}: {
  batches: { id: string; batch_number: string; landed_cost_finalised: boolean }[]
  warehouses: { id: string; name: string }[]
  itemsByBatch: Record<string, ReceivableItem[]>
}) {
  const [open, setOpen] = useState(false)
  const [batchId, setBatchId] = useState('')
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '')
  const [date, setDate] = useState(today())
  const [inspection, setInspection] = useState('')
  const [lines, setLines] = useState<Record<string, Line>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const items = useMemo(() => itemsByBatch[batchId] ?? [], [itemsByBatch, batchId])
  const batch = batches.find((b) => b.id === batchId)

  function lineFor(id: string): Line {
    return lines[id] ?? { quantity_received: '', damaged_quantity: '', rejected_quantity: '', notes: '' }
  }

  function updateLine(id: string, patch: Partial<Line>) {
    setLines((prev) => ({ ...prev, [id]: { ...lineFor(id), ...patch } }))
  }

  const preview = items.reduce(
    (acc, item) => {
      const line = lineFor(item.procurement_item_id)
      const sellable = Math.max(
        toNumber(line.quantity_received) -
          toNumber(line.damaged_quantity) -
          toNumber(line.rejected_quantity),
        0,
      )
      return {
        sellable: acc.sellable + sellable,
        value: acc.value + sellable * toNumber(item.landed_cost_per_unit),
      }
    },
    { sellable: 0, value: 0 },
  )

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await createGoodsReceipt({
        procurement_order_id: batchId,
        warehouse_id: warehouseId,
        received_date: date,
        inspection_notes: inspection,
        items: items
          .filter((i) => toNumber(lineFor(i.procurement_item_id).quantity_received) > 0)
          .map((i) => {
            const line = lineFor(i.procurement_item_id)
            return {
              procurement_item_id: i.procurement_item_id,
              product_id: i.product_id,
              expected_quantity: i.outstanding,
              quantity_received: line.quantity_received,
              damaged_quantity: line.damaged_quantity || 0,
              rejected_quantity: line.rejected_quantity || 0,
              notes: line.notes,
            }
          }),
      })

      if (result.ok) {
        toast.success(result.message ?? 'Goods receipt created.')
        setOpen(false)
        setBatchId('')
        setLines({})
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
        <PackagePlus className="h-4 w-4" />
        Record goods receipt
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Record goods receipt</DialogTitle>
            <DialogDescription>
              Enter what actually arrived. Partial receipts are supported — the remainder stays
              open on the batch.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Procurement batch" htmlFor="grn-batch" required>
                <Select
                  id="grn-batch"
                  value={batchId}
                  onChange={(e) => {
                    setBatchId(e.target.value)
                    setLines({})
                  }}
                >
                  <option value="">Select a batch…</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batch_number}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Warehouse" htmlFor="grn-warehouse" required>
                <Select
                  id="grn-warehouse"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Date received" htmlFor="grn-date" required>
                <Input id="grn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>

            {batch && !batch.landed_cost_finalised ? (
              <p className="rounded-md bg-warning/10 p-3 text-sm text-warning">
                Landed cost for this batch has not been finalised. Goods will be valued at the
                current provisional landed cost, and the batch cannot be sold under Murābaḥah
                until the landed cost is finalised.
              </p>
            ) : null}

            {batchId && items.length === 0 ? (
              <p className="rounded-md border p-3 text-sm text-muted-foreground">
                Every line on this batch has already been received in full.
              </p>
            ) : null}

            {items.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Lines</h3>
                {items.map((item) => {
                  const line = lineFor(item.procurement_item_id)
                  const sellable = Math.max(
                    toNumber(line.quantity_received) -
                      toNumber(line.damaged_quantity) -
                      toNumber(line.rejected_quantity),
                    0,
                  )
                  const missing = Math.max(
                    item.outstanding - toNumber(line.quantity_received),
                    0,
                  )

                  return (
                    <div key={item.procurement_item_id} className="rounded-md border p-3">
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">{item.product_code}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Expected {formatNumber(item.outstanding)} ·{' '}
                          {formatNaira(item.landed_cost_per_unit)} per unit
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Quantity received" htmlFor={`r-${item.procurement_item_id}`}>
                          <Input
                            id={`r-${item.procurement_item_id}`}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            max={item.outstanding}
                            value={line.quantity_received}
                            onChange={(e) =>
                              updateLine(item.procurement_item_id, { quantity_received: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Damaged" htmlFor={`d-${item.procurement_item_id}`}>
                          <Input
                            id={`d-${item.procurement_item_id}`}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            value={line.damaged_quantity}
                            onChange={(e) =>
                              updateLine(item.procurement_item_id, { damaged_quantity: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Rejected" htmlFor={`x-${item.procurement_item_id}`}>
                          <Input
                            id={`x-${item.procurement_item_id}`}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            value={line.rejected_quantity}
                            onChange={(e) =>
                              updateLine(item.procurement_item_id, { rejected_quantity: e.target.value })
                            }
                          />
                        </Field>
                      </div>

                      {toNumber(line.quantity_received) > 0 ? (
                        <p className="tabular mt-2 text-xs text-muted-foreground">
                          Sellable {formatNumber(sellable)} · missing {formatNumber(missing)} ·
                          value {formatNaira(sellable * toNumber(item.landed_cost_per_unit))}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}

            {preview.sellable > 0 ? (
              <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total sellable units</span>
                  <span className="tabular font-medium">{formatNumber(preview.sellable)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Value entering inventory</span>
                  <span className="tabular font-semibold">{formatNaira(preview.value)}</span>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  This value moves out of Cash in Stock and into Inventory when the receipt is
                  confirmed.
                </p>
              </div>
            ) : null}

            <Field label="Inspection notes" htmlFor="grn-notes" error={error ?? undefined}>
              <Textarea
                id="grn-notes"
                rows={2}
                value={inspection}
                onChange={(e) => setInspection(e.target.value)}
                placeholder="Condition on arrival, packaging, discrepancies…"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending} disabled={preview.sellable === 0}>
              Create goods receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
