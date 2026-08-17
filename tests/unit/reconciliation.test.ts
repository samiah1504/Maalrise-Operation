import { describe, expect, it } from 'vitest'
import { toKobo } from '@/lib/money'

/**
 * The single accounting rule the whole system rests on (brief §5, §29.9):
 *
 *   Total Business Assets = Cash at Hand + Cash in Stock + Inventory Value
 *                         + Outstanding Receivables + Other Assets
 *
 * with no naira in two buckets at once. This test walks the full capital cycle
 * the way the database does, asserting the identity holds at every stage, and
 * that assets always equal capital + gross profit − expenses.
 *
 * The same journey is run against real SQL in supabase/tests/01_full_cycle.sql.
 */

interface Position {
  cashAtHand: number
  cashInStock: number
  inventory: number
  receivables: number
  capitalIntroduced: number
  grossProfit: number
  expenses: number
}

const start = (capital: number): Position => ({
  cashAtHand: capital,
  cashInStock: 0,
  inventory: 0,
  receivables: 0,
  capitalIntroduced: capital,
  grossProfit: 0,
  expenses: 0,
})

const totalAssets = (p: Position) =>
  toKobo(p.cashAtHand + p.cashInStock + p.inventory + p.receivables)

const expected = (p: Position) =>
  toKobo(p.capitalIntroduced + p.grossProfit - p.expenses)

/** Paying a supplier moves cash into stock; nothing is created or destroyed. */
const paySupplier = (p: Position, amount: number): Position => ({
  ...p,
  cashAtHand: toKobo(p.cashAtHand - amount),
  cashInStock: toKobo(p.cashInStock + amount),
})

/** Receiving goods turns cash in stock into inventory at landed cost. */
const receiveGoods = (p: Position, landedValue: number): Position => ({
  ...p,
  cashInStock: toKobo(p.cashInStock - landedValue),
  inventory: toKobo(p.inventory + landedValue),
})

/** Approving a sale swaps inventory for a receivable, and books the profit. */
const sell = (p: Position, cost: number, markup: number): Position => {
  const profit = toKobo(cost * markup)
  return {
    ...p,
    inventory: toKobo(p.inventory - cost),
    receivables: toKobo(p.receivables + cost + profit),
    grossProfit: toKobo(p.grossProfit + profit),
  }
}

/** A repayment turns a receivable back into cash, ready to redeploy. */
const repay = (p: Position, amount: number): Position => ({
  ...p,
  receivables: toKobo(p.receivables - amount),
  cashAtHand: toKobo(p.cashAtHand + amount),
})

const payExpense = (p: Position, amount: number): Position => ({
  ...p,
  cashAtHand: toKobo(p.cashAtHand - amount),
  expenses: toKobo(p.expenses + amount),
})

describe('one full capital cycle', () => {
  const CAPITAL = 10_000_000
  const PURCHASE = 10_688_000
  const DIRECT_COSTS = 3_700_000
  const LANDED = PURCHASE + DIRECT_COSTS
  const MARKUP = 0.15
  const RENT = 350_000

  it('holds the asset identity at every stage of the journey', () => {
    const stages: Position[] = []

    let p = start(CAPITAL)
    stages.push(p)

    p = paySupplier(p, PURCHASE)
    stages.push(p)

    p = paySupplier(p, DIRECT_COSTS)
    stages.push(p)

    p = receiveGoods(p, LANDED)
    stages.push(p)

    p = sell(p, LANDED, MARKUP)
    stages.push(p)

    p = payExpense(p, RENT)
    stages.push(p)

    p = repay(p, 5_000_000)
    stages.push(p)

    p = repay(p, toKobo(LANDED * (1 + MARKUP) - 5_000_000))
    stages.push(p)

    for (const [index, stage] of stages.entries()) {
      expect(totalAssets(stage), `stage ${index}`).toBe(expected(stage))
    }
  })

  it('ends with everything back in cash — the capital has completed one recycle', () => {
    let p = start(CAPITAL)
    p = paySupplier(p, PURCHASE)
    p = paySupplier(p, DIRECT_COSTS)
    p = receiveGoods(p, LANDED)
    p = sell(p, LANDED, MARKUP)
    p = payExpense(p, RENT)
    p = repay(p, toKobo(LANDED * (1 + MARKUP)))

    expect(p.cashInStock).toBe(0)
    expect(p.inventory).toBe(0)
    expect(p.receivables).toBe(0)
    expect(p.cashAtHand).toBe(expected(p))
    // Matches the figure the SQL end-to-end test asserts.
    expect(p.cashAtHand).toBe(11_808_200)
  })

  it('counts money spent on a batch once, not in both cash buckets', () => {
    const before = start(CAPITAL)
    const after = paySupplier(before, PURCHASE)

    expect(totalAssets(after)).toBe(totalAssets(before))
    expect(after.cashAtHand).toBe(toKobo(before.cashAtHand - PURCHASE))
    expect(after.cashInStock).toBe(PURCHASE)
  })

  it('counts goods once, as stock or as a receivable, never both', () => {
    let p = start(CAPITAL)
    p = paySupplier(p, LANDED)
    p = receiveGoods(p, LANDED)

    const sold = sell(p, LANDED, MARKUP)
    expect(sold.inventory).toBe(0)
    expect(sold.receivables).toBe(toKobo(LANDED * (1 + MARKUP)))
    // The only change to total assets is the profit now earned.
    expect(totalAssets(sold)).toBe(toKobo(totalAssets(p) + sold.grossProfit))
  })

  it('reduces assets by exactly the expense paid', () => {
    const before = start(CAPITAL)
    const after = payExpense(before, RENT)
    expect(totalAssets(after)).toBe(toKobo(totalAssets(before) - RENT))
    expect(totalAssets(after)).toBe(expected(after))
  })

  it('holds through a partially received batch', () => {
    let p = start(20_000_000)
    p = paySupplier(p, 12_000_000)
    // Only two thirds of the batch arrives; the rest is still cash in stock.
    p = receiveGoods(p, 8_000_000)

    expect(p.cashInStock).toBe(4_000_000)
    expect(p.inventory).toBe(8_000_000)
    expect(totalAssets(p)).toBe(expected(p))
  })

  it('holds when the business only partly repays', () => {
    let p = start(CAPITAL)
    p = paySupplier(p, LANDED)
    p = receiveGoods(p, LANDED)
    p = sell(p, LANDED, MARKUP)
    p = repay(p, 5_000_000)

    expect(p.receivables).toBeGreaterThan(0)
    expect(totalAssets(p)).toBe(expected(p))
  })
})

describe('capital recycling', () => {
  it('reports how many times the capital has been turned over', () => {
    const capital = 10_000_000
    const deployed = 24_000_000
    expect(Number((deployed / capital).toFixed(2))).toBe(2.4)
  })

  it('reports return on capital per batch', () => {
    const deployed = 14_388_000
    const profit = 2_158_200
    expect(Number(((profit / deployed) * 100).toFixed(1))).toBe(15)
  })
})
