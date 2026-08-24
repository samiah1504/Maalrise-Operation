/**
 * Pagination helpers shared by server components and the client-side
 * <Pagination> control. This file must stay free of 'use client' — server
 * pages call these as plain functions, which Next.js forbids for exports of
 * client modules.
 */

export const PAGE_SIZE = 25

/** Reads the current page from the URL. Used by the server component. */
export function pageFrom(searchParams: Record<string, string | undefined>) {
  const page = Number(searchParams.page ?? 1)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

export function rangeFor(page: number, size = PAGE_SIZE) {
  const from = (page - 1) * size
  return { from, to: from + size - 1 }
}
