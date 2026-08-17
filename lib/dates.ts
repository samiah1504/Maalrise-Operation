import { differenceInCalendarDays, format, parseISO } from 'date-fns'

/** 17 Aug 2026 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? parseISO(value) : value
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy')
}

/** 17 Aug 2026, 14:32 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? parseISO(value) : value
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy, HH:mm')
}

/** August 2026 */
export function formatMonth(year: number, month: number): string {
  return format(new Date(year, month - 1, 1), 'MMMM yyyy')
}

/** yyyy-MM-dd, for date inputs and Postgres date columns. */
export function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = typeof value === 'string' ? parseISO(value) : value
  return Number.isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM-dd')
}

export function today(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Positive when the date is in the future. */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null
  return differenceInCalendarDays(parseISO(value), new Date())
}

/** "in 5 days" / "3 days overdue" / "due today" */
export function describeDue(value: string | null | undefined): string {
  const days = daysUntil(value)
  if (days === null) return '—'
  if (days === 0) return 'Due today'
  if (days > 0) return `In ${days} day${days === 1 ? '' : 's'}`
  return `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`
}

/** The previous calendar month — the period a closing or report is usually for. */
export function previousMonth(): { year: number; month: number } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
