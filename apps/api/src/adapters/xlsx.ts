import JSZip from 'jszip';

/**
 * Plain-text extraction from an Excel workbook (.xlsx) for résumé parsing (FR-02.5).
 *
 * Japanese résumés and skill sheets are frequently kept in Excel. The workbook is an
 * OOXML zip; this reads the shared-string table and each worksheet in workbook order and
 * emits one line per row (cells joined by tabs) — enough structure for the AI analysis.
 *
 * Safety: the XML is never handed to a DTD-processing parser (no entity expansion), the
 * total decompressed XML is capped (zip-bomb guard), and macro-enabled workbooks are
 * refused. Only text is read; nothing is executed.
 */

/** Hard cap on decompressed XML we are willing to read (sharedStrings + sheets + styles). */
export const MAX_XLSX_XML_BYTES = 40 * 1024 * 1024;
/** Cap on emitted text — far beyond any résumé; protects downstream prompts. */
const MAX_TEXT_CHARS = 200_000;
const MAX_SHEETS = 30;

export class XlsxError extends Error {}

/** True when the zip looks like a genuine, macro-free Excel workbook. */
export async function isPlainXlsx(data: Buffer): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(data);
    if (!zip.file('xl/workbook.xml')) return false;
    if (zip.file('xl/vbaProject.bin')) return false; // macro-enabled workbook renamed to .xlsx
    return true;
  } catch {
    return false;
  }
}

async function readEntry(
  zip: JSZip,
  name: string,
  budget: { left: number },
): Promise<string | null> {
  const entry = zip.file(name);
  if (!entry) return null;
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let aborted = false;
    // Streamed inflate with a running byte budget, so a zip bomb is cut off early instead of
    // being decompressed into memory in one go.
    const stream = entry.nodeStream('nodebuffer');
    stream.on('data', (chunk: Buffer) => {
      if (aborted) return;
      budget.left -= chunk.length;
      if (budget.left < 0) {
        aborted = true;
        stream.pause();
        stream.removeAllListeners('data');
        reject(new XlsxError('Workbook is too large to read'));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', (err: Error) => {
      if (!aborted) reject(err);
    });
    stream.on('end', () => {
      if (!aborted) resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Decode the five predefined XML entities and numeric references (no custom entities). */
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref.startsWith('#x')) {
      const cp = Number.parseInt(ref.slice(2), 16);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    if (ref.startsWith('#')) {
      const cp = Number.parseInt(ref.slice(1), 10);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    return XML_ENTITIES[ref] ?? whole;
  });
}

/**
 * Text of a rich-text / inline-string node. Phonetic guides (`<rPh>`, furigana that
 * Japanese Excel stores next to kanji) are dropped so 「東京都」 does not become
 * 「東京都トウキョウト」.
 */
function richText(xml: string): string {
  const withoutPhonetics = xml
    .replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
    .replace(/<phoneticPr\b[^>]*\/>/g, '');
  let out = '';
  for (const m of withoutPhonetics.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    out += decodeXml(m[1] ?? '');
  }
  return out;
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const out: string[] = [];
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) {
    out.push(m[1] ? richText(m[1]) : '');
  }
  return out;
}

/** Built-in number formats that render as dates (incl. the Japanese-locale ids). */
const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58,
]);

/** Style index → whether the cell's number format is a date. */
function parseDateStyles(xml: string | null): boolean[] {
  if (!xml) return [];
  const customDate = new Set<number>();
  for (const m of xml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    // Strip quoted literals and [colour]/[locale] sections, then look for date tokens.
    const code = decodeXml(m[2] ?? '')
      .replace(/"[^"]*"/g, '')
      .replace(/\[[^\]]*\]/g, '');
    if (/[ymdhs]/i.test(code) || /[年月日]/.test(code)) customDate.add(Number(m[1]));
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? '';
  const out: boolean[] = [];
  for (const m of cellXfs.matchAll(/<xf\b([^>]*)\/?>/g)) {
    const id = Number(/numFmtId="(\d+)"/.exec(m[1] ?? '')?.[1] ?? 0);
    out.push(BUILTIN_DATE_FORMATS.has(id) || customDate.has(id));
  }
  return out;
}

/** Excel serial date → YYYY/MM/DD (1900 or 1904 date system). */
export function excelSerialToDate(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const whole = Math.floor(serial);
  const DAY = 86_400_000;
  // 1904 system: serial 0 = 1904-01-01. 1900 system: serial 1 = 1900-01-01, and Excel
  // counts a fictitious 1900-02-29 (serial 60), so from serial 61 the base shifts a day.
  const ms = date1904
    ? Date.UTC(1904, 0, 1) + whole * DAY
    : whole >= 61
      ? Date.UTC(1899, 11, 30) + whole * DAY
      : Date.UTC(1899, 11, 31) + whole * DAY;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}/${mo}/${da}`;
}

function formatNumber(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  // Avoid binary-float noise such as 0.30000000000000004.
  return String(Math.round(n * 1e10) / 1e10);
}

interface SheetRef {
  name: string;
  path: string;
}

/** Worksheets in workbook (tab) order, resolved through the workbook relationships. */
function orderedSheets(workbookXml: string, relsXml: string | null, names: string[]): SheetRef[] {
  const targets = new Map<string, string>();
  for (const m of (relsXml ?? '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = m[1] ?? '';
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) targets.set(id, target);
  }
  const sheets: SheetRef[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = m[1] ?? '';
    if (/\bstate="(hidden|veryHidden)"/.test(attrs)) continue;
    const name = decodeXml(/\bname="([^"]*)"/.exec(attrs)?.[1] ?? '');
    const rid = /\br:id="([^"]+)"/.exec(attrs)?.[1];
    const target = rid ? targets.get(rid) : undefined;
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    sheets.push({ name, path });
  }
  if (sheets.length > 0) return sheets;
  // Fallback: numeric order of the worksheet parts.
  return names
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]))
    .map((path, i) => ({ name: `Sheet${i + 1}`, path }));
}

function sheetText(
  xml: string,
  shared: string[],
  dateStyles: boolean[],
  date1904: boolean,
): string {
  const lines: string[] = [];
  for (const row of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = [];
    for (const c of (row[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] ?? '';
      const inner = c[2] ?? '';
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
      const style = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? 0);
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let text = '';
      if (type === 's') text = v != null ? (shared[Number(v)] ?? '') : '';
      else if (type === 'inlineStr') text = richText(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '');
      else if (type === 'str') text = v != null ? decodeXml(v) : '';
      else if (type === 'b') text = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : '';
      else if (type === 'e') text = '';
      else if (v != null) {
        const asDate = dateStyles[style] ? excelSerialToDate(Number(v), date1904) : null;
        text = asDate ?? formatNumber(v);
      }
      text = text.replace(/\r\n?/g, '\n').trim();
      if (text) cells.push(text.replace(/\n+/g, ' / '));
    }
    if (cells.length > 0) lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

export async function extractXlsxText(data: Buffer): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new XlsxError('Not a valid Excel workbook');
  }
  if (zip.file('xl/vbaProject.bin'))
    throw new XlsxError('Macro-enabled workbooks are not accepted');
  const budget = { left: MAX_XLSX_XML_BYTES };
  const workbook = await readEntry(zip, 'xl/workbook.xml', budget);
  if (!workbook) throw new XlsxError('Not a valid Excel workbook');
  const rels = await readEntry(zip, 'xl/_rels/workbook.xml.rels', budget);
  const shared = parseSharedStrings(await readEntry(zip, 'xl/sharedStrings.xml', budget));
  const dateStyles = parseDateStyles(await readEntry(zip, 'xl/styles.xml', budget));
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbook);

  const parts: string[] = [];
  let total = 0;
  for (const sheet of orderedSheets(workbook, rels, Object.keys(zip.files)).slice(0, MAX_SHEETS)) {
    const xml = await readEntry(zip, sheet.path, budget);
    if (!xml) continue;
    const text = sheetText(xml, shared, dateStyles, date1904);
    if (!text) continue;
    const block = `【${sheet.name}】\n${text}`;
    parts.push(block);
    total += block.length;
    if (total > MAX_TEXT_CHARS) break;
  }
  return parts.join('\n\n').slice(0, MAX_TEXT_CHARS).trim();
}
