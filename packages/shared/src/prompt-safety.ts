/**
 * Defenses for treating resume / job text as untrusted input (FR-02.6, §8).
 *
 * The strategy is NOT to "detect" injection (brittle) but to:
 *  1. cap length and strip control bytes,
 *  2. pass the text only inside a clearly delimited DATA block (never as instructions),
 *  3. validate the model's output against a strict schema (see schemas/analysis.ts),
 *  4. redact PII/secrets before anything is logged.
 */

export const MAX_RESUME_CHARS = 20000;

/** Strip control characters (code < 32 except tab/newline, and 127) without regex escapes. */
function stripControl(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      out += ch;
    } else {
      out += ' ';
    }
  }
  return out;
}

/** Normalize untrusted document text before sending to the LLM. */
export function prepareDocumentText(text: string, maxChars: number = MAX_RESUME_CHARS): string {
  const cleaned = stripControl(text)
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned.slice(0, maxChars);
}

const DOC_OPEN = '<<<UNTRUSTED_DOCUMENT>>>';
const DOC_CLOSE = '<<<END_UNTRUSTED_DOCUMENT>>>';

/**
 * Wrap untrusted text in delimiters and neutralize any attempt to close the block early.
 * The caller's system prompt instructs the model to treat everything between the
 * delimiters as data, never as instructions.
 */
export function wrapUntrustedDocument(text: string): string {
  const body = prepareDocumentText(text)
    .split(DOC_OPEN)
    .join('<<<doc>>>')
    .split(DOC_CLOSE)
    .join('<<<end>>>');
  return `${DOC_OPEN}\n${body}\n${DOC_CLOSE}`;
}

/**
 * Mask PII/secrets so logs never contain them (FR-03.5): emails, phone numbers, and long
 * token-like strings. Emails are masked first so the local-part is never mistaken for a token;
 * phones next (they would otherwise survive the token pass), then long opaque tokens.
 */
export function redactForLog(text: string): string {
  return (
    text
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
      // Phone numbers: optional +country code, then 7+ digits with spaces/dashes/dots/parens.
      // Requires at least one separator or a leading + so plain long digit IDs aren't over-masked
      // by this pass (long opaque numbers are still caught by the token pass below).
      .replace(/(?<![\w@.])\+?\d[\d\s().-]{6,}\d(?![\w@])/g, (m) =>
        /[\s().-]/.test(m) || m.startsWith('+') ? '[phone]' : m,
      )
      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[redacted]')
  );
}

/** Truncate a string for safe log previews. */
export function logPreview(text: string, max = 120): string {
  const r = redactForLog(text.replace(/\s+/g, ' ').trim());
  return r.length > max ? `${r.slice(0, max)}…` : r;
}
