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
