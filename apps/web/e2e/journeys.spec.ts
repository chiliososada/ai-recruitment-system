import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const RESUME = fileURLToPath(new URL('./fixtures/resume.pdf', import.meta.url));
const stamp = Date.now();
const company = { email: `company-${stamp}@e2e.test`, password: 'passw0rd1', name: 'E2E Robotics' };
const seeker = { email: `seeker-${stamp}@e2e.test`, password: 'passw0rd1', name: 'E2E Seeker' };
const seeker2 = { email: `seeker2-${stamp}@e2e.test`, password: 'passw0rd1', name: 'E2E Seeker Two' };
const JOB_TITLE = `Full-Stack Engineer ${stamp}`;

test.use({ locale: 'en-US' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('ars.locale', 'en'));
});

async function register(
  page: Page,
  user: { email: string; password: string; name: string },
  role: 'Job seeker' | 'Company recruiter',
): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('I am a').selectOption({ label: role });
  await page.getByLabel('Display name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/verify/);
  await page.getByRole('button', { name: 'Verify email' }).click();
}

async function login(page: Page, user: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function uploadResume(page: Page): Promise<void> {
  await page.goto('/me');
  await page.getByTestId('resume-input').setInputFiles(RESUME);
  await expect(page.getByTestId('parse-status')).toContainText('Ready', { timeout: 30_000 });
}

test.describe.serial('Two-sided recruitment journeys (E2E main paths)', () => {
  test('company: register, create company, publish a job', async ({ page }) => {
    await register(page, company, 'Company recruiter');
    await expect(page).toHaveURL(/\/console/);

    await page.getByLabel('Company name').fill(company.name);
    await page.getByRole('button', { name: 'Create company' }).click();
    await page.getByRole('link', { name: company.name }).click();
    await expect(page).toHaveURL(/\/console\/companies\//);

    await page.getByLabel('Job title').fill(JOB_TITLE);
    await page.getByLabel('Description').fill('Build TypeScript, React and Node.js apps on PostgreSQL and AWS.');
    await page.getByLabel('Required skills (comma-separated)').fill('TypeScript, React, Node.js');
    await page.getByRole('button', { name: 'Create job' }).click();
    await expect(page.getByText(JOB_TITLE)).toBeVisible();
  });

  test('seeker: register, upload resume, view analysis, recommendations, apply, message', async ({
    page,
  }) => {
    await register(page, seeker, 'Job seeker');
    await expect(page).toHaveURL(/\/me/);

    // Upload + AI analysis (skills + career advice).
    await uploadResume(page);
    await expect(page.getByText('AI skill analysis')).toBeVisible();
    await expect(page.getByText('TypeScript').first()).toBeVisible();
    await expect(page.getByText('Career directions')).toBeVisible();

    // Recommendations include the published job.
    await page.goto('/recommendations');
    await expect(page.getByRole('link', { name: JOB_TITLE })).toBeVisible({ timeout: 30_000 });

    // Browse companies + send a message to the company.
    await page.goto('/companies');
    await page.getByRole('link', { name: company.name }).click();
    await expect(page).toHaveURL(/\/companies\//);
    await page.getByPlaceholder('Type a message…').fill('Hello, I am interested in your roles.');
    await page.getByRole('button', { name: 'Message' }).click();
    await expect(page).toHaveURL(/\/messages/);
    await expect(
      page.getByTestId('message-list').getByText('Hello, I am interested in your roles.'),
    ).toBeVisible();

    // Apply to the job.
    await page.goto('/recommendations');
    await page.getByRole('link', { name: JOB_TITLE }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('button', { name: 'Applied' })).toBeVisible();
  });

  test('a second candidate joins (for comparison)', async ({ page }) => {
    await register(page, seeker2, 'Job seeker');
    await uploadResume(page);
  });

  test('company: search talent, compare, rank candidates, manage application, schedule interview', async ({
    page,
  }) => {
    await login(page, company);
    await expect(page).toHaveURL(/\/console/);

    // Talent search shows candidates; compare two side by side.
    await page.goto('/talent');
    await expect(page.getByTestId('talent-card').first()).toBeVisible({ timeout: 30_000 });
    const checkboxes = page.getByRole('checkbox');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await page.getByRole('button', { name: /Compare selected/ }).click();
    await expect(page.getByTestId('compare-table')).toBeVisible();

    // Open the job → ranked candidates + applications pipeline.
    await page.goto('/console');
    await page.getByRole('link', { name: company.name }).click();
    await page.getByRole('link', { name: JOB_TITLE }).click();
    await expect(page.getByTestId('ranked-candidate').first()).toBeVisible({ timeout: 30_000 });

    // Advance the application stage and propose an interview.
    await expect(page.getByRole('cell', { name: seeker.name, exact: true })).toBeVisible();
    await page
      .locator('select')
      .filter({ hasText: 'Applied' })
      .first()
      .selectOption('screening');
    await page.getByRole('button', { name: 'Propose interview' }).first().click();
    await page.locator('input[type="datetime-local"]').first().fill('2030-01-15T09:00');
    await page.getByRole('button', { name: 'Confirm' }).first().click();
  });
});
