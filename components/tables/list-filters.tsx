'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Input, Select } from '@/components/ui/form-controls'
import { Button } from '@/components/ui/button'
import type { FilterDef } from '@/lib/filters'

/**
 * Search, filters and sorting for every list, driven entirely by the URL so a
 * filtered view can be bookmarked, shared and reloaded. On phones the filters
 * scroll horizontally rather than stacking into a tall wall of selects.
 */
export function ListFilters({
  searchPlaceholder = 'Search…',
  filters = [],
  sortOptions = [],
}: {
  searchPlaceholder?: string
  filters?: FilterDef[]
  sortOptions?: { value: string; label: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')

  const push = useCallback(
    (next: URLSearchParams) => {
      next.delete('page')
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router],
  )

  // Debounce the search so we do not navigate on every keystroke.
  useEffect(() => {
    const current = params.get('q') ?? ''
    if (query === current) return

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (query) next.set('q', query)
      else next.delete('q')
      push(next)
    }, 350)

    return () => clearTimeout(timer)
  }, [query, params, push])

  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(name, value)
    else next.delete(name)
    push(next)
  }

  const activeCount =
    filters.filter((f) => params.get(f.name)).length + (params.get('q') ? 1 : 0)

  return (
    <div className="mb-4 space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
          type="search"
          aria-label="Search"
        />
      </div>

      {filters.length || sortOptions.length ? (
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {filters.map((filter) => (
            <Select
              key={filter.name}
              value={params.get(filter.name) ?? ''}
              onChange={(e) => setFilter(filter.name, e.target.value)}
              aria-label={filter.label}
              className="h-9 w-auto min-w-[9.5rem] shrink-0 text-sm"
            >
              <option value="">All {filter.label.toLowerCase()}</option>
              {filter.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ))}

          {sortOptions.length ? (
            <Select
              value={params.get('sort') ?? ''}
              onChange={(e) => setFilter('sort', e.target.value)}
              aria-label="Sort"
              className="h-9 w-auto min-w-[9.5rem] shrink-0 text-sm"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ) : null}

          {activeCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 shrink-0"
              onClick={() => {
                setQuery('')
                router.replace(pathname, { scroll: false })
              }}
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
