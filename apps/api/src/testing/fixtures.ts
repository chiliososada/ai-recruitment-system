import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/** Build a real, parseable PDF resume from text (test/dev fixtures + programmatic seed). */
export async function makeResumePdf(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([612, 792]);
  let y = 740;
  for (const raw of text.split('\n')) {
    const line = raw.slice(0, 95);
    if (y < 50) {
      page = doc.addPage([612, 792]);
      y = 740;
    }
    page.drawText(line || ' ', { x: 50, y, size: 11, font });
    y -= 16;
  }
  return Buffer.from(await doc.save());
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Build a real, parseable DOCX resume from text. */
export async function makeResumeDocx(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`,
  );
  zip
    .folder('_rels')!
    .file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`,
    );
  const paras = text
    .split('\n')
    .map((l) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(l)}</w:t></w:r></w:p>`)
    .join('');
  zip
    .folder('word')!
    .file(
      'document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:body>${paras}</w:body></w:document>`,
    );
  return zip.generateAsync({ type: 'nodebuffer' });
}

export interface XlsxFixtureOptions {
  /** Extra worksheet rows appended after the text rows (raw `<row>` XML). */
  extraRowsXml?: string;
  /** Add `xl/vbaProject.bin` (a macro-enabled workbook renamed to .xlsx). */
  withMacros?: boolean;
  /** Prepend a hidden sheet that must be skipped. */
  withHiddenSheet?: boolean;
}

/**
 * Build a real, parseable XLSX résumé: one visible sheet named 「職務経歴書」 with one text cell
 * per line (shared strings, including a furigana `<rPh>` run that must be ignored), plus a
 * date-formatted cell (style 1 = numFmt 14).
 */
export async function makeResumeXlsx(text: string, opts: XlsxFixtureOptions = {}): Promise<Buffer> {
  const zip = new JSZip();
  const lines = text.split('\n');
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  );
  const sheets = opts.withHiddenSheet
    ? `<sheet name="hidden" sheetId="2" state="hidden" r:id="rId2"/><sheet name="職務経歴書" sheetId="1" r:id="rId1"/>`
    : `<sheet name="職務経歴書" sheetId="1" r:id="rId1"/>`;
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${sheets}</sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>` +
      `</Relationships>`,
  );
  const shared = [
    `<si><t>東京都</t><rPh sb="0" eb="3"><t>トウキョウト</t></rPh><phoneticPr fontId="1"/></si>`,
    ...lines.map((l) => `<si><t xml:space="preserve">${escapeXml(l)}</t></si>`),
  ];
  zip.file(
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">` +
      `${shared.join('')}</sst>`,
  );
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs>` +
      `</styleSheet>`,
  );
  const rows = [
    // Row 1: furigana-bearing shared string, a date (2015-04-01 = serial 42095) and a number.
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="1"><v>42095</v></c><c r="C1"><v>7</v></c></row>`,
    `<row r="2"/>`,
    ...lines.map((_, i) => `<row r="${i + 3}"><c r="A${i + 3}" t="s"><v>${i + 1}</v></c></row>`),
  ].join('');
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
      `${rows}${opts.extraRowsXml ?? ''}</sheetData></worksheet>`,
  );
  if (opts.withHiddenSheet) {
    zip.file(
      'xl/worksheets/sheet2.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
        `<row r="1"><c r="A1" t="inlineStr"><is><t>HIDDEN-LOOKUP-DATA</t></is></c></row>` +
        `</sheetData></worksheet>`,
    );
  }
  if (opts.withMacros) zip.file('xl/vbaProject.bin', Buffer.from('fake vba project'));
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** The standard EICAR antivirus test file (used to assert the scanner rejects it). */
export function eicarFile(): Buffer {
  return Buffer.from(
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$' + 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    'latin1',
  );
}

export const SAMPLE_RESUME_TEXT = [
  'Aoi Tanaka — Senior Full-Stack Engineer',
  'Tokyo, Japan',
  '',
  'Summary: 7 years of experience building web platforms.',
  'Skills: TypeScript, React, Node.js, PostgreSQL, AWS, Docker.',
  'Experience:',
  '- Led a React + TypeScript frontend team for 4 years.',
  '- Built Node.js microservices backed by PostgreSQL.',
  '- Deployed services on AWS with Docker and Kubernetes.',
  'Languages: Japanese (native), English (business).',
].join('\n');
