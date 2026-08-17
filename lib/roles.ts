import type { UserRole } from '@/lib/database.types'

/**
 * Role labels and the permission model.
 *
 * Kept free of any server-only import so client components can use it: this is
 * only what the UI shows and hides. Actual authorisation is enforced by RLS and
 * by the permission checks inside each RPC.
 */

export const ROLE_LABELS: Record<UserRole, string> = {
  ceo: 'Super Admin / CEO',
  operations: 'Operations Officer',
  accounts: 'Accounts Officer',
  auditor: 'Read-Only Auditor',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ceo: 'Full access to every module, approvals, user management and settings.',
  operations: 'Procurement, suppliers, products, shipments, goods receipt and inventory.',
  accounts: 'Payments, expenses, capital, repayments, receivables and financial reports.',
  auditor: 'View and export only. Cannot create, edit, approve or delete anything.',
}

export const PERMISSIONS = {
  /** Create and edit operational records: procurement, shipments, inventory. */
  manageOperations: ['ceo', 'operations', 'accounts'],
  /** Record money: capital, payments, repayments, expenses. */
  manageFinance: ['ceo', 'accounts'],
  /** Approve anything. */
  approve: ['ceo', 'accounts'],
  /** Steps reserved to the CEO alone. */
  administer: ['ceo'],
} as const satisfies Record<string, readonly UserRole[]>

export type Permission = keyof typeof PERMISSIONS

export function can(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role)
}

/** The auditor may never write. Handy as a single guard in forms. */
export function isReadOnly(role: UserRole | null | undefined): boolean {
  return role === 'auditor'
}
