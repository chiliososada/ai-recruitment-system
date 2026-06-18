import { describe, expect, it } from 'vitest';
import en from './locales/en';
import ja from './locales/ja';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';

type Tree = Record<string, unknown>;

function keyPaths(obj: Tree, prefix = ''): string[] {
  return Object.entries(obj)
    .flatMap(([k, v]) => {
      const path = prefix ? `${prefix}.${k}` : k;
      return v && typeof v === 'object' && !Array.isArray(v) ? keyPaths(v as Tree, path) : [path];
    })
    .sort();
}

function leaves(obj: Tree): string[] {
  return Object.values(obj).flatMap((v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? leaves(v as Tree) : [String(v)],
  );
}

const base = keyPaths(en);

describe('i18n key parity (FR-09.3)', () => {
  const others: Record<string, Tree> = { ja, 'zh-CN': zhCN, 'zh-TW': zhTW };
  for (const [name, dict] of Object.entries(others)) {
    it(`${name} has exactly the same keys as en`, () => {
      expect(keyPaths(dict)).toEqual(base);
    });
  }

  it('every locale has only non-empty string leaves', () => {
    for (const dict of [en, ja, zhCN, zhTW] as Tree[]) {
      for (const value of leaves(dict)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
