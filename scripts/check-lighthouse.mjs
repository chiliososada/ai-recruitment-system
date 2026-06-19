#!/usr/bin/env node
/**
 * PERF-1: Lighthouse gate. Runs Lighthouse against a served production SPA build for the
 * key public routes and asserts category thresholds. Performance is recorded as a baseline
 * (not hard-failed locally, since it's environment-sensitive); accessibility / best-practices
 * / SEO are hard gates.
 *
 * Usage: build + serve the web app, then:
 *   LH_BASE_URL=http://localhost:4173 CHROME_PATH=<chromium> node scripts/check-lighthouse.mjs
 */
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const BASE = process.env.LH_BASE_URL ?? 'http://localhost:4173';
const ROUTES = (process.env.LH_ROUTES ?? '/,/login,/jobs').split(',');
const HARD = { accessibility: 0.95, 'best-practices': 0.9, seo: 0.85 };
const PERF_WARN = Number(process.env.LH_PERF_WARN ?? 0.5);

const chrome = await chromeLauncher.launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  chromePath: process.env.CHROME_PATH || undefined,
});

const fmt = (s) => (s == null ? 'n/a' : Math.round(s * 100));
const rows = [];
try {
  for (const route of ROUTES) {
    const url = BASE + route;
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });
    const c = result.lhr.categories;
    rows.push({
      route,
      performance: c.performance?.score,
      accessibility: c.accessibility?.score,
      'best-practices': c['best-practices']?.score,
      seo: c.seo?.score,
    });
  }
} finally {
  await chrome.kill();
}

console.log('\n| Route | Perf | A11y | Best Practices | SEO |');
console.log('| --- | --- | --- | --- | --- |');
for (const r of rows) {
  console.log(
    `| ${r.route} | ${fmt(r.performance)} | ${fmt(r.accessibility)} | ${fmt(r['best-practices'])} | ${fmt(r.seo)} |`,
  );
}
console.log(`\nPERF_JSON ${JSON.stringify(rows)}`);

const failures = [];
for (const r of rows) {
  for (const [cat, min] of Object.entries(HARD)) {
    if ((r[cat] ?? 0) < min) failures.push(`${r.route} ${cat}=${fmt(r[cat])} < ${min * 100}`);
  }
  if ((r.performance ?? 0) < PERF_WARN) {
    console.warn(
      `WARN: ${r.route} performance=${fmt(r.performance)} (baseline, below ${PERF_WARN * 100})`,
    );
  }
}
if (failures.length) {
  console.error(`\nLIGHTHOUSE FAIL:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nPASS — Lighthouse a11y / best-practices / SEO thresholds met on all routes.');
