import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

/**
 * The card view every list falls back to on small screens. A table with six
 * columns is unreadable on a phone; this keeps the same data scannable.
 */
export function RecordCard({
  href,
  title,
  subtitle,
  badge,
  rows,
  footer,
  className,
}: {
  href?: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  badge?: React.ReactNode
  rows?: { label: string; value: React.ReactNode }[]
  footer?: React.ReactNode
  className?: string
}) {
  const body = (
    <Card className={cn('p-4 transition-shadow', href && 'hover:shadow-md', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-medium">{title}</p>
          {subtitle ? (
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          {href ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : null}
        </div>
      </div>

      {rows?.length ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="tabular truncate font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {footer ? <div className="mt-3 border-t pt-3">{footer}</div> : null}
    </Card>
  )

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}

/** Wraps the card list; hidden from md upwards where the table takes over. */
export function CardList({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3 md:hidden">{children}</div>
}

/** Wraps the table; hidden below md where the card list takes over. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <Card className="hidden overflow-hidden md:block">
      {children}
    </Card>
  )
}
