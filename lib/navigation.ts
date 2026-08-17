import {
  Archive, ArrowLeftRight, BadgeCheck, Banknote, BarChart3, Bell, Boxes, Building2,
  CalendarClock, ClipboardCheck, ClipboardList, FileSpreadsheet, FileText, Handshake,
  History, LayoutDashboard, Package, PackageCheck, Receipt, RefreshCw, Settings,
  Ship, ShoppingCart, Truck, Users, Wallet, Warehouse,
} from 'lucide-react'
import type { UserRole } from '@/lib/database.types'

export interface NavItem {
  href: string
  label: string
  /** Short label for the mobile bottom bar. */
  short?: string
  icon: React.ComponentType<{ className?: string }>
  roles: readonly UserRole[]
  group: NavGroup
}

export type NavGroup = 'overview' | 'operations' | 'finance' | 'reports' | 'admin'

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  overview: 'Overview',
  operations: 'Operations',
  finance: 'Finance',
  reports: 'Reports',
  admin: 'Administration',
}

const ALL: readonly UserRole[] = ['ceo', 'operations', 'accounts', 'auditor']
const OPS: readonly UserRole[] = ['ceo', 'operations', 'accounts', 'auditor']
const FIN: readonly UserRole[] = ['ceo', 'accounts', 'auditor']
const CEO: readonly UserRole[] = ['ceo']

/** The 29 pages from brief §30, in the order staff work through them. */
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ALL, group: 'overview' },
  { href: '/cycles', label: 'Investment Cycles', short: 'Cycles', icon: CalendarClock, roles: ALL, group: 'overview' },
  { href: '/investors', label: 'Investors', icon: Users, roles: FIN, group: 'overview' },

  { href: '/suppliers', label: 'Suppliers', icon: Handshake, roles: OPS, group: 'operations' },
  { href: '/products', label: 'Products', icon: Package, roles: OPS, group: 'operations' },
  { href: '/procurement', label: 'Procurement Orders', short: 'Procure', icon: ShoppingCart, roles: OPS, group: 'operations' },
  { href: '/shipments', label: 'Shipments', icon: Ship, roles: OPS, group: 'operations' },
  { href: '/goods-receipts', label: 'Goods Receipts', short: 'Receipts', icon: PackageCheck, roles: OPS, group: 'operations' },
  { href: '/inventory', label: 'Inventory', icon: Warehouse, roles: OPS, group: 'operations' },
  { href: '/businesses', label: 'Businesses', icon: Building2, roles: OPS, group: 'operations' },
  { href: '/murabaha', label: 'Murābaḥah Sales', short: 'Sales', icon: Boxes, roles: OPS, group: 'operations' },

  { href: '/receivables', label: 'Receivables', icon: ClipboardList, roles: FIN, group: 'finance' },
  { href: '/repayments', label: 'Repayments', icon: ArrowLeftRight, roles: FIN, group: 'finance' },
  { href: '/cashbook', label: 'Cashbook', icon: Banknote, roles: FIN, group: 'finance' },
  { href: '/bank-accounts', label: 'Bank Accounts', short: 'Accounts', icon: Wallet, roles: FIN, group: 'finance' },
  { href: '/expenses', label: 'Expenses', icon: Receipt, roles: FIN, group: 'finance' },
  { href: '/approvals', label: 'Approvals', icon: BadgeCheck, roles: ALL, group: 'finance' },

  { href: '/capital-recycling', label: 'Capital Recycling', short: 'Capital', icon: RefreshCw, roles: ALL, group: 'reports' },
  { href: '/financial-reports', label: 'Financial Reports', short: 'Financials', icon: BarChart3, roles: FIN, group: 'reports' },
  { href: '/operational-reports', label: 'Operational Reports', short: 'Ops reports', icon: Truck, roles: ALL, group: 'reports' },
  { href: '/investor-reports', label: 'Investor Reports', icon: FileSpreadsheet, roles: FIN, group: 'reports' },
  { href: '/monthly-closing', label: 'Monthly Closing', short: 'Closing', icon: ClipboardCheck, roles: FIN, group: 'reports' },
  { href: '/annual-closing', label: 'Annual Cycle Closing', short: 'Annual', icon: Archive, roles: FIN, group: 'reports' },
  { href: '/documents', label: 'Documents', icon: FileText, roles: ALL, group: 'reports' },

  { href: '/notifications', label: 'Notifications', icon: Bell, roles: ALL, group: 'admin' },
  { href: '/audit-log', label: 'Audit Log', icon: History, roles: ALL, group: 'admin' },
  { href: '/users', label: 'Users & Roles', short: 'Users', icon: Users, roles: CEO, group: 'admin' },
  { href: '/settings', label: 'Settings', icon: Settings, roles: CEO, group: 'admin' },
]

export function navFor(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}

export function navGroupsFor(role: UserRole): { group: NavGroup; items: NavItem[] }[] {
  const groups: NavGroup[] = ['overview', 'operations', 'finance', 'reports', 'admin']
  return groups
    .map((group) => ({ group, items: navFor(role).filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0)
}

/** The five destinations on the phone bottom bar. */
export function bottomNavFor(role: UserRole): NavItem[] {
  const preferred: Record<UserRole, string[]> = {
    ceo: ['/dashboard', '/procurement', '/murabaha', '/receivables', '/approvals'],
    operations: ['/dashboard', '/procurement', '/shipments', '/inventory', '/goods-receipts'],
    accounts: ['/dashboard', '/receivables', '/repayments', '/cashbook', '/expenses'],
    auditor: ['/dashboard', '/procurement', '/murabaha', '/financial-reports', '/audit-log'],
  }
  const allowed = navFor(role)
  return preferred[role]
    .map((href) => allowed.find((i) => i.href === href))
    .filter((i): i is NavItem => Boolean(i))
}

/** Page title lookup used by the mobile header. */
export function titleForPath(pathname: string): string {
  const match = NAV_ITEMS.filter((i) => pathname.startsWith(i.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0]
  return match?.label ?? 'MaalRise'
}
