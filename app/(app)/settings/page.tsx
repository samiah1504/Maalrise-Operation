import { requireRole } from '@/lib/auth'
import { getSettingRows, SETTING_CATEGORY_LABELS } from '@/lib/settings'
import { PageHeader } from '@/components/ui/page'
import { SettingsForm } from '@/components/forms/settings-form'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  await requireRole('ceo')
  const settings = await getSettingRows()

  const grouped = settings.reduce<Record<string, typeof settings>>((acc, row) => {
    acc[row.category] = [...(acc[row.category] ?? []), row]
    return acc
  }, {})

  const order = ['branding', 'finance', 'investors', 'approvals', 'numbering', 'notifications', 'reports']
  const categories = [
    ...order.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !order.includes(c)),
  ]

  return (
    <>
      <PageHeader
        title="Settings"
        description="Nothing here is hardcoded. Changing a value takes effect immediately, with no redeployment."
      />

      <SettingsForm
        groups={categories.map((category) => ({
          category,
          label: SETTING_CATEGORY_LABELS[category] ?? category,
          settings: grouped[category].map((s) => ({
            key: s.key,
            label: s.label,
            description: s.description,
            valueType: s.value_type,
            // jsonb scalars come back wrapped; unwrap for the input.
            value:
              typeof s.value === 'string'
                ? s.value
                : s.value === null
                  ? ''
                  : typeof s.value === 'object'
                    ? JSON.stringify(s.value)
                    : String(s.value),
          })),
        }))}
      />
    </>
  )
}
