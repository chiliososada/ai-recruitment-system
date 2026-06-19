import { expect, test } from '@playwright/test';
import { seedFixtures } from './support';

// UI-4 breakpoints: small mobile, mobile, tablet, small laptop, desktop.
const VIEWPORTS = [
  { name: 'xs', width: 320, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];
const LOCALES = ['ja', 'en'];

/**
 * Visual + browser-quality gate (§13.7/§13.8): capture key pages at desktop + mobile across
 * locales, assert no unexpected horizontal overflow and no console/page errors. Screenshots are
 * written to apps/web/visual-baseline/ for review.
 */
test('key pages render without overflow or console errors (VIS-1)', async ({
  browser,
  request,
}) => {
  const seed = await seedFixtures(request);
  const groups: { token: string | null; pages: [string, string][] }[] = [
    {
      token: null,
      pages: [
        ['home', '/'],
        ['login', '/login'],
        ['register', '/register'],
        ['jobs', '/jobs'],
        ['companies', '/companies'],
      ],
    },
    {
      token: seed.seekerToken,
      pages: [
        ['seeker-profile', '/me'],
        ['recommendations', '/recommendations'],
        ['applications', '/applications'],
      ],
    },
    {
      token: seed.companyToken,
      pages: [
        ['console', '/console'],
        ['talent', '/talent'],
        ['shortlist', '/shortlist'],
      ],
    },
  ];

  for (const vp of VIEWPORTS) {
    for (const locale of LOCALES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      for (const group of groups) {
        const page = await context.newPage();
        await page.addInitScript(
          (args) => {
            const [token, loc] = args as [string | null, string];
            if (token) localStorage.setItem('ars.token', token);
            localStorage.setItem('ars.locale', loc);
          },
          [group.token, locale],
        );
        const errors: string[] = [];
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('requestfailed', (r) => errors.push(`requestfailed ${r.url()}`));

        for (const [name, path] of group.pages) {
          await page.goto(path);
          await page.waitForLoadState('networkidle');
          await page.screenshot({
            path: `visual-baseline/${vp.name}-${locale}-${name}.png`,
            fullPage: true,
          });
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(
            overflow,
            `horizontal overflow on ${name} @ ${vp.name}/${locale}`,
          ).toBeLessThanOrEqual(2);
        }

        const real = errors.filter((e) => !/favicon|ResizeObserver loop/i.test(e));
        expect(real, `console/page errors @ ${vp.name}/${locale}`).toEqual([]);
        await page.close();
      }
      await context.close();
    }
  }
});
