import { requireUser, getCycles, getSelectedCycle } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { createClient } from '@/lib/supabase/server'
import { Sidebar, BottomNav } from '@/components/shell/sidebar'
import { Topbar } from '@/components/shell/topbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const [cycles, selected, settings, supabase] = await Promise.all([
    getCycles(),
    getSelectedCycle(),
    getSettings(),
    createClient(),
  ])

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)

  return (
    <div className="min-h-dvh">
      <Topbar
        role={user.role}
        fullName={user.profile.full_name}
        companyName={String(settings['company.name'])}
        cycles={cycles}
        selectedCycleId={selected?.investment_cycle_id ?? null}
        unreadCount={count ?? 0}
      />

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 border-r bg-card md:block">
          <Sidebar role={user.role} />
        </aside>

        {/* pb-20 keeps the last row clear of the phone bottom bar */}
        <main className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-6 sm:pb-8 sm:pt-6">
          {children}
        </main>
      </div>

      <BottomNav role={user.role} />
    </div>
  )
}
