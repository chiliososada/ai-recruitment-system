import type { Deps } from '../deps.js';
import { runParse } from '../services/resume.js';

/**
 * Register durable job handlers. Kept separate from the queue so handlers can close over the
 * fully-built `Deps` without a construction cycle.
 */
export function registerJobHandlers(deps: Deps): void {
  deps.jobs.register('resume_parse', async (payload) => {
    const parseJobId = String(payload.parseJobId ?? '');
    if (!parseJobId) throw new Error('resume_parse: missing parseJobId');
    await deps.metrics.time('job_resume_parse_duration', () => runParse(deps, parseJobId), {
      kind: 'resume_parse',
    });
    deps.metrics.increment('jobs_processed_total', { kind: 'resume_parse' });
  });
}
