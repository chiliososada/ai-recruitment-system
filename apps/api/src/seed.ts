/**
 * Programmatic demo seed for local dev (FR-10/§10 — lets a reviewer walk both E2E paths).
 * Creates a demo seeker (with a parsed résumé + AI analysis + embedding) and a demo company
 * with a public job, via the real services. Idempotent-ish: re-running after a seed is a no-op.
 *
 * Run: `npm run seed -w @ars/api`  (uses the configured runtime; default local PGlite).
 */
import { CreateJobSchema } from '@ars/shared';
import { loadConfig } from './config.js';
import { buildDeps } from './deps.js';
import { AppError } from './errors.js';
import type { Principal } from './http/context.js';
import * as authService from './services/auth.js';
import { createCompany } from './services/company.js';
import { createJob } from './services/job.js';
import { uploadResume } from './services/resume.js';
import { SAMPLE_RESUME_TEXT, makeResumePdf } from './testing/fixtures.js';

const PASSWORD = 'passw0rd1';

async function main(): Promise<void> {
  const config = loadConfig();
  // buildDeps → createDb applies bootstrap + migrations for the local runtime.
  const deps = await buildDeps(config);

  try {
    const seeker = await authService.register(deps, {
      email: 'seeker@example.com',
      password: PASSWORD,
      role: 'job_seeker',
      displayName: 'Demo Seeker',
      locale: 'ja',
    });
    const seekerPrincipal: Principal = {
      userId: seeker.user.id,
      email: seeker.user.email,
      role: 'job_seeker',
      emailVerified: true,
    };
    const pdf = await makeResumePdf(SAMPLE_RESUME_TEXT);
    await uploadResume(deps, seekerPrincipal, {
      filename: 'resume.pdf',
      mime: 'application/pdf',
      buffer: pdf,
    });

    const company = await authService.register(deps, {
      email: 'recruiter@example.com',
      password: PASSWORD,
      role: 'company_member',
      displayName: 'Demo Recruiter',
      locale: 'ja',
    });
    const companyPrincipal: Principal = {
      userId: company.user.id,
      email: company.user.email,
      role: 'company_member',
      emailVerified: true,
    };
    const comp = await createCompany(deps, companyPrincipal, {
      name: 'Demo Tech Inc',
      industry: 'Software',
      size: '51-200',
      location: 'Tokyo',
    });
    await createJob(
      deps,
      companyPrincipal,
      comp.id,
      CreateJobSchema.parse({
        title: 'Full-Stack Engineer',
        category: 'Engineering',
        description: 'Build TypeScript, React and Node.js apps backed by PostgreSQL on AWS.',
        requiredSkills: ['TypeScript', 'React', 'Node.js'],
        preferredSkills: ['PostgreSQL', 'AWS'],
        minYears: 3,
        salaryMin: 6_000_000,
        salaryMax: 10_000_000,
        workStyle: 'hybrid',
        status: 'open',
        visibility: 'public',
      }),
    );

    deps.log.info('Seed complete. Demo logins (password "passw0rd1"):');
    deps.log.info('  seeker:    seeker@example.com');
    deps.log.info('  recruiter: recruiter@example.com');
  } catch (err) {
    if (err instanceof AppError && err.code === 'CONFLICT') {
      deps.log.info('Demo data already present — skipping.');
    } else {
      throw err;
    }
  } finally {
    await deps.db.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed', err);
  process.exit(1);
});
