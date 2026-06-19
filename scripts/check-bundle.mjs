#!/usr/bin/env node
/**
 * Frontend bundle-size budget gate (PERF). No external dependencies.
 *
 * Reads the built JS chunks in apps/web/dist/assets/*.js, computes the gzipped size
 * of each, and FAILS (exit 1) if the LARGEST entry chunk's gzip size exceeds the
 * budget. The "entry" chunk is the initial JS the browser must download to boot the
 * SPA (heuristically the largest index-*.js / main-*.js, falling back to the largest
 * chunk overall); lazy route/locale chunks are reported but not budgeted.
 *
 * Budget: INITIAL_JS_GZIP_BUDGET_KB (default 200 KB gzip). Starting value — tighten
 * as code-splitting lands. Override per-run via the env var of the same name.
 *
 * PRECONDITION: run `npm run build` first so apps/web/dist exists.
 *
 * Usage:  node scripts/check-bundle.mjs
 * Exit:   0 = within budget, 1 = over budget / no build found.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;

const BUDGET_KB = Number(process.env.INITIAL_JS_GZIP_BUDGET_KB ?? 200);
const assetsDir = resolve(repoRoot, 'apps/web/dist/assets');

function kb(bytes) {
  return (bytes / 1024).toFixed(1);
}

if (!existsSync(assetsDir)) {
  console.error(
    RED(
      `No build found at ${assetsDir}.\nRun \`npm run build\` (or \`npm run build -w @ars/web\`) first.`,
    ),
  );
  process.exit(1);
}

const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
if (jsFiles.length === 0) {
  console.error(RED(`No .js chunks found in ${assetsDir}.`));
  process.exit(1);
}

const chunks = jsFiles
  .map((name) => {
    const buf = readFileSync(join(assetsDir, name));
    return { name, raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  })
  .sort((a, b) => b.gzip - a.gzip);

// Identify the entry chunk: prefer index-/main-/app- named chunks, else the largest.
const entryByName = chunks.find((c) => /(?:^|\/)(index|main|app)[.-]/i.test(c.name));
const entry = entryByName ?? chunks[0];

console.log(BOLD('\nFrontend bundle gzip sizes (apps/web/dist/assets/*.js)'));
console.log(`Budget (initial JS, gzip): ${BUDGET_KB} KB\n`);
for (const c of chunks) {
  const marker = c === entry ? ' (entry)' : '';
  console.log(`  ${c.name}${marker}\n    raw ${kb(c.raw)} KB   gzip ${kb(c.gzip)} KB`);
}

const entryGzipKb = entry.gzip / 1024;
console.log(BOLD('\n================ BUNDLE BUDGET ================'));
console.log(`  entry chunk : ${entry.name}`);
console.log(`  entry gzip  : ${kb(entry.gzip)} KB`);
console.log(`  budget      : ${BUDGET_KB} KB`);
console.log('===============================================');

if (entryGzipKb > BUDGET_KB) {
  console.error(
    RED(
      `\nFAIL — entry chunk gzip ${kb(entry.gzip)} KB exceeds budget ${BUDGET_KB} KB by ${(entryGzipKb - BUDGET_KB).toFixed(1)} KB.`,
    ),
  );
  console.error(
    'Reduce initial JS (code-split routes/locales, lazy-load heavy deps) or raise INITIAL_JS_GZIP_BUDGET_KB intentionally.',
  );
  process.exit(1);
}

console.log(GREEN(`\nPASS — entry chunk within budget (${kb(entry.gzip)} KB ≤ ${BUDGET_KB} KB).`));
process.exit(0);
