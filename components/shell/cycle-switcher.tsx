'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { CalendarClock } from 'lucide-react'
import { Select } from '@/components/ui/form-controls'
import { selectCycle } from '@/app/actions/cycle'
import type { CycleSummary } from '@/lib/database.types'

/**
 * Every page is scoped to one investment cycle. Switching writes a cookie and
 * refreshes the current route, so nothing aggregates across cycles by accident.
 */
export function CycleSwitcher({
  cycles,
  selectedId,
}: {
  cycles: Pick<CycleSummary, 'investment_cycle_id' | 'name' | 'code' | 'status'>[]
  selectedId: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (!cycles.length) return null

  return (
    <label className="flex min-w-0 items-center gap-2">
      <CalendarClock className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
      <span className="sr-only">Investment cycle</span>
      <Select
        value={selectedId ?? ''}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value
          startTransition(async () => {
            await selectCycle(id)
            router.refresh()
          })
        }}
        className="h-9 max-w-[190px] text-sm sm:max-w-[240px]"
      >
        {cycles.map((c) => (
          <option key={c.investment_cycle_id} value={c.investment_cycle_id}>
            {c.name}
          </option>
        ))}
      </Select>
    </label>
  )
}
