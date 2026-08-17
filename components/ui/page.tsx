import * as React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { formatNaira, formatNairaCompact } from '@/lib/money'

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: string
  description?: string
  breadcrumb?: { label: string; href?: string }[]
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-5 space-y-2">
      {breadcrumb?.length ? (
        <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {breadcrumb.map((crumb, i) => (
            <React.Fragment key={`${crumb.label}-${i}`}>
              {i > 0 ? <ChevronRight className="h-3 w-3" /> : null}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-foreground hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}

/**
 * A dashboard metric tile. Money is shown compactly on phones and in full on
 * larger screens so a figure is never truncated mid-digit.
 */
export function StatCard({
  label,
  value,
  money,
  hint,
  tone = 'default',
  icon: Icon,
  href,
}: {
  label: string
  value?: string | number
  money?: string | number | null
  hint?: string
  tone?: 'default' | 'positive' | 'negative' | 'gold' | 'muted'
  icon?: React.ComponentType<{ className?: string }>
  href?: string
}) {
  const toneClass = {
    default: 'text-foreground',
    positive: 'text-success',
    negative: 'text-destructive',
    gold: 'text-gold',
    muted: 'text-muted-foreground',
  }[tone]

  const body = (
    <Card className={cn('h-full transition-shadow', href && 'hover:shadow-md')}>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
        </div>
        {money !== undefined ? (
          <>
            <p className={cn('tabular text-lg font-semibold sm:hidden', toneClass)}>
              {formatNairaCompact(money)}
            </p>
            <p className={cn('tabular hidden text-lg font-semibold sm:block', toneClass)}>
              {formatNaira(money)}
            </p>
          </>
        ) : (
          <p className={cn('tabular text-2xl font-semibold', toneClass)}>{value ?? '—'}</p>
        )}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}

/** Label/value row used inside detail panels. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
