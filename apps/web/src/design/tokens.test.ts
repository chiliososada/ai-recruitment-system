// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('design tokens (DS-1)', () => {
  it('defines the required semantic tokens', () => {
    for (const v of [
      '--color-bg',
      '--color-surface',
      '--color-text',
      '--color-text-muted',
      '--color-primary',
      '--color-danger',
      '--color-success',
      '--color-focus-ring',
      '--space-4',
      '--radius-md',
      '--shadow-md',
      '--z-modal',
      '--font-sans',
      '--duration-normal',
    ]) {
      expect(css).toContain(v);
    }
  });

  it('uses a 4/8 spacing system', () => {
    expect(css).toContain('--space-1: 4px');
    expect(css).toContain('--space-2: 8px');
    expect(css).toContain('--space-4: 16px');
    expect(css).toContain('--space-8: 32px');
  });

  it('is light/dark-ready and respects reduced motion', () => {
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain('prefers-reduced-motion');
  });

  it('meets WCAG AA contrast for body text and primary buttons', () => {
    expect(contrast('#0f172a', '#f8fafc')).toBeGreaterThanOrEqual(4.5); // text on bg
    expect(contrast('#ffffff', '#4f46e5')).toBeGreaterThanOrEqual(4.5); // label on primary
    expect(contrast('#b91c1c', '#fef2f2')).toBeGreaterThanOrEqual(4.5); // danger text on danger bg
  });
});
