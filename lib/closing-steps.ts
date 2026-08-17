/**
 * The six-step annual cycle closing (brief §22), in the order the database
 * enforces. Kept out of the 'use server' action module, which may only export
 * async functions.
 */
export const CLOSING_STEPS = [
  'accounts_review', 'reconciliation', 'management_approval',
  'profit_confirmed', 'investor_allocation', 'payout_approved', 'completed',
] as const

export type ClosingStep = (typeof CLOSING_STEPS)[number]

export const STEP_LABELS: Record<ClosingStep, string> = {
  accounts_review: 'Accounts review',
  reconciliation: 'Reconciliation',
  management_approval: 'Management approval',
  profit_confirmed: 'Final profit confirmation',
  investor_allocation: 'Investor allocation',
  payout_approved: 'Payout approval',
  completed: 'Cycle completed',
}
