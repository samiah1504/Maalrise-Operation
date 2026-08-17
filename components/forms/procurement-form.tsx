'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { createProcurement } from '@/app/actions/finance'
import { formatNaira, toNaira, toNumber } from '@/lib/money'
import { today } from '@/lib/dates'
import { titleCase } from '@/lib/utils'

interface Line {
  key: string
  product_id: string
  quantity: string
  unit_price_foreign: string
}

const METHODS = ['quantity', 'weight', 'volume', 'value', 'manual'] as const

let counter = 0
const newLine = (): Line => ({
  key: `line-${counter++}`,
  product_id: '',
  quantity: '',
  unit_price_foreign: '',
})

/**
 * Creates a procurement batch with several products. Naira equivalents are
 * previewed here at the entered rate; the authoritative values are computed and
 * stored by the database when the batch is saved.
 */
export function ProcurementForm({
  suppliers,
  products,
  cycleId,
  cycleName,
}: {
  suppliers: { id: string; name: string; currency: string }[]
  products: { id: string; name: string; product_code: string; supplier_id: string | null; purchase_cost: string }[]
  cycleId: string
  cycleName: string
}) {
  const [open, setOpen] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [rate, setRate] = useState('')
  const [procurementDate, setProcurementDate] = useState(today())
  const [paymentDue, setPaymentDue] = useState('')
  const [productionStart, setProductionStart] = useState('')
  const [productionEnd, setProductionEnd] = useState('')
  const [shipmentDate, setShipmentDate] = useState('')
  const [arrivalDate, setArrivalDate] = useState('')
  const [allocation, setAllocation] = useState<(typeof METHODS)[number]>('value')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  // Only offer this supplier's products once a supplier is chosen.
  const available = useMemo(
    () => (supplierId ? products.filter((p) => p.supplier_id === supplierId) : products),
    [products, supplierId],
  )

  const totals = useMemo(() => {
    const foreign = lines.reduce(
      (sum, l) => sum + toNumber(l.quantity) * toNumber(l.unit_price_foreign),
      0,
    )
    return { foreign, naira: toNaira(foreign, rate || 0) }
  }, [lines, rate])

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await createProcurement({
        investment_cycle_id: cycleId,
        supplier_id: supplierId,
        procurement_date: procurementDate,
        currency,
        exchange_rate: rate,
        payment_due_date: paymentDue,
        production_start_date: productionStart,
        expected_production_completion: productionEnd,
        expected_shipment_date: shipmentDate,
        expected_arrival_date: arrivalDate,
        allocation_method: allocation,
        notes,
        items: lines
          .filter((l) => l.product_id && l.quantity && l.unit_price_foreign)
          .map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            unit_price_foreign: l.unit_price_foreign,
          })),
      })

      if (result.ok) {
        toast.success(result.message ?? 'Procurement created.')
        setOpen(false)
        setLines([newLine()])
        setSupplierId('')
        setRate('')
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
        New procurement
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New procurement batch</DialogTitle>
            <DialogDescription>
              {cycleName} · A batch number is assigned automatically and the batch goes for
              approval before any supplier payment can be recorded against it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Supplier" htmlFor="po-supplier" required>
                <Select
                  id="po-supplier"
                  value={supplierId}
                  onChange={(e) => {
                    setSupplierId(e.target.value)
                    const s = suppliers.find((x) => x.id === e.target.value)
                    if (s) setCurrency(s.currency)
                    setLines([newLine()])
                  }}
                >
                  <option value="">Select a supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Procurement date" htmlFor="po-date" required>
                <Input
                  id="po-date"
                  type="date"
                  value={procurementDate}
                  onChange={(e) => setProcurementDate(e.target.value)}
                />
              </Field>

              <Field label="Currency" htmlFor="po-currency" required>
                <Input
                  id="po-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                />
              </Field>

              <Field
                label="Exchange rate"
                htmlFor="po-rate"
                required
                hint={`Naira per 1 ${currency}. Stored with the batch and never recalculated later.`}
              >
                <Input
                  id="po-rate"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="1600"
                />
              </Field>
            </div>

            {/* --- Products ------------------------------------------------ */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Products</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLines((prev) => [...prev, newLine()])}
                >
                  <Plus className="h-4 w-4" />
                  Add product
                </Button>
              </div>

              <div className="space-y-3">
                {lines.map((line, index) => {
                  const lineTotal =
                    toNumber(line.quantity) * toNumber(line.unit_price_foreign)
                  return (
                    <div key={line.key} className="rounded-md border p-3">
                      <div className="grid gap-3 sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-end">
                        <Field label={`Product ${index + 1}`} htmlFor={`p-${line.key}`}>
                          <Select
                            id={`p-${line.key}`}
                            value={line.product_id}
                            onChange={(e) => {
                              const product = available.find((p) => p.id === e.target.value)
                              updateLine(line.key, {
                                product_id: e.target.value,
                                unit_price_foreign:
                                  line.unit_price_foreign ||
                                  (product ? String(toNumber(product.purchase_cost)) : ''),
                              })
                            }}
                          >
                            <option value="">Select…</option>
                            {available.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.product_code})
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <Field label="Quantity" htmlFor={`q-${line.key}`}>
                          <Input
                            id={`q-${line.key}`}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                          />
                        </Field>

                        <Field label={`Unit price (${currency})`} htmlFor={`u-${line.key}`}>
                          <Input
                            id={`u-${line.key}`}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            value={line.unit_price_foreign}
                            onChange={(e) =>
                              updateLine(line.key, { unit_price_foreign: e.target.value })
                            }
                          />
                        </Field>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove product"
                          disabled={lines.length === 1}
                          onClick={() =>
                            setLines((prev) => prev.filter((l) => l.key !== line.key))
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>

                      {lineTotal > 0 ? (
                        <p className="tabular mt-2 text-xs text-muted-foreground">
                          Line total: {currency} {lineTotal.toFixed(2)}
                          {toNumber(rate) > 0
                            ? ` · ${formatNaira(toNaira(lineTotal, rate))}`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>

            {totals.foreign > 0 ? (
              <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total purchase cost</span>
                  <span className="tabular font-medium">
                    {currency} {totals.foreign.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Naira equivalent</span>
                  <span className="tabular font-semibold">{formatNaira(totals.naira)}</span>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  Shipping, customs and clearing are added as cost lines after the batch is
                  approved; together they form the landed cost.
                </p>
              </div>
            ) : null}

            {/* --- Dates and allocation ------------------------------------ */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment due date" htmlFor="po-due">
                <Input id="po-due" type="date" value={paymentDue} onChange={(e) => setPaymentDue(e.target.value)} />
              </Field>
              <Field label="Production start" htmlFor="po-ps">
                <Input id="po-ps" type="date" value={productionStart} onChange={(e) => setProductionStart(e.target.value)} />
              </Field>
              <Field label="Expected production completion" htmlFor="po-pe">
                <Input id="po-pe" type="date" value={productionEnd} onChange={(e) => setProductionEnd(e.target.value)} />
              </Field>
              <Field label="Expected shipment date" htmlFor="po-sd">
                <Input id="po-sd" type="date" value={shipmentDate} onChange={(e) => setShipmentDate(e.target.value)} />
              </Field>
              <Field label="Expected arrival date" htmlFor="po-ad">
                <Input id="po-ad" type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />
              </Field>
              <Field
                label="Cost allocation method"
                htmlFor="po-alloc"
                required
                hint="How shared costs are spread across the products in this batch"
              >
                <Select
                  id="po-alloc"
                  value={allocation}
                  onChange={(e) => setAllocation(e.target.value as (typeof METHODS)[number])}
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      By {titleCase(m).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Notes" htmlFor="po-notes" error={error ?? undefined}>
              <Textarea id="po-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Create and send for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
