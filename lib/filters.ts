import { titleCase } from '@/lib/utils'

/**
 * Filter definitions shared by server components and the client-side
 * <ListFilters> control. This file must stay free of 'use client' — server
 * pages call enumFilter() as a plain function, which Next.js forbids for
 * exports of client modules.
 */

export interface FilterDef {
  /** Query-string key. */
  name: string
  label: string
  options: { value: string; label: string }[]
}

/** Builds a filter definition from an enum's values. */
export function enumFilter(name: string, label: string, values: readonly string[]): FilterDef {
  return {
    name,
    label,
    options: values.map((v) => ({ value: v, label: titleCase(v) })),
  }
}
