import { expect, test, type Page } from '@playwright/test'

/**
 * Role-based access, end to end.
 *
 * These use the seeded accounts from supabase/seed.sql. They assert what each
 * role can reach and, just as importantly, what it cannot — the Auditor must
 * never be offered a way to write.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'MaalRise2026!'

const USERS = {
  ceo: 'ceo@maalrise.test',
  operations: 'operations@maalrise.test',
  accounts: 'accounts@maalrise.test',
  auditor: 'auditor@maalrise.test',
} as const

async function signIn(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard')
}

test.describe('authentication', () => {
  test('signed-out users are sent to the login page', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('a wrong password does not reveal whether the account exists', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email address').fill(USERS.ceo)
    await page.getByLabel('Password').fill('definitely-wrong')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(/do not match an active account/i)).toBeVisible()
  })

  test('the CEO reaches the dashboard and sees the financial position', async ({ page }) => {
    await signIn(page, USERS.ceo)
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible()
    await expect(page.getByText('Cash at Hand')).toBeVisible()
    await expect(page.getByText('Total Business Assets')).toBeVisible()
  })
})

test.describe('the read-only auditor', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, USERS.auditor)
  })

  test('can read the books', async ({ page }) => {
    await page.goto('/murabaha')
    await expect(page.getByRole('heading', { name: /murābaḥah sales/i })).toBeVisible()

    await page.goto('/audit-log')
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()
  })

  test('is never offered a way to create a procurement batch', async ({ page }) => {
    await page.goto('/procurement')
    await expect(page.getByRole('heading', { name: /procurement orders/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /new procurement/i })).toHaveCount(0)
  })

  test('is never offered a way to approve anything', async ({ page }) => {
    await page.goto('/approvals')
    await expect(page.getByText(/only the CEO and Accounts Officers may approve/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /^approve$/i })).toHaveCount(0)
  })

  test('cannot open settings or user management', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/dashboard/)

    await page.goto('/users')
    await expect(page).toHaveURL(/\/dashboard/)
  })
})

test.describe('the operations officer', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, USERS.operations)
  })

  test('can raise a procurement batch', async ({ page }) => {
    await page.goto('/procurement')
    await expect(page.getByRole('button', { name: /new procurement/i })).toBeVisible()
  })

  test('cannot reach the cashbook or investor records', async ({ page }) => {
    await page.goto('/cashbook')
    await expect(page).toHaveURL(/\/dashboard/)

    await page.goto('/investors')
    await expect(page).toHaveURL(/\/dashboard/)
  })
})

test.describe('the accounts officer', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, USERS.accounts)
  })

  test('can reach the cashbook, receivables and repayments', async ({ page }) => {
    await page.goto('/cashbook')
    await expect(page.getByRole('heading', { name: /cashbook/i })).toBeVisible()

    await page.goto('/receivables')
    await expect(page.getByRole('heading', { name: /receivables/i })).toBeVisible()

    await page.goto('/repayments')
    await expect(page.getByRole('button', { name: /record repayment/i })).toBeVisible()
  })

  test('cannot change system settings', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/dashboard/)
  })
})

test.describe('mobile layout', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-only checks')

  test('shows the bottom navigation and no horizontal scroll', async ({ page }) => {
    await signIn(page, USERS.ceo)

    await expect(page.getByRole('navigation').last()).toBeVisible()

    // The page body must never scroll sideways on a phone.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(overflows).toBe(false)
  })

  test('opens the full menu from the header', async ({ page }) => {
    await signIn(page, USERS.ceo)
    await page.getByRole('button', { name: 'Open menu' }).click()
    await expect(page.getByRole('link', { name: 'Investment Cycles' })).toBeVisible()
  })
})
