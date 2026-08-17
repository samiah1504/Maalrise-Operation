import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { SystemSetting } from '@/lib/database.types'

/**
 * Typed accessor for `system_settings`.
 *
 * Nothing configurable is hardcoded (brief §28): unit price, minimum units,
 * profit-sharing ratio, approval limits, repayment period, numbering prefixes
 * and report branding all come from here. `cache()` de-duplicates the read
 * within a single request.
 */

export const SETTING_DEFAULTS = {
  'company.name': 'MaalRise',
  'company.platform': 'Maalvest Investment Limited',
  'company.address': '',
  'company.email': '',
  'company.phone': '',
  'company.logo_url': '',
  'company.currency': 'NGN',
  'investor.unit_price': 100000,
  'investor.min_units_new': 5,
  'investor.min_units_current': 1,
  'profit.investor_share': 0.7,
  'expense.approval_limit': 250000,
  'procurement.approval_limit': 0,
  'murabaha.default_repayment_days': 45,
  'murabaha.default_markup': 0.15,
  'cycle.default_duration_months': 12,
  'numbering.procurement': 'MR-PO',
  'numbering.murabaha': 'MR-MUR',
  'numbering.shipment': 'MR-SHP',
  'numbering.goods_receipt': 'MR-GRN',
  'numbering.repayment': 'MR-RCP',
  'numbering.expense': 'MR-EXP',
  'notifications.due_soon_days': 7,
  'report.disclaimer':
    'Monthly profit figures are provisional and provided for performance reporting purposes only. Final distributable profit will be determined after the completion of the 12-month investment cycle and the closing of the accounts. Investment returns are based on actual business performance and are not guaranteed.',
} as const

export type SettingKey = keyof typeof SETTING_DEFAULTS
export type Settings = { [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] }

/** Reads every setting once per request, falling back to the defaults. */
export const getSettings = cache(async (): Promise<Settings> => {
  const supabase = await createClient()
  const { data } = await supabase.from('system_settings').select('key, value')

  const resolved = { ...SETTING_DEFAULTS } as Record<string, unknown>
  for (const row of (data ?? []) as Pick<SystemSetting, 'key' | 'value'>[]) {
    if (row.key in resolved) resolved[row.key] = row.value
  }
  return resolved as Settings
})

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const settings = await getSettings()
  return settings[key]
}

/** The full rows, for the Settings page where labels and categories matter. */
export async function getSettingRows(): Promise<SystemSetting[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('system_settings')
    .select('*')
    .order('category')
    .order('key')
  return (data ?? []) as SystemSetting[]
}

/** Branding block used by the PDF generators. */
export async function getBranding() {
  const s = await getSettings()
  return {
    name: String(s['company.name']),
    platform: String(s['company.platform']),
    address: String(s['company.address']),
    email: String(s['company.email']),
    phone: String(s['company.phone']),
    logoUrl: String(s['company.logo_url']),
    disclaimer: String(s['report.disclaimer']),
  }
}

export const SETTING_CATEGORY_LABELS: Record<string, string> = {
  branding: 'Company & branding',
  finance: 'Finance',
  investors: 'Investors',
  approvals: 'Approval limits',
  numbering: 'Document numbering',
  notifications: 'Notifications',
  reports: 'Report branding',
}
