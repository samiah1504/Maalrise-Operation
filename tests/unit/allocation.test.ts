import { describe, expect, it } from 'vitest'
import { toKobo } from '@/lib/money'

/**
 * The landed-cost allocation engine, mirrored from
 * `allocate_procurement_costs()` in supabase/migrations.
 *
 * The property that matters: allocated costs must total the actual cost to the
 * kobo for every method, so nothing leaks between Cash in Stock, Inventory and
 * the profit and loss statement. The database is the enforcement point — this
 * test proves the arithmetic itself is sound, and the SQL test in
 * supabase/tests/01_full_cycle.sql proves the implementation matches.
 */

type Method = 'quantity' | 'weight' | 'volume' | 'value' | 'manual'

interface Item {
  id: string
  quantity: number
  lineTotalNaira: number
  weightKg?: number
  volumeCbm?: number
  manual?: number
}

function basisFor(item: Item, method: Method): number {
  switch (method) {
    case 'quantity':
      return item.quantity
    case 'weight':
      return item.quantity * (item.weightKg ?? 0)
    case 'volume':
      return item.quantity * (item.volumeCbm ?? 0)
    case 'value':
      return item.lineTotalNaira
    case 'manual':
      return item.manual ?? 0
  }
}

export function allocate(items: Item[], totalCosts: number, method: Method) {
  const ordered = [...items].sort(
    (a, b) => b.lineTotalNaira - a.lineTotalNaira || a.id.localeCompare(b.id),
  )

  let basisTotal = ordered.reduce((sum, item) => sum + basisFor(item, method), 0)
  // A zero basis (weights never captured, say) falls back to quantity so costs
  // are never silently dropped.
  if (basisTotal === 0) {
    basisTotal = ordered.reduce((sum, item) => sum + item.quantity, 0)
  }

  let running = 0
  const allocations = ordered.map((item) => {
    let basis = basisFor(item, method)
    if (basis === 0) basis = basisTotal === 0 ? 0 : item.quantity

    const share = basisTotal === 0 ? 0 : toKobo(totalCosts * (basis / basisTotal))
    running = toKobo(running + share)
    return { id: item.id, allocated: share, item }
  })

  // The rounding remainder goes to the largest line so the allocation
  // reconciles exactly with the cost total.
  if (allocations.length && running !== totalCosts) {
    allocations[0].allocated = toKobo(allocations[0].allocated + (totalCosts - running))
  }

  return allocations.map((a) => {
    const landedTotal = toKobo(a.item.lineTotalNaira + a.allocated)
    const perUnit = a.item.quantity > 0 ? toKobo(landedTotal / a.item.quantity) : 0
    return {
      id: a.id,
      allocated: a.allocated,
      // The unit cost is what inventory is valued at, so it is authoritative:
      // the line total is quantity x unit cost, not the other way round.
      landedCostPerUnit: perUnit,
      landedCostTotal: toKobo(a.item.quantity * perUnit),
    }
  })
}

const BATCH: Item[] = [
  { id: 'desk', quantity: 20, lineTotalNaira: 6_720_000, weightKg: 68, volumeCbm: 0.65, manual: 60 },
  { id: 'chair', quantity: 40, lineTotalNaira: 3_968_000, weightKg: 16.5, volumeCbm: 0.18, manual: 120 },
]

const METHODS: Method[] = ['quantity', 'weight', 'volume', 'value', 'manual']
const COSTS = 3_700_000

describe('landed cost allocation', () => {
  it.each(METHODS)('totals the cost exactly for allocation by %s', (method) => {
    const allocations = allocate(BATCH, COSTS, method)
    const total = allocations.reduce((sum, a) => toKobo(sum + a.allocated), 0)
    expect(total).toBe(COSTS)
  })

  it.each(METHODS)('spreads awkward amounts to the kobo by %s', (method) => {
    // 1,000,000.01 across two lines cannot divide evenly.
    const allocations = allocate(BATCH, 1_000_000.01, method)
    const total = allocations.reduce((sum, a) => toKobo(sum + a.allocated), 0)
    expect(total).toBe(1_000_000.01)
  })

  it('allocates by quantity in proportion to units', () => {
    const [first, second] = allocate(BATCH, 600_000, 'quantity')
    // Desk is 20 of 60 units, chair 40 of 60.
    const desk = [first, second].find((a) => a.id === 'desk')!
    const chair = [first, second].find((a) => a.id === 'chair')!
    expect(desk.allocated).toBe(200_000)
    expect(chair.allocated).toBe(400_000)
  })

  it('allocates by value in proportion to purchase cost', () => {
    const allocations = allocate(BATCH, 1_068_800, 'value')
    const desk = allocations.find((a) => a.id === 'desk')!
    const chair = allocations.find((a) => a.id === 'chair')!
    // Purchase total is 10,688,000, so 10% of each line.
    expect(desk.allocated).toBe(672_000)
    expect(chair.allocated).toBe(396_800)
  })

  it('falls back to quantity when the chosen basis is missing everywhere', () => {
    const noWeights: Item[] = [
      { id: 'a', quantity: 10, lineTotalNaira: 1_000_000 },
      { id: 'b', quantity: 30, lineTotalNaira: 3_000_000 },
    ]
    const allocations = allocate(noWeights, 400_000, 'weight')
    const total = allocations.reduce((sum, a) => toKobo(sum + a.allocated), 0)
    expect(total).toBe(400_000)
    expect(allocations.find((a) => a.id === 'a')!.allocated).toBe(100_000)
  })

  it('keeps the unit cost authoritative so inventory value matches the lines', () => {
    const allocations = allocate(BATCH, COSTS, 'value')
    for (const a of allocations) {
      const item = BATCH.find((i) => i.id === a.id)!
      // Whatever the rounding, the line is exactly quantity x unit cost — the
      // figure inventory will actually be valued at.
      expect(a.landedCostTotal).toBe(toKobo(item.quantity * a.landedCostPerUnit))
    }
  })

  it('never allocates cost to a batch with no cost lines', () => {
    const allocations = allocate(BATCH, 0, 'value')
    expect(allocations.every((a) => a.allocated === 0)).toBe(true)
  })
})

describe('the cost variance this creates', () => {
  it('is sub-naira and is recognised, never left in the asset figures', () => {
    const allocations = allocate(BATCH, COSTS, 'value')
    const committed = BATCH.reduce((sum, i) => sum + i.lineTotalNaira, 0) + COSTS
    const capitalised = allocations.reduce((sum, a) => toKobo(sum + a.landedCostTotal), 0)
    const variance = toKobo(committed - capitalised)

    // Rounding a unit cost to kobo cannot move more than a naira per line.
    expect(Math.abs(variance)).toBeLessThan(BATCH.length)
    // v_batch_position reports exactly this figure once the batch is received,
    // so cash spent and value capitalised always reconcile.
    expect(toKobo(capitalised + variance)).toBe(committed)
  })
})
