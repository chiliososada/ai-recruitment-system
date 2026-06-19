# Industrial Upgrade — Verification

Records exact commands, exit codes, test counts, screenshot paths, performance, a11y and security
evidence for the industrial upgrade. Rebuilt with fresh evidence on the final verification round.

> Status: **IN PROGRESS**. The baseline (pre-upgrade) gates are recorded below; extended gates are
> filled as each phase lands and re-confirmed in the final run.

## Baseline gate run (pre-upgrade, commit `73b3e22`) — all exit 0
Command: `node scripts/verify.mjs`
```
✅ PASS  Install / lockfile        [npm ci]
✅ PASS  Format check              [npm run format:check]
✅ PASS  git diff --check          [git diff --check]
✅ PASS  Lint                      [npm run lint]
✅ PASS  Typecheck                 [npm run typecheck]
✅ PASS  Unit tests (50)           [npm run test:unit]
✅ PASS  API integration tests (58)[npm run test:integration]
✅ PASS  RLS / DB tests (26)       [npm run test:rls]
✅ PASS  Production build          [npm run build]
✅ PASS  Migration validation      [npm run db:migrate:check]
✅ PASS  E2E (Playwright) (4)      [npm run test:e2e]
```
Total **138 automated tests** pass. This is the protected baseline (see `FEATURE_PARITY.md`).

## Extended gate matrix (target — filled as phases complete)
| Gate | Command | Exit | Evidence |
|------|---------|------|----------|
| Component tests (DS) | `npm run test:unit` (web) | _pending_ | |
| Accessibility (axe) | `npm run test:a11y` | _pending_ | 0 critical/serious |
| Visual regression | `npm run test:visual` | _pending_ | screenshot paths |
| Contract (OpenAPI) | included in `test:integration` | _pending_ | |
| Durable job queue | included in unit + integration | _pending_ | state-machine tests |
| Security headers / files | included in integration | _pending_ | |
| Dependency / secret scan | `npm run scan:security` | _pending_ | no unexplained high/critical |
| Bundle budget | `npm run check:bundle` | _pending_ | budget table |
| Lighthouse CI | `npm run test:lighthouse` | _pending_ | a11y≥95, BP≥95, SEO≥90 |
| API/DB benchmark | `npm run bench` | _pending_ | p50/p95 → PERFORMANCE.md |
| Docker build | `docker build` (or documented) | _pending_ | |

## Screenshots
- Pre-upgrade baseline: `apps/web/visual-baseline/` (pending IB-3).
- Post-upgrade key pages @1440×900 + 390×844, 4 locales: `apps/web/test-results/` / committed
  snapshots (pending VIS-1).

Detailed per-round logs appended below as gates execute.
