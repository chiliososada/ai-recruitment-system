import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';

/**
 * SEC-3 (a) — createLogger must redact sensitive fields so secrets never reach the logs
 * (FR-03.5, §8). We capture pino's output to an in-memory stream and assert each sensitive
 * value is replaced by the `[redacted]` censor. Values used here are all fake.
 */
function captureLog(fields: Record<string, unknown>): Record<string, unknown> {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  // Force every level through so the line is emitted regardless of the default level.
  const config = loadConfig({ NODE_ENV: 'test', LOCAL_JWT_SECRET: 'x', LOG_LEVEL: 'trace' });
  const log = createLogger(config, sink);
  log.info(fields, 'sensitive payload');
  const line = chunks.join('').trim().split('\n').filter(Boolean).at(-1)!;
  return JSON.parse(line) as Record<string, unknown>;
}

describe('createLogger redaction (SEC-3)', () => {
  it('redacts every known sensitive field at the top level', () => {
    const out = captureLog({
      password: 'sup3r-secret-pw',
      token: 'tok-abc123',
      accessToken: 'access-xyz789',
      resumeText: 'Full resume body with PII',
      prompt: 'system prompt text',
      apiKey: 'sk-live-deadbeef',
    });

    expect(out.password).toBe('[redacted]');
    expect(out.token).toBe('[redacted]');
    expect(out.accessToken).toBe('[redacted]');
    expect(out.resumeText).toBe('[redacted]');
    expect(out.prompt).toBe('[redacted]');
    expect(out.apiKey).toBe('[redacted]');

    // The whole serialized line must not leak any of the raw secret values.
    const raw = JSON.stringify(out);
    for (const secret of [
      'sup3r-secret-pw',
      'tok-abc123',
      'access-xyz789',
      'Full resume body with PII',
      'system prompt text',
      'sk-live-deadbeef',
    ]) {
      expect(raw).not.toContain(secret);
    }
  });

  it('redacts nested sensitive fields (wildcard paths) and authorization headers', () => {
    const out = captureLog({
      user: { password: 'nested-pw', apiKey: 'nested-key' },
      headers: { authorization: 'Bearer real.jwt.token' },
    });

    const user = out.user as Record<string, unknown>;
    expect(user.password).toBe('[redacted]');
    expect(user.apiKey).toBe('[redacted]');
    const headers = out.headers as Record<string, unknown>;
    expect(headers.authorization).toBe('[redacted]');
    expect(JSON.stringify(out)).not.toContain('Bearer real.jwt.token');
  });
});
