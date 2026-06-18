#!/usr/bin/env node
/**
 * Quality-gate orchestrator (NFR-GATES). Runs every applicable gate in dependency
 * order, prints a pass/fail summary with exit codes, and exits non-zero if any gate
 * fails. Evidence from a run of this script is recorded in docs/implementation/VERIFICATION.md.
 *
 * Usage: node scripts/verify.mjs [--skip-e2e] [--skip-install]
 */
import { execSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const skipE2E = args.has('--skip-e2e');
const skipInstall = args.has('--skip-install');

const gates = [
  !skipInstall && ['Install / lockfile', 'npm ci'],
  ['Format check', 'npm run format:check'],
  ['git diff --check', 'git diff --check'],
  ['Lint', 'npm run lint'],
  ['Typecheck', 'npm run typecheck'],
  ['Unit tests', 'npm run test:unit'],
  ['API integration tests', 'npm run test:integration'],
  ['RLS / DB tests', 'npm run test:rls'],
  ['Production build', 'npm run build'],
  ['Migration validation', 'npm run db:migrate:check'],
  !skipE2E && ['E2E (Playwright)', 'freeports && npm run test:e2e'],
].filter(Boolean);

function freePorts() {
  try {
    execSync('lsof -ti tcp:4000 tcp:5173 2>/dev/null | xargs kill -9 2>/dev/null', {
      stdio: 'ignore',
    });
  } catch {
    /* nothing to kill */
  }
}

const results = [];
for (const [name, command] of gates) {
  const cmd = command.replace(/^freeports && /, '');
  if (command.startsWith('freeports')) freePorts();
  process.stdout.write(`\n▶ ${name}: ${cmd}\n`);
  const start = Date.now();
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 600_000 });
    results.push({ name, cmd, ok: true, ms: Date.now() - start });
  } catch {
    results.push({ name, cmd, ok: false, ms: Date.now() - start });
    break; // stop at first failure
  }
}

console.log('\n================ GATE SUMMARY ================');
let failed = false;
for (const r of results) {
  console.log(
    `${r.ok ? '✅ PASS' : '❌ FAIL'}  ${r.name}  (${(r.ms / 1000).toFixed(1)}s)  [${r.cmd}]`,
  );
  if (!r.ok) failed = true;
}
const ran = results.length;
const total = gates.length;
if (ran < total) console.log(`(stopped early: ${ran}/${total} gates executed)`);
console.log('=============================================');
process.exit(failed ? 1 : 0);
