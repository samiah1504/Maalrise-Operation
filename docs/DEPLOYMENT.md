# Deployment

Going live is roughly an hour of work: a Supabase project, a Vercel project, one
CEO account, and a smoke test. Do the database first — the app is useless
without it, and the reverse is not true.

> **The one rule that matters:** never run `supabase/seed.sql` against
> production. It creates four staff accounts whose password is published in this
> repository. It is demo data for local development and training only.

---

## Before you start

You need:

| | |
|---|---|
| Supabase account | free tier works to start; **Pro is required for Point-in-Time Recovery** |
| Vercel account | free tier works for internal use |
| Supabase CLI | `npm i -g supabase` |
| A domain | optional — Vercel gives you one |

---

## 1. Create the Supabase project

In the Supabase dashboard, create a project. Choose the region closest to Lagos
(`eu-central-1` / Frankfurt is usually the best available). **Save the database
password** — you cannot retrieve it later.

From the project settings collect:

- Project URL — `https://xxxx.supabase.co`
- `anon` public key — safe in the browser
- `service_role` key — **secret**, server only, never prefixed `NEXT_PUBLIC_`
- Project ref — the `xxxx` part of the URL

## 2. Push the schema

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

`db push` applies the migrations only. It does **not** run `seed.sql`, which is
what you want.

> Never run `supabase db reset` against production. It drops everything and then
> runs the demo seed.

Verify in the SQL editor:

```sql
select count(*) from system_settings;      -- expect 24
select count(*) from expense_categories;   -- expect 17
select count(*) from profiles;             -- expect 0
```

Settings and expense categories arrive by migration because the app cannot run
without them. Zero profiles is correct — nobody has an account yet.

## 3. Create the CEO account

Sign-up is disabled by design, so the first account is made by hand.

**Authentication → Users → Add user.** Use a real work address, set a strong
password, and tick *Auto Confirm User*.

The profile row is created automatically by a trigger. Now grant the role — this
is the only time you will do it in SQL, because there is no CEO yet to do it in
the app:

```sql
insert into user_roles (user_id, role)
select id, 'ceo' from profiles where email = 'you@yourcompany.com';
```

Every later hire is invited from the Supabase dashboard and given a role on the
**Users** page. A user with no role can sign in but sees nothing at all.

## 4. Deploy the app

Import the repository in Vercel. It detects Next.js; leave the build settings
alone. Add the environment variables:

| Variable | Value | Exposed to browser |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `anon` key | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key | **no** |
| `CRON_SECRET` | a long random string — `openssl rand -hex 32` | no |

Deploy.

## 5. Point Supabase at the real URL

**Authentication → URL Configuration.** Set the Site URL to your Vercel domain
and add it to the redirect allow-list. Sign-in silently misbehaves if you skip
this.

## 6. Daily jobs

Alerts, overdue flagging and cycle-maturity transitions run once a day.

`vercel.json` already schedules `/api/cron` for 06:00 UTC, and Vercel sends
`CRON_SECRET` as a bearer token, which the route checks.

If your Supabase plan includes `pg_cron`, the schema also schedules
`run_daily_jobs()` directly; the two are harmless together because the alert
writes de-duplicate. Either alone is enough.

Test it:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron
```

## 7. Turn on backups

**Database → Backups → enable Point-in-Time Recovery.** This needs the Pro plan.

Daily snapshots alone are not adequate for a financial system: a mistake found
on Wednesday afternoon should not cost you Wednesday morning.

---

## Smoke test

Sign in as the CEO and walk one batch through, on a phone. It takes ten minutes
and exercises every risky path:

1. **Settings** — set the company name, address and unit price.
2. **Investment Cycles** — create the live cycle, status *Active*.
3. **Bank Accounts** — add the real accounts with their opening balances.
4. **Suppliers**, **Products**, **Businesses** — add one of each.
5. **Investors** — add one, record a subscription, record the capital.
   *Check: Cash at Hand rises by that amount.*
6. **Procurement** — raise a batch. *Check: you cannot approve your own batch.*
7. Approve it as a second user, record a supplier payment.
   *Check: Cash at Hand falls and Cash in Stock rises by the same amount.*
8. Add a cost line, finalise the landed cost, record and confirm a goods receipt.
   *Check: Cash in Stock for that batch goes to zero and Inventory Value rises.*
9. **Murābaḥah** — sell the stock, approve it.
   *Check: inventory falls, a receivable appears, and the price is now fixed.*
10. **Repayments** — record a repayment.
    *Check: Cash at Hand rises and the receivable falls.*
11. **Financial reports → Reconciliation check.**
    **Every line must read zero.** If one does not, stop and investigate before
    anyone records real data.
12. **Documents** — upload a file and reopen it, to prove storage works.
13. Download one report as PDF and one as Excel.

Then clear the test data — or better, do the walkthrough in a second Supabase
project and keep production clean from the first real transaction.

## Security checklist

- [ ] `seed.sql` has **not** been run against production
- [ ] No account uses the demo password `MaalRise2026!`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel only, never `NEXT_PUBLIC_`
- [ ] The `documents` storage bucket shows **Private**
- [ ] Every user on the Users page has exactly the role they should have
- [ ] Sign in as the auditor and confirm no create, edit or approve control appears
- [ ] Point-in-Time Recovery is on
- [ ] `CRON_SECRET` is set, and `/api/cron` returns 401 without it

## Afterwards

Give staff [`USER_GUIDE.md`](USER_GUIDE.md) — it is written for non-technical
readers and covers the daily and monthly routine.

Watch the **Reconciliation check** for the first month. It is the one report that
tells you whether the books hold together, and it should read zero on every line
every time.
