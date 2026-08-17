'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/form-controls'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

/**
 * Period selector for the statements. The balance sheet is deliberately not
 * affected — a position is always "as at now", never "for a month".
 */
export function ReportFilters({
  months,
  quarters,
}: {
  months: { value: string; label: string }[]
  quarters: { value: string; label: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const period = params.get('period') ?? 'cycle'

  function set(next: Record<string, string | null>) {
    const search = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value)
      else search.delete(key)
    }
    const qs = search.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div className="no-scrollbar mb-5 -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0">
      <Select
        value={period}
        aria-label="Period"
        className="h-9 w-auto min-w-[10rem] shrink-0 text-sm"
        onChange={(e) => set({ period: e.target.value, month: null, quarter: null })}
      >
        <option value="cycle">Whole cycle</option>
        <option value="month">By month</option>
        <option value="quarter">By quarter</option>
      </Select>

      {period === 'month' ? (
        <Select
          value={params.get('month') ?? ''}
          aria-label="Month"
          className="h-9 w-auto min-w-[10rem] shrink-0 text-sm"
          onChange={(e) => set({ month: e.target.value || null })}
        >
          <option value="">Select a month…</option>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      ) : null}

      {period === 'quarter' ? (
        <Select
          value={params.get('quarter') ?? ''}
          aria-label="Quarter"
          className="h-9 w-auto min-w-[10rem] shrink-0 text-sm"
          onChange={(e) => set({ quarter: e.target.value || null })}
        >
          <option value="">Select a quarter…</option>
          {quarters.map((q) => (
            <option key={q.value} value={q.value}>
              {q.label}
            </option>
          ))}
        </Select>
      ) : null}

      {period !== 'cycle' ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 shrink-0"
          onClick={() => router.replace(pathname, { scroll: false })}
        >
          <X className="h-4 w-4" />
          Reset
        </Button>
      ) : null}
    </div>
  )
}
