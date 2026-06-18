# Verification — quality gate evidence

This file records the exact commands, exit codes, and result summaries for every
applicable quality gate. It is rewritten with fresh evidence on the final verification round.

> Status: **IN PROGRESS** — gates are run and recorded as the implementation lands.
> Each gate row is only filled from a real command run (no gate is assumed to pass).

## Gate matrix (target)
| # | Gate | Command | Exit | Evidence |
|---|------|---------|------|----------|
| 1 | Install / lockfile | `npm ci` | _pending_ | |
| 2 | Format check | `npm run format:check` | _pending_ | |
| 3 | git diff --check | `git diff --check` | _pending_ | |
| 4 | Lint | `npm run lint` | _pending_ | |
| 5 | Typecheck | `npm run typecheck` | _pending_ | |
| 6 | Unit tests | `npm run test:unit` | _pending_ | |
| 7 | API integration | `npm run test:integration` | _pending_ | |
| 8 | RLS / DB tests | `npm run test:rls` | _pending_ | |
| 9 | E2E (Playwright) | `npm run test:e2e` | _pending_ | |
| 10 | Production build | `npm run build` | _pending_ | |
| 11 | Migration validation | `npm run db:migrate:check` | _pending_ | |

Detailed per-round command logs are appended below as gates are executed.
