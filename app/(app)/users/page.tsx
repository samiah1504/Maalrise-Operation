import { Users } from 'lucide-react'
import { requireRole, requireUser, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/dates'
import { initials } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { UserRoleControls } from '@/components/forms/user-controls'
import type { Profile, UserRole, UserRoleRow } from '@/lib/database.types'

export const metadata = { title: 'Users & Roles' }

const ROLE_ORDER: UserRole[] = ['ceo', 'accounts', 'operations', 'auditor']

const ROLE_TONE: Record<UserRole, 'gold' | 'info' | 'progress' | 'neutral'> = {
  ceo: 'gold',
  accounts: 'info',
  operations: 'progress',
  auditor: 'neutral',
}

export default async function UsersPage() {
  await requireRole('ceo')
  const currentUser = await requireUser()
  const supabase = await createClient()

  const [{ data: profileRows }, { data: roleRows }] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('user_roles').select('*'),
  ])

  const profiles = (profileRows ?? []) as Profile[]
  const roles = (roleRows ?? []) as UserRoleRow[]
  const roleFor = new Map(roles.map((r) => [r.user_id, r.role]))

  return (
    <>
      <PageHeader
        title="Users and roles"
        description="Staff accounts and what each one can do. Investors never have accounts."
      />

      {/* --- What each role can do -------------------------------------- */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {ROLE_ORDER.map((role) => (
          <Card key={role}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Badge tone={ROLE_TONE[role]}>{ROLE_LABELS[role]}</Badge>
                <span className="text-xs text-muted-foreground">
                  {profiles.filter((p) => roleFor.get(p.id) === role).length} user
                  {profiles.filter((p) => roleFor.get(p.id) === role).length === 1 ? '' : 's'}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff accounts"
          description="Accounts are created through Supabase Auth. Once a user signs up, assign them a role here."
        />
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => {
            const role = roleFor.get(profile.id)
            const isSelf = profile.id === currentUser.id

            return (
              <Card key={profile.id} className={profile.is_active ? undefined : 'opacity-60'}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-muted text-sm font-semibold text-primary">
                      {initials(profile.full_name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {profile.full_name}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        ) : null}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {profile.job_title ? `${profile.job_title} · ` : ''}
                        Joined {formatDate(profile.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!profile.is_active ? <Badge tone="danger">Deactivated</Badge> : null}
                    {role ? (
                      <Badge tone={ROLE_TONE[role]}>{ROLE_LABELS[role]}</Badge>
                    ) : (
                      <Badge tone="warning">No role assigned</Badge>
                    )}

                    <UserRoleControls
                      userId={profile.id}
                      currentRole={role ?? null}
                      isActive={profile.is_active}
                      isSelf={isSelf}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Inviting a new staff member</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Invite the person by email from the Supabase dashboard. Their profile appears in this
            list straight away — a database trigger creates it the moment the account exists, so
            you do not have to wait for them to sign in.
          </p>
          <p>
            Then assign a role. A new account deliberately arrives with none, and a user without a
            role can sign in but see nothing at all, because every table&apos;s read policy requires
            one. Granting access is always a decision someone makes.
          </p>
        </CardContent>
      </Card>
    </>
  )
}
