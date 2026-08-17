'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, Select, Textarea } from '@/components/ui/form-controls'
import { generateInvestorReport } from '@/app/actions/closing'
import { formatNaira } from '@/lib/money'

/**
 * Generates the monthly investor report. Figures come straight from the
 * cycle's own records; the only thing staff write is the management update.
 */
export function InvestorReportGenerator({
  cycleId,
  cycleName,
  periods,
  defaultYear,
  defaultMonth,
}: {
  cycleId: string
  cycleName: string
  periods: { year: number; month: number; label: string; netProfit: number }[]
  defaultYear: number
  defaultMonth: number
}) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState(`${defaultYear}-${defaultMonth}`)
  const [update, setUpdate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const selected = periods.find((p) => `${p.year}-${p.month}` === period)

  function submit() {
    setError(null)
    const [year, month] = period.split('-').map(Number)

    startTransition(async () => {
      const result = await generateInvestorReport({
        investment_cycle_id: cycleId,
        period_year: year,
        period_month: month,
        management_update: update,
      })

      if (result.ok) {
        toast.success(result.message ?? 'Report generated.')
        setOpen(false)
        setUpdate('')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4" />
        Generate report
      </Button>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate monthly investor report</DialogTitle>
            <DialogDescription>
              {cycleName} · Figures are taken from the cycle&apos;s records. Write a short update in
              plain language that a layperson can follow.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Reporting month" htmlFor="ir-period" required>
              <Select id="ir-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
                {periods.map((p) => (
                  <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>

            {selected ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {selected.netProfit >= 0 ? 'Profit' : 'Loss'} for {selected.label}
                  </span>
                  <span
                    className={
                      selected.netProfit >= 0
                        ? 'tabular font-semibold text-success'
                        : 'tabular font-semibold text-destructive'
                    }
                  >
                    {formatNaira(Math.abs(selected.netProfit))}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Provisional. Final distributable profit is determined only when the cycle closes.
                </p>
              </div>
            ) : null}

            <Field
              label="Management update"
              htmlFor="ir-update"
              error={error ?? undefined}
              hint="Major activities, progress made, challenges, and the outlook for next month."
            >
              <Textarea
                id="ir-update"
                rows={7}
                value={update}
                onChange={(e) => setUpdate(e.target.value)}
                placeholder="This month we completed two procurement batches from our Foshan supplier and cleared one container at Apapa…"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Generate report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
