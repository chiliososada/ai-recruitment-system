import { describe, expect, it } from 'vitest';
import { logPreview, redactForLog } from './prompt-safety.js';

/**
 * SEC-3 (b) — the shared PII scrubber must strip emails, phone numbers and long secret-like
 * tokens from free text before it is logged (FR-03.5). All values here are fake.
 */
describe('redactForLog (SEC-3)', () => {
  it('masks email addresses', () => {
    expect(redactForLog('contact jane.doe+cv@example.co.jp now')).toBe('contact [email] now');
  });

  it('masks long opaque token-like strings', () => {
    const out = redactForLog('key FAKEKEY0123456789abcdefABCDEF0123 end');
    expect(out).toContain('[redacted]');
    expect(out).not.toContain('FAKEKEY0123456789abcdefABCDEF0123');
  });

  it('masks phone numbers in common formats', () => {
    const cases = [
      'call +1-555-123-4567 today',
      'reach me at (555) 123-4567',
      'mobile 090-1234-5678',
      'intl +81 90 1234 5678 ok',
    ];
    for (const c of cases) {
      const out = redactForLog(c);
      expect(out).toContain('[phone]');
      // No run of phone digits should survive.
      expect(out).not.toMatch(/\d{3}[\s.-]\d{3,4}[\s.-]\d{4}/);
    }
  });

  it('scrubs multiple PII classes in one string', () => {
    const out = redactForLog('email a@b.com phone +1-555-123-4567 token ABCDEFGHIJKLMNOPQRSTUVWX');
    expect(out).toContain('[email]');
    expect(out).toContain('[phone]');
    expect(out).toContain('[redacted]');
    expect(out).not.toContain('a@b.com');
    expect(out).not.toContain('555-123-4567');
  });

  it('leaves benign text untouched', () => {
    expect(redactForLog('Senior Engineer with 7 years of TypeScript')).toBe(
      'Senior Engineer with 7 years of TypeScript',
    );
  });
});

describe('logPreview (SEC-3)', () => {
  it('redacts PII and truncates long previews', () => {
    // Long but benign trailing text (repeated short words survive redaction) so truncation fires.
    const long = `email leak test@corp.com phone +1-555-123-4567 ${'lorem '.repeat(40)}`;
    const out = logPreview(long, 60);
    expect(out).toContain('[email]');
    expect(out).toContain('[phone]');
    expect(out.length).toBe(61); // 60 chars + the ellipsis
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('test@corp.com');
  });

  it('collapses whitespace and keeps short previews intact', () => {
    expect(logPreview('  hello   world  ')).toBe('hello world');
  });
});
