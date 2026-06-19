/** Build/version metadata surfaced on /health (overridable at build/deploy time). */
export const APP_VERSION = process.env.APP_VERSION ?? '0.1.0';
export const APP_COMMIT = process.env.GIT_COMMIT ?? 'dev';
const STARTED_AT = Date.now();

export function uptimeSeconds(): number {
  return Math.round((Date.now() - STARTED_AT) / 1000);
}
