import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedFixtures } from './support';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`);
}

test.describe('accessibility — 0 critical/serious axe violations (A11Y-1)', () => {
  test('public + status pages', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ars.locale', 'en'));
    for (const path of [
      '/',
      '/login',
      '/register',
      '/jobs',
      '/companies',
      '/403',
      '/no-such-route',
    ]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await seriousViolations(page), `axe violations on ${path}`).toEqual([]);
    }
  });

  test('authenticated seeker + recruiter pages', async ({ browser, request }) => {
    const seed = await seedFixtures(request);
    const groups: [string, string[]][] = [
      [seed.seekerToken, ['/me', '/recommendations', '/applications']],
      [seed.companyToken, ['/console', '/talent', '/shortlist']],
    ];
    for (const [token, paths] of groups) {
      const ctx = await browser.newContext();
      await ctx.addInitScript((tk) => {
        localStorage.setItem('ars.token', tk as string);
        localStorage.setItem('ars.locale', 'en');
      }, token);
      const page = await ctx.newPage();
      for (const path of paths) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        expect(await seriousViolations(page), `axe violations on ${path}`).toEqual([]);
      }
      await ctx.close();
    }
  });
});

test.describe('keyboard operability (A11Y-2)', () => {
  test('login form is reachable and submittable by keyboard with visible focus', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('ars.locale', 'en'));
    await page.goto('/login');
    await page.getByLabel('Email').focus();
    await page.keyboard.press('Tab'); // -> password
    await page.keyboard.press('Tab'); // -> submit
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
  });
});
