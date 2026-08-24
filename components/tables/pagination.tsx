'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/money'
import { PAGE_SIZE } from '@/lib/pagination'

export function Pagination({
  page,
  total,
  pageSize = PAGE_SIZE,
}: {
  page: number
  total: number
  pageSize?: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) {
    return (
      <p className="py-3 text-center text-xs text-muted-foreground">
        {formatNumber(total)} record{total === 1 ? '' : 's'}
      </p>
    )
  }

  function go(next: number) {
    const search = new URLSearchParams(params.toString())
    if (next <= 1) search.delete('page')
    else search.set('page', String(next))
    const qs = search.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: true })
  }

  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <p className="text-xs text-muted-foreground">
        {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only">Previous</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => go(page + 1)}
        >
          <span className="sr-only sm:not-sr-only">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
