/** Coerce a DB timestamp (Date or string) to an ISO-8601 string for API responses. */
export function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 0) {
    const d = new Date(
      value.includes(' ') && !value.includes('T') ? value.replace(' ', 'T') : value,
    );
    return Number.isNaN(d.getTime()) ? value : d.toISOString();
  }
  return new Date(0).toISOString();
}

/** Parse a comma/space separated list into trimmed, non-empty, deduped tokens. */
export function parseList(input: string | undefined): string[] {
  if (!input) return [];
  return Array.from(
    new Set(
      input
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

export function pgArrayLiteral(values: string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}

/** Render a number[] as a pgvector literal, e.g. [0.1,0.2,...]. */
export function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}
