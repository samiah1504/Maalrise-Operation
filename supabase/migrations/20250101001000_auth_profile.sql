-- =============================================================================
-- Migration 0011 — Profile creation on sign-up
--
-- `profiles` holds the staff details the application reads; `auth.users` holds
-- the credentials. Nothing connected the two, so a person invited through
-- Supabase Auth had no profile row and the Users page could not see them.
--
-- This trigger creates the profile automatically. It deliberately does NOT
-- grant a role: a new account can authenticate but every read policy requires
-- `auth_role()` to return something, so the account sees nothing at all until
-- the CEO assigns a role on the Users page. Access stays a decision someone
-- makes, not a side effect of signing up.
-- =============================================================================

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    -- Supabase puts an invited user's name in raw_user_meta_data when the
    -- inviter supplies one; fall back to the local part of their address.
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      initcap(replace(split_part(new.email, '@', 1), '.', ' '))
    ),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_auth_user();
