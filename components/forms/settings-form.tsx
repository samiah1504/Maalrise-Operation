'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/form-controls'
import { updateSettings } from '@/app/actions/settings'
import { formatNaira } from '@/lib/money'

export interface SettingItem {
  key: string
  label: string
  description: string | null
  valueType: string
  value: string
}

export interface SettingGroup {
  category: string
  label: string
  settings: SettingItem[]
}

/** Long free text is better as a textarea than a single line. */
const LONG_TEXT = new Set(['report.disclaimer', 'company.address'])

function isMoney(key: string) {
  return (
    key.includes('price') || key.includes('limit') || key === 'investor.unit_price'
  )
}

export function SettingsForm({ groups }: { groups: SettingGroup[] }) {
  const initial = Object.fromEntries(
    groups.flatMap((g) => g.settings.map((s) => [s.key, s.value])),
  )
  const types = Object.fromEntries(
    groups.flatMap((g) => g.settings.map((s) => [s.key, s.valueType])),
  )

  const [values, setValues] = useState<Record<string, string>>(initial)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const dirty = Object.keys(values).filter((key) => values[key] !== initial[key])

  function save() {
    startTransition(async () => {
      const changed = Object.fromEntries(dirty.map((key) => [key, values[key]]))
      const result = await updateSettings(changed, types)

      if (result.ok) {
        toast.success(result.message ?? 'Settings saved.')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <Card key={group.category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{group.label}</CardTitle>
            {group.category === 'investors' ? (
              <CardDescription>
                These values drive investor validation in the app and in the database. A new
                investor must subscribe to at least the minimum shown here.
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {group.settings.map((setting) => {
              const value = values[setting.key] ?? ''
              const changed = value !== initial[setting.key]
              const long = LONG_TEXT.has(setting.key)

              return (
                <Field
                  key={setting.key}
                  label={setting.label}
                  htmlFor={setting.key}
                  hint={
                    isMoney(setting.key) && value
                      ? `${setting.description ? `${setting.description} · ` : ''}${formatNaira(value)}`
                      : setting.description ?? undefined
                  }
                  className={long ? 'sm:col-span-2' : undefined}
                >
                  {long ? (
                    <Textarea
                      id={setting.key}
                      rows={4}
                      value={value}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [setting.key]: e.target.value }))
                      }
                      className={changed ? 'border-gold' : undefined}
                    />
                  ) : setting.valueType === 'boolean' ? (
                    <Select
                      id={setting.key}
                      value={value}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [setting.key]: e.target.value }))
                      }
                      className={changed ? 'border-gold' : undefined}
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </Select>
                  ) : (
                    <Input
                      id={setting.key}
                      type={setting.valueType === 'number' ? 'number' : 'text'}
                      step={setting.valueType === 'number' ? 'any' : undefined}
                      inputMode={setting.valueType === 'number' ? 'decimal' : undefined}
                      value={value}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [setting.key]: e.target.value }))
                      }
                      className={changed ? 'border-gold' : undefined}
                    />
                  )}
                </Field>
              )
            })}
          </CardContent>
        </Card>
      ))}

      {/* Sticky save bar so the button is always reachable on a phone */}
      <div className="sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-lg sm:bottom-4">
        <p className="text-sm text-muted-foreground">
          {dirty.length === 0
            ? 'No unsaved changes'
            : `${dirty.length} unsaved change${dirty.length === 1 ? '' : 's'}`}
        </p>
        <Button onClick={save} loading={pending} disabled={dirty.length === 0}>
          <Save className="h-4 w-4" />
          Save changes
        </Button>
      </div>
    </div>
  )
}
