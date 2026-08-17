import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn, titleCase } from '@/lib/utils'
import { toneFor, type BadgeTone } from '@/lib/status'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors',
  {
    variants: {
      tone: {
        neutral: 'border-transparent bg-muted text-muted-foreground',
        info: 'border-transparent bg-primary-muted text-primary',
        progress: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
        success: 'border-transparent bg-success/12 text-success',
        warning: 'border-transparent bg-warning/15 text-warning',
        danger: 'border-transparent bg-destructive/12 text-destructive',
        gold: 'border-transparent bg-gold-muted text-gold',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

/**
 * Colour-coded status badge, consistent across every module.
 * The tone comes from lib/status so a status always looks the same
 * wherever it appears.
 */
export function StatusBadge({
  status,
  tone,
  className,
}: {
  status: string | null | undefined
  tone?: BadgeTone
  className?: string
}) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return (
    <Badge tone={tone ?? toneFor(status)} className={className}>
      {titleCase(status)}
    </Badge>
  )
}
