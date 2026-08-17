import { describe, expect, it } from 'vitest'
import {
  CYCLE, GOODS_RECEIPT, INVESTOR, MURABAHA, PROCUREMENT, SHIPMENT,
  canTransition, nextStatuses, toneFor,
} from '@/lib/status'

/**
 * The UI must never offer a transition the database would reject, and it must
 * never hide one the database allows.
 */
describe('status machines', () => {
  it('never offers a transition out of a terminal state', () => {
    expect(nextStatuses(PROCUREMENT, 'closed')).toHaveLength(0)
    expect(nextStatuses(PROCUREMENT, 'cancelled')).toHaveLength(0)
    expect(nextStatuses(MURABAHA, 'fully_paid')).toHaveLength(0)
    expect(nextStatuses(CYCLE, 'completed')).toHaveLength(0)
    expect(nextStatuses(INVESTOR, 'paid')).toHaveLength(0)
  })

  it('walks a procurement batch through the full journey', () => {
    const journey = [
      'draft', 'awaiting_approval', 'approved', 'partially_paid', 'fully_paid',
      'in_production', 'production_completed', 'ready_for_shipment', 'shipped',
      'in_transit', 'at_port', 'clearing', 'received', 'closed',
    ] as const

    for (let i = 0; i < journey.length - 1; i++) {
      expect(canTransition(PROCUREMENT, journey[i], journey[i + 1])).toBe(true)
    }
  })

  it('refuses to jump a procurement batch past its approval', () => {
    expect(canTransition(PROCUREMENT, 'draft', 'received')).toBe(false)
    expect(canTransition(PROCUREMENT, 'draft', 'fully_paid')).toBe(false)
    expect(canTransition(PROCUREMENT, 'awaiting_approval', 'in_production')).toBe(false)
  })

  it('refuses to reopen a closed or cancelled batch', () => {
    expect(canTransition(PROCUREMENT, 'closed', 'received')).toBe(false)
    expect(canTransition(PROCUREMENT, 'cancelled', 'draft')).toBe(false)
  })

  it('lets a shipment be marked delayed from any leg in transit', () => {
    for (const from of ['booked', 'shipped', 'in_transit'] as const) {
      expect(canTransition(SHIPMENT, from, 'delayed')).toBe(true)
    }
    // …and recover from it.
    expect(canTransition(SHIPMENT, 'delayed', 'arrived_at_port')).toBe(true)
  })

  it('never lets a Murabaha contract go back to draft once approved', () => {
    expect(canTransition(MURABAHA, 'active', 'draft')).toBe(false)
    expect(canTransition(MURABAHA, 'fully_paid', 'active')).toBe(false)
  })

  it('allows a disputed contract to be resolved either way', () => {
    expect(canTransition(MURABAHA, 'disputed', 'fully_paid')).toBe(true)
    expect(canTransition(MURABAHA, 'disputed', 'active')).toBe(true)
  })

  it('drives the cycle through maturity to payout in order', () => {
    const journey = [
      'active', 'approaching_maturity', 'matured', 'accounts_under_review',
      'profit_approved', 'payout_in_progress', 'completed',
    ] as const

    for (let i = 0; i < journey.length - 1; i++) {
      expect(canTransition(CYCLE, journey[i], journey[i + 1])).toBe(true)
    }
    // Profit can never be approved before the accounts have been reviewed.
    expect(canTransition(CYCLE, 'matured', 'profit_approved')).toBe(false)
    expect(canTransition(CYCLE, 'active', 'completed')).toBe(false)
  })

  it('lets a goods receipt be disputed but not un-received', () => {
    expect(canTransition(GOODS_RECEIPT, 'pending_inspection', 'disputed')).toBe(true)
    expect(canTransition(GOODS_RECEIPT, 'fully_received', 'pending_inspection')).toBe(false)
  })

  it('treats staying put as always legal', () => {
    expect(canTransition(PROCUREMENT, 'in_transit', 'in_transit')).toBe(true)
  })
})

describe('status badge tones', () => {
  it('colours a status the same way wherever it appears', () => {
    expect(toneFor('overdue')).toBe('danger')
    expect(toneFor('fully_paid')).toBe('success')
    expect(toneFor('awaiting_approval')).toBe('warning')
    expect(toneFor('cancelled')).toBe('danger')
  })

  it('falls back to neutral rather than throwing on an unknown status', () => {
    expect(toneFor('something_new')).toBe('neutral')
    expect(toneFor(null)).toBe('neutral')
    expect(toneFor(undefined)).toBe('neutral')
  })
})
