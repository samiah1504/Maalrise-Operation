'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_GROUP_LABELS, bottomNavFor, navGroupsFor } from '@/lib/navigation'
import type { UserRole } from '@/lib/database.types'

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Desktop navigation. Hidden below the md breakpoint. */
export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const groups = navGroupsFor(role)

  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4">
      {groups.map(({ group, items }) => (
        <div key={group} className="space-y-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {NAV_GROUP_LABELS[group]}
          </p>
          {items.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

/** Phone navigation: five destinations, thumb-reachable. */
export function BottomNav({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const items = bottomNavFor(role)

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'stroke-[2.4]')} />
                <span className="max-w-full truncate">{item.short ?? item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
