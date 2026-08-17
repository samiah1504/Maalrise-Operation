import type {
  CycleStatus, GoodsReceiptStatus, InvestorStatus, MurabahaStatus,
  ProcurementStatus, ShipmentStatus, SupplierStatus,
} from '@/lib/database.types'

/**
 * Status machines, mirrored by the transition guards in the Postgres RPCs.
 * The database is the enforcement point; this file drives the UI so users are
 * never offered a transition that would be rejected.
 */

export type BadgeTone =
  | 'neutral'
  | 'info'
  | 'progress'
  | 'success'
  | 'warning'
  | 'danger'
  | 'gold'

export type Machine<T extends string> = {
  readonly transitions: Readonly<Record<T, readonly T[]>>
  readonly tone: Readonly<Record<T, BadgeTone>>
}

// --- Investment cycles (brief §6) -------------------------------------------
export const CYCLE: Machine<CycleStatus> = {
  transitions: {
    draft: ['subscription_open', 'active'],
    subscription_open: ['active', 'draft'],
    active: ['approaching_maturity', 'matured'],
    approaching_maturity: ['matured'],
    matured: ['accounts_under_review'],
    accounts_under_review: ['profit_approved'],
    profit_approved: ['payout_in_progress'],
    payout_in_progress: ['completed'],
    completed: [],
  },
  tone: {
    draft: 'neutral',
    subscription_open: 'info',
    active: 'success',
    approaching_maturity: 'warning',
    matured: 'gold',
    accounts_under_review: 'progress',
    profit_approved: 'gold',
    payout_in_progress: 'progress',
    completed: 'success',
  },
}

// --- Investors (brief §7) ----------------------------------------------------
export const INVESTOR: Machine<InvestorStatus> = {
  transitions: {
    pending_confirmation: ['active', 'cancelled'],
    active: ['matured', 'cancelled'],
    matured: ['payout_pending'],
    payout_pending: ['paid'],
    paid: [],
    cancelled: [],
  },
  tone: {
    pending_confirmation: 'warning',
    active: 'success',
    matured: 'gold',
    payout_pending: 'progress',
    paid: 'success',
    cancelled: 'danger',
  },
}

// --- Suppliers (brief §8) ----------------------------------------------------
export const SUPPLIER: Machine<SupplierStatus> = {
  transitions: {
    active: ['under_review', 'suspended', 'inactive'],
    under_review: ['active', 'suspended', 'inactive'],
    suspended: ['active', 'inactive'],
    inactive: ['active'],
  },
  tone: {
    active: 'success',
    under_review: 'warning',
    suspended: 'danger',
    inactive: 'neutral',
  },
}

// --- Procurement (brief §10) -------------------------------------------------
export const PROCUREMENT: Machine<ProcurementStatus> = {
  transitions: {
    draft: ['awaiting_approval', 'cancelled'],
    awaiting_approval: ['approved', 'draft', 'cancelled'],
    approved: ['supplier_payment_pending', 'partially_paid', 'fully_paid', 'cancelled'],
    supplier_payment_pending: ['partially_paid', 'fully_paid', 'cancelled'],
    partially_paid: ['fully_paid', 'in_production', 'cancelled'],
    fully_paid: ['in_production', 'cancelled'],
    in_production: ['production_completed', 'cancelled'],
    production_completed: ['ready_for_shipment'],
    ready_for_shipment: ['shipped'],
    shipped: ['in_transit'],
    in_transit: ['at_port'],
    at_port: ['clearing'],
    clearing: ['received', 'partially_received'],
    partially_received: ['received', 'closed'],
    received: ['closed'],
    closed: [],
    cancelled: [],
  },
  tone: {
    draft: 'neutral',
    awaiting_approval: 'warning',
    approved: 'info',
    supplier_payment_pending: 'warning',
    partially_paid: 'warning',
    fully_paid: 'info',
    in_production: 'progress',
    production_completed: 'progress',
    ready_for_shipment: 'progress',
    shipped: 'progress',
    in_transit: 'progress',
    at_port: 'gold',
    clearing: 'gold',
    partially_received: 'warning',
    received: 'success',
    closed: 'success',
    cancelled: 'danger',
  },
}

// --- Shipments (brief §12) ---------------------------------------------------
export const SHIPMENT: Machine<ShipmentStatus> = {
  transitions: {
    awaiting_shipment: ['booked', 'shipped'],
    booked: ['shipped', 'delayed'],
    shipped: ['in_transit', 'delayed'],
    in_transit: ['arrived_at_port', 'delayed'],
    delayed: ['in_transit', 'arrived_at_port'],
    arrived_at_port: ['clearing'],
    clearing: ['released', 'delayed'],
    released: ['delivered_to_warehouse'],
    delivered_to_warehouse: ['closed'],
    closed: [],
  },
  tone: {
    awaiting_shipment: 'neutral',
    booked: 'info',
    shipped: 'progress',
    in_transit: 'progress',
    delayed: 'danger',
    arrived_at_port: 'gold',
    clearing: 'gold',
    released: 'info',
    delivered_to_warehouse: 'success',
    closed: 'success',
  },
}

// --- Goods receipts (brief §13) ---------------------------------------------
export const GOODS_RECEIPT: Machine<GoodsReceiptStatus> = {
  transitions: {
    pending_inspection: ['partially_received', 'fully_received', 'damaged', 'disputed'],
    partially_received: ['fully_received', 'disputed', 'closed'],
    fully_received: ['closed'],
    damaged: ['disputed', 'closed'],
    disputed: ['closed'],
    closed: [],
  },
  tone: {
    pending_inspection: 'warning',
    partially_received: 'warning',
    fully_received: 'success',
    damaged: 'danger',
    disputed: 'danger',
    closed: 'neutral',
  },
}

// --- Murabaha sales (brief §15) ----------------------------------------------
export const MURABAHA: Machine<MurabahaStatus> = {
  transitions: {
    draft: ['awaiting_approval', 'cancelled'],
    awaiting_approval: ['approved', 'draft', 'cancelled'],
    approved: ['goods_released', 'active', 'cancelled'],
    goods_released: ['active'],
    active: ['partially_paid', 'fully_paid', 'overdue', 'disputed'],
    partially_paid: ['fully_paid', 'overdue', 'disputed'],
    overdue: ['partially_paid', 'fully_paid', 'disputed'],
    disputed: ['active', 'partially_paid', 'fully_paid'],
    fully_paid: [],
    cancelled: [],
  },
  tone: {
    draft: 'neutral',
    awaiting_approval: 'warning',
    approved: 'info',
    goods_released: 'info',
    active: 'progress',
    partially_paid: 'warning',
    overdue: 'danger',
    disputed: 'danger',
    fully_paid: 'success',
    cancelled: 'danger',
  },
}

// --- Repayment schedule (brief §16) -----------------------------------------
export const REPAYMENT_SCHEDULE: Record<string, BadgeTone> = {
  not_due: 'neutral',
  due_soon: 'info',
  due_today: 'warning',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'danger',
  disputed: 'danger',
}

// --- Everything else ---------------------------------------------------------
export const BUSINESS_TONE: Record<string, BadgeTone> = {
  active: 'success',
  suspended: 'danger',
  inactive: 'neutral',
}

export const EXPENSE_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  awaiting_approval: 'warning',
  approved: 'info',
  rejected: 'danger',
  paid: 'success',
  cancelled: 'danger',
}

export const APPROVAL_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

export const CLOSING_TONE: Record<string, BadgeTone> = {
  open: 'neutral',
  in_review: 'progress',
  closed: 'success',
  reopened: 'warning',
}

export const ANNUAL_CLOSING_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  accounts_review: 'progress',
  reconciliation: 'progress',
  management_approval: 'warning',
  profit_confirmed: 'gold',
  investor_allocation: 'progress',
  payout_approved: 'gold',
  completed: 'success',
}

export const PRODUCT_TONE: Record<string, BadgeTone> = {
  active: 'success',
  inactive: 'neutral',
  discontinued: 'danger',
}

/**
 * Every tone map in one lookup, so <StatusBadge> only needs the value.
 *
 * Several maps share a key — `cancelled`, `approved` — with different meanings.
 * The state machines are spread last so they win, because those are the
 * statuses that appear on records throughout the app: a cancelled procurement
 * batch or Murābaḥah contract must read as a problem, not as a neutral note.
 * Where a page needs a different reading (a cancelled approval request, say),
 * it passes an explicit `tone`.
 */
const ALL_TONES: Record<string, BadgeTone> = {
  ...APPROVAL_TONE,
  ...EXPENSE_TONE,
  ...ANNUAL_CLOSING_TONE,
  ...REPAYMENT_SCHEDULE,
  ...SUPPLIER.tone,
  ...GOODS_RECEIPT.tone,
  ...SHIPMENT.tone,
  ...INVESTOR.tone,
  ...CYCLE.tone,
  ...PROCUREMENT.tone,
  ...MURABAHA.tone,
}

export function toneFor(status: string | null | undefined): BadgeTone {
  if (!status) return 'neutral'
  return ALL_TONES[status] ?? 'neutral'
}

/** The transitions a user may pick from, for the status dropdowns. */
export function nextStatuses<T extends string>(
  m: Machine<T>,
  current: T | null | undefined,
): readonly T[] {
  if (!current) return []
  return m.transitions[current] ?? []
}

export function canTransition<T extends string>(
  m: Machine<T>,
  from: T,
  to: T,
): boolean {
  if (from === to) return true
  return (m.transitions[from] ?? []).includes(to)
}
