/**
 * Chart palette.
 *
 * The categorical slots are the validated default set, in fixed order — a
 * series keeps its colour regardless of how many series are on screen.
 * Validated with the dataviz palette checker against both the light (#ffffff)
 * and dark (#12211c) chart surfaces: lightness band, chroma floor, adjacent CVD
 * separation (worst ΔE 9.1 light / 8.4 dark) and normal-vision floor all pass.
 *
 * Three light-mode slots fall below 3:1 against white, so every chart using
 * them ships direct labels and a value legend — never colour alone.
 */

export const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500'],
} as const

/** Single-measure charts use the MaalRise green rather than a categorical slot. */
export const BRAND = {
  light: { primary: '#0f4c37', gold: '#b58a2b', muted: '#e3e0d6' },
  dark: { primary: '#37a07a', gold: '#d9ab48', muted: '#25322c' },
} as const

/** Profit and loss are a polarity, not two categories. */
export const POLARITY = {
  light: { positive: '#1baf7a', negative: '#c8352f' },
  dark: { positive: '#199e70', negative: '#e66767' },
} as const

export const AXIS = {
  light: { text: '#5b6b64', grid: '#e8e5dc' },
  dark: { text: '#9bada5', grid: '#25322c' },
} as const

export type Mode = 'light' | 'dark'

/** The four buckets that make up Total Business Assets, in fixed slot order. */
export const ASSET_SLOTS = [
  { key: 'cash_at_hand', label: 'Cash at Hand', slot: 0 },
  { key: 'cash_in_stock', label: 'Cash in Stock', slot: 1 },
  { key: 'inventory_value', label: 'Inventory', slot: 2 },
  { key: 'outstanding_receivables', label: 'Receivables', slot: 3 },
] as const
