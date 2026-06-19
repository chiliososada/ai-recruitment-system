#!/usr/bin/env node
/**
 * SBOM generator (CICD / supply-chain). No external dependencies.
 *
 * Produces a CycloneDX Software Bill of Materials for the workspace root by shelling
 * out to `npm sbom --sbom-format cyclonedx --sbom-type application`, writes the JSON to
 * `sbom.cyclonedx.json` at the repo root, and prints the component count.
 *
 * The `npm sbom` subcommand requires npm >= 9.5.0. If the installed npm is older (or
 * the subcommand is otherwise unavailable), this is treated as a DOCUMENTED FALLBACK:
 * the script logs a WARNING and exits 0 so a CI pipeline that merely archives the SBOM
 * is not hard-broken by a toolchain that predates the feature. Every other failure
 * (write error, unparseable output, real npm error) exits non-zero.
 *
 * Usage:  node scripts/gen-sbom.mjs
 * Exit:   0 = SBOM written (or documented npm-too-old fallback)
 *         1 = real failure (npm error / bad output / write error)
 *
 * See docs/SECURITY.md → "Software Bill of Materials & dependency policy".
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const OUT_FILE = resolve(repoRoot, 'sbom.cyclonedx.json');

const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;

const MIN_NPM = [9, 5, 0]; // `npm sbom` landed in npm 9.5.0

function parseSemver(v) {
  const m = String(v)
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function geMinVersion(parts) {
  for (let i = 0; i < 3; i++) {
    if (parts[i] > MIN_NPM[i]) return true;
    if (parts[i] < MIN_NPM[i]) return false;
  }
  return true; // exactly equal
}

function getNpmVersion() {
  try {
    return execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** Documented soft-exit: log a WARNING and succeed so CI isn't hard-broken. */
function fallbackExit(reason) {
  console.warn(
    YELLOW(
      `WARNING: skipping SBOM generation — ${reason}. ` +
        `\`npm sbom\` requires npm >= ${MIN_NPM.join('.')}. ` +
        `Upgrade npm to produce ${relative(process.cwd(), OUT_FILE) || 'sbom.cyclonedx.json'}.`,
    ),
  );
  // Exit 0: this is an expected, documented limitation of an old toolchain, not a defect.
  process.exit(0);
}

function fail(message, detail) {
  console.error(RED(`SBOM generation FAILED: ${message}`));
  if (detail) console.error(String(detail).trim());
  process.exit(1);
}

console.log(BOLD('Generating CycloneDX SBOM'));
console.log(`repo: ${relative(process.cwd(), repoRoot) || '.'}`);

const npmVersion = getNpmVersion();
if (npmVersion === null) {
  // npm itself is unavailable — that's an environment problem worth surfacing hard.
  fail('could not determine the npm version (`npm --version` failed). Is npm installed?');
}
const parsed = parseSemver(npmVersion);
if (!parsed) {
  fail(`could not parse the npm version string: "${npmVersion}".`);
}
if (!geMinVersion(parsed)) {
  fallbackExit(`installed npm is ${npmVersion}, which is too old to support \`npm sbom\``);
}
console.log(`npm:  ${npmVersion}`);

// Run the SBOM generation. npm prints the CycloneDX document to stdout.
let raw;
try {
  raw = execFileSync('npm', ['sbom', '--sbom-format', 'cyclonedx', '--sbom-type', 'application'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  // Some npm builds report an unknown subcommand here rather than via the version gate.
  const combined = `${err.stderr ?? ''}${err.stdout ?? ''}`;
  if (/Unknown command|usage:|did you mean/i.test(combined) && !/"components"/.test(combined)) {
    fallbackExit('`npm sbom` is not available in this npm build');
  }
  fail('`npm sbom` exited with an error', err.stderr || err.stdout || err.message);
}

if (!raw || !raw.trim()) {
  fail('`npm sbom` produced no output.');
}

let doc;
try {
  doc = JSON.parse(raw);
} catch (err) {
  fail('`npm sbom` output was not valid JSON.', err.message);
}

const components = Array.isArray(doc.components) ? doc.components : [];

try {
  // Pretty-print for readable diffs/inspection; trailing newline for POSIX-friendliness.
  writeFileSync(OUT_FILE, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
} catch (err) {
  fail(`could not write ${OUT_FILE}.`, err.message);
}

const format = doc.bomFormat ?? 'CycloneDX';
const specVersion = doc.specVersion ?? 'unknown';
console.log(
  GREEN(
    `\nWrote ${relative(process.cwd(), OUT_FILE) || 'sbom.cyclonedx.json'} ` +
      `(${format} ${specVersion}) — ${components.length} component(s).`,
  ),
);
process.exit(0);
