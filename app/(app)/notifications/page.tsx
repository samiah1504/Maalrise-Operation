import Link from 'next/link'
import { AlertTriangle, Bell, Info, RefreshCw } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime } from '@/lib/dates'
import { titleCase } from '@/lib/utils'
import { PageHeader, StatCard } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { ListFilters } from '@/components/tables/list-filters'
import { NotificationActions } from '@/components/forms/notification-actions'
import type { NotificationRow, NotificationSeverity } from '@/lib/database.types'

export const metadata = { title: 'Notifications' }

/** Where each alert type takes you when you act on it. */
const LINKS: Record<string, string> = {
  supplier_payment_due: '/procurement',
  production_completion_due: '/procurement',
  shipment_delayed: '/shipments',
  arrival_approaching: '/shipments',
  goods_at_port: '/shipments',
  clearing_delayed: '/shipments',
  goods_received: '/goods-receipts',
  repayment_due: '/receivables',
  repayment_overdue: '/receivables',
  expense_awaiting_approval: '/approvals',
  cycle_approaching_maturity: '/annual-closing',
  investor_report_due: '/investor-reports',
  month_end_closing_incomplete: '/monthly-closing',
  approval_pending: '/approvals',
}

const SEVERITY_ICON: Record<NotificationSeverity, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertTriangle,
}

const SEVERITY_TONE = {
  info: 'info',
  warning: 'warning',
  critical: 'danger',
} as const

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  await requireUser()
  const supabase = await createClient()

  let query = supabase.from('notifications').select('*')

  if (params.severity) query = query.eq('severity', params.severity as NotificationSeverity)
  if (params.read === 'unread') query = query.eq('is_read', false)
  if (params.read === 'read') query = query.eq('is_read', true)
  if (params.q) query = query.or(`title.ilike.%${params.q}%,body.ilike.%${params.q}%`)

  const { data } = await query.order('created_at', { ascending: false }).limit(200)
  const notifications = (data ?? []) as NotificationRow[]

  const unread = notifications.filter((n) => !n.is_read)
  const critical = notifications.filter((n) => n.severity === 'critical' && !n.is_read)

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Payments due, shipments delayed, goods at port, approvals waiting and month-end tasks outstanding."
        actions={<NotificationActions hasUnread={unread.length > 0} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Unread" value={String(unread.length)} icon={Bell}
                  tone={unread.length > 0 ? 'gold' : 'muted'} />
        <StatCard label="Critical" value={String(critical.length)}
                  tone={critical.length > 0 ? 'negative' : 'muted'} />
        <StatCard
          label="Warnings"
          value={String(notifications.filter((n) => n.severity === 'warning' && !n.is_read).length)}
        />
        <StatCard label="Total shown" value={String(notifications.length)} />
      </div>

      <ListFilters
        searchPlaceholder="Search notifications…"
        filters={[
          {
            name: 'severity',
            label: 'Severity',
            options: [
              { value: 'critical', label: 'Critical' },
              { value: 'warning', label: 'Warning' },
              { value: 'info', label: 'Information' },
            ],
          },
          {
            name: 'read',
            label: 'State',
            options: [
              { value: 'unread', label: 'Unread' },
              { value: 'read', label: 'Read' },
            ],
          },
        ]}
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nothing to report"
          description="Alerts are generated daily. Use Refresh alerts above to run the checks now."
          action={
            <Link href="/dashboard" className="text-sm text-primary hover:underline">
              Back to the dashboard
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const Icon = SEVERITY_ICON[n.severity]
            const href = LINKS[n.type] ?? '/dashboard'

            return (
              <Card key={n.id} className={n.is_read ? 'opacity-70' : undefined}>
                <CardContent className="flex items-start gap-3 pt-6">
                  <span
                    className={
                      n.severity === 'critical'
                        ? 'mt-0.5 rounded-full bg-destructive/12 p-2 text-destructive'
                        : n.severity === 'warning'
                          ? 'mt-0.5 rounded-full bg-warning/15 p-2 text-warning'
                          : 'mt-0.5 rounded-full bg-primary-muted p-2 text-primary'
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={href} className="font-medium hover:underline">
                        {n.title}
                      </Link>
                      <Badge tone={SEVERITY_TONE[n.severity]}>{titleCase(n.severity)}</Badge>
                      {!n.is_read ? <Badge tone="gold">New</Badge> : null}
                    </div>
                    {n.body ? (
                      <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {titleCase(n.type)} · {formatDateTime(n.created_at)}
                      {n.due_date ? ` · due ${formatDate(n.due_date)}` : ''}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
