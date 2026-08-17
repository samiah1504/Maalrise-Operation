'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, LogOut, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/shell/sidebar'
import { CycleSwitcher } from '@/components/shell/cycle-switcher'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { initials } from '@/lib/utils'
import { titleForPath } from '@/lib/navigation'
import { ROLE_LABELS } from '@/lib/auth'
import type { CycleSummary, UserRole } from '@/lib/database.types'

export function Topbar({
  role,
  fullName,
  companyName,
  cycles,
  selectedCycleId,
  unreadCount,
}: {
  role: UserRole
  fullName: string
  companyName: string
  cycles: Pick<CycleSummary, 'investment_cycle_id' | 'name' | 'code' | 'status'>[]
  selectedCycleId: string | null
  unreadCount: number
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Link href="/dashboard" className="hidden items-center gap-2 md:flex">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              M
            </span>
            <span className="font-semibold tracking-tight">{companyName}</span>
          </Link>

          <span className="truncate font-semibold md:hidden">{titleForPath(pathname)}</span>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <CycleSwitcher cycles={cycles} selectedId={selectedCycleId} />

            <Link href="/notifications" className="relative">
              <Button variant="ghost" size="icon" aria-label="Notifications">
                <Bell className="h-5 w-5" />
              </Button>
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </Link>

            <div className="hidden items-center gap-2 pl-2 sm:flex">
              <div className="text-right leading-tight">
                <p className="text-xs font-medium">{fullName}</p>
                <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[role]}</p>
              </div>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-muted text-xs font-semibold text-primary">
                {initials(fullName)}
              </span>
            </div>

            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Slide-over navigation for phones and tablets */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-xs flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                  M
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-semibold">{companyName}</p>
                  <Badge tone="gold" className="mt-0.5">
                    {ROLE_LABELS[role]}
                  </Badge>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMenuOpen(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto" onClick={() => setMenuOpen(false)}>
              <Sidebar role={role} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
