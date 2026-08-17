import { describe, expect, it } from 'vitest'
import {
  formatForeign, formatNaira, formatNumber, formatPercent, murabahaPrice,
  ratio, toKobo, toNaira, toNumber,
} from '@/lib/money'

describe('parsing database numerics', () => {
  it('reads the strings PostgREST returns for numeric columns', () => {
    expect(toNumber('10688000.00')).toBe(10688000)
    expect(toNumber('0.15')).toBe(0.15)
    expect(toNumber(1600)).toBe(1600)
  })

  it('treats missing money as zero rather than NaN', () => {
    expect(toNumber(null)).toBe(0)
    expect(toNumber(undefined)).toBe(0)
    expect(toNumber('')).toBe(0)
    expect(toNumber('not a number')).toBe(0)
  })

  it('rounds to kobo the way Postgres round(x, 2) does', () => {
    expect(toKobo(1.005)).toBe(1.01)
    expect(toKobo(0.1 + 0.2)).toBe(0.3)
    expect(toKobo('14388000.204')).toBe(14388000.2)
  })
})

describe('foreign exchange', () => {
  it('converts at the captured rate', () => {
    expect(toNaira(6680, 1600)).toBe(10688000)
    expect(toNaira('210.50', '1585.75')).toBe(333800.38)
  })

  it('gives zero when either side is missing, never NaN', () => {
    expect(toNaira(null, 1600)).toBe(0)
    expect(toNaira(6680, null)).toBe(0)
  })
})

describe('Murabaha pricing', () => {
  it('discloses cost, profit and the final price separately', () => {
    const result = murabahaPrice(14388000, 0.15)
    expect(result.cost).toBe(14388000)
    expect(result.profit).toBe(2158200)
    expect(result.price).toBe(16546200)
  })

  it('always leaves price equal to cost plus profit, to the kobo', () => {
    for (const cost of [1, 999.99, 123456.78, 14388000.2]) {
      for (const markup of [0, 0.075, 0.15, 0.335]) {
        const result = murabahaPrice(cost, markup)
        expect(toKobo(result.cost + result.profit)).toBe(result.price)
      }
    }
  })

  it('handles a zero markup — a sale at cost is still a valid contract', () => {
    const result = murabahaPrice(500000, 0)
    expect(result.profit).toBe(0)
    expect(result.price).toBe(500000)
  })
})

describe('formatting', () => {
  it('shows Naira with the symbol, separators and two decimals', () => {
    expect(formatNaira(10688000)).toBe('₦10,688,000.00')
    expect(formatNaira('1234.5')).toBe('₦1,234.50')
    expect(formatNaira(null)).toBe('₦0.00')
  })

  it('shows negative money with a leading minus, not brackets', () => {
    expect(formatNaira(-688000)).toBe('-₦688,000.00')
  })

  it('shows foreign currency with its code and never a Naira symbol', () => {
    expect(formatForeign(6680, 'USD')).toBe('USD 6,680.00')
    expect(formatForeign('210.5', 'CNY')).toBe('CNY 210.50')
  })

  it('shows a stored rate as a percentage', () => {
    expect(formatPercent(0.15)).toBe('15.0%')
    expect(formatPercent(0.075, 2)).toBe('7.50%')
  })

  it('formats quantities without a currency', () => {
    expect(formatNumber(1250)).toBe('1,250')
    expect(formatNumber('12.5', 1)).toBe('12.5')
  })
})

describe('ratio', () => {
  it('never divides by zero', () => {
    expect(ratio(100, 0)).toBe(0)
    expect(ratio(50, 200)).toBe(0.25)
  })
})
