'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { createMurabahaSale } from '@/app/actions/finance'
import { formatNaira, formatNumber, murabahaPrice, toNumber } from '@/lib/money'
import { today } from '@/lib/dates'
import { addDays, format, parseISO } from 'date-fns'

export interface SellableLot {
  inventory_lot_id: string
  product_name: string
  product_code: string
  batch_number: string
  quantity_available: string
  unit_landed_cost: string
}

/**
 * Builds a Murābaḥah contract from inventory MaalRise already owns.
 *
 * The disclosed cost is the finalised landed cost of the lots selected — it is
 * never a guess. Creating the sale reserves the stock; approving it fixes the
 * price for good.
 */
export function MurabahaForm({
  businesses,
  lots,
  cycleId,
  cycleName,
  defaultMarkup,
  defaultRepaymentDays,
}: {
  businesses: { id: string; name: string; standard_repayment_days: number }[]
  lots: SellableLot[]
  cycleId: string
  cycleName: string
  defaultMarkup: number
  defaultRepaymentDays: number
}) {
  const [open, setOpen] = useState(false)
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? '')
  const [saleDate, setSaleDate] = useState(today())
  const [markup, setMarkup] = useState(String(defaultMarkup))
  const [days, setDays] = useState(String(defaultRepaymentDays))
  const [notes, setNotes] = useState('')
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const cost = useMemo(
    () =>
      lots.reduce((sum, lot) => {
        const qty = toNumber(selected[lot.inventory_lot_id])
        return sum + qty * toNumber(lot.unit_landed_cost)
      }, 0),
    [lots, selected],
  )

  const pricing = murabahaPrice(cost, markup || 0)
  const dueDate = saleDate
    ? format(addDays(parseISO(saleDate), Number(days) || 0), 'd MMM yyyy')
    : '—'

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await createMurabahaSale(
        {
          business_id: businessId,
          investment_cycle_id: cycleId,
          sale_date: saleDate,
          markup_rate: markup,
          repayment_period_days: days,
          notes,
          items: Object.entries(selected)
            .filter(([, qty]) => toNumber(qty) > 0)
            .map(([inventory_lot_id, quantity]) => ({ inventory_lot_id, quantity })),
        },
        'Murabaha sale prepared from received inventory',
      )

      if (result.ok) {
        toast.success(result.message ?? 'Sale prepared.')
        setOpen(false)
        setSelected({})
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
        New Murābaḥah sale
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New Murābaḥah sale</DialogTitle>
            <DialogDescription>
              {cycleName} · Cost-plus sale of goods MaalRise already owns. Only batches with a
              finalised landed cost can be sold.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business" htmlFor="mur-business" required>
                <Select
                  id="mur-business"
                  value={businessId}
                  onChange={(e) => {
                    setBusinessId(e.target.value)
                    const b = businesses.find((x) => x.id === e.target.value)
                    if (b) setDays(String(b.standard_repayment_days))
                  }}
                >
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Sale date" htmlFor="mur-date" required>
                <Input id="mur-date" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
              </Field>
            </div>

            {/* --- Lot selection ------------------------------------------- */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Goods to sell</h3>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-2">
                {lots.map((lot) => {
                  const available = toNumber(lot.quantity_available)
                  const qty = selected[lot.inventory_lot_id] ?? ''
                  return (
                    <div
                      key={lot.inventory_lot_id}
                      className="flex flex-wrap items-end justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{lot.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {lot.product_code} · {lot.batch_number} · {formatNumber(available)}{' '}
                          available at {formatNaira(lot.unit_landed_cost)} each
                        </p>
                      </div>
                      <div className="flex items-end gap-2">
                        <Field label="Quantity" htmlFor={`lot-${lot.inventory_lot_id}`}>
                          <Input
                            id={`lot-${lot.inventory_lot_id}`}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            max={available}
                            className="w-28"
                            value={qty}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [lot.inventory_lot_id]: e.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSelected((prev) => ({
                              ...prev,
                              [lot.inventory_lot_id]: String(available),
                            }))
                          }
                        >
                          All
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Agreed markup"
                htmlFor="mur-markup"
                required
                hint="As a rate — 0.15 means 15% on cost"
              >
                <Input
                  id="mur-markup"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={markup}
                  onChange={(e) => setMarkup(e.target.value)}
                />
              </Field>

              <Field
                label="Repayment period (days)"
                htmlFor="mur-days"
                required
                hint={`Due ${dueDate}`}
              >
                <Input
                  id="mur-days"
                  type="number"
                  inputMode="numeric"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </Field>
            </div>

            {/* --- The Murabaha disclosure --------------------------------- */}
            {cost > 0 ? (
              <div className="space-y-2 rounded-md border border-gold/40 bg-gold-muted p-4 text-sm">
                <p className="font-medium">Murābaḥah disclosure</p>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">MaalRise&apos;s disclosed cost</span>
                  <span className="tabular font-medium">{formatNaira(pricing.cost)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Murābaḥah profit ({(toNumber(markup) * 100).toFixed(1)}%)
                  </span>
                  <span className="tabular font-medium">{formatNaira(pricing.profit)}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="font-medium">Final selling price</span>
                  <span className="tabular text-base font-semibold">{formatNaira(pricing.price)}</span>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  Once approved, this price is fixed. Late repayment will never increase the amount
                  owed.
                </p>
              </div>
            ) : null}

            <Field label="Notes" htmlFor="mur-notes" error={error ?? undefined}>
              <Textarea id="mur-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending} disabled={cost <= 0}>
              Prepare sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
