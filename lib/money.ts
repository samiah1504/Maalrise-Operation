/**
 * Money helpers.
 *
 * All stored money is `numeric(18,2)`. Supabase returns numerics as strings to
 * avoid float rounding, so everything here accepts `string | number | null`.
 *
 * Arithmetic that affects the books happens in Postgres, never here — these
 * functions are for display and for previewing a figure before it is posted.
 */

export type Money = string | number | null | undefined

/** Parses a database numeric into a JS number, defaulting to zero. */
export function toNumber(value: Money): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Rounds to kobo the same way Postgres `round(x, 2)` does. */
export function toKobo(value: Money): number {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100
}

const nairaFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactFormatter = new Intl.NumberFormat('en-NG', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** ₦1,234,567.89 */
export function formatNaira(value: Money): string {
  return nairaFormatter.format(toKobo(value))
}

/** ₦1.2M — for dashboard tiles where space is tight on a phone. */
export function formatNairaCompact(value: Money): string {
  const n = toKobo(value)
  if (Math.abs(n) < 100_000) return formatNaira(n)
  return `₦${compactFormatter.format(n)}`
}

/** Formats a foreign-currency amount with its ISO code, e.g. USD 6,680.00 */
export function formatForeign(value: Money, currency: string): string {
  const n = toKobo(value)
  return `${currency} ${new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`
}

/** Plain number with thousands separators — quantities, units, counts. */
export function formatNumber(value: Money, decimals = 0): string {
  return new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toNumber(value))
}

/** 15% from a stored rate of 0.15 */
export function formatPercent(rate: Money, decimals = 1): string {
  return `${(toNumber(rate) * 100).toFixed(decimals)}%`
}

/** Already-percentage values from the views (e.g. return_on_capital_pct). */
export function formatPercentValue(value: Money, decimals = 1): string {
  return `${toNumber(value).toFixed(decimals)}%`
}

/**
 * Converts a foreign amount to Naira at a captured rate.
 * The result is stored with the transaction and never recomputed from a later
 * rate — historical Naira values must not move when the market does.
 */
export function toNaira(amountForeign: Money, exchangeRate: Money): number {
  return toKobo(toNumber(amountForeign) * toNumber(exchangeRate))
}

/** Cost plus markup — previews the Murabaha selling price in the form. */
export function murabahaPrice(cost: Money, markupRate: Money) {
  const c = toKobo(cost)
  const profit = toKobo(c * toNumber(markupRate))
  return { cost: c, profit, price: toKobo(c + profit) }
}

/** Safe division for ratio tiles. */
export function ratio(numerator: Money, denominator: Money): number {
  const d = toNumber(denominator)
  return d === 0 ? 0 : toNumber(numerator) / d
}
