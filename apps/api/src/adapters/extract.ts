import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Extract plain text from an uploaded resume (FR-02.5). PDF via unpdf (pdf.js), DOCX via
 * mammoth. Detection prefers the declared MIME, falling back to magic bytes.
 */
export async function extractResumeText(data: Buffer, mime: string): Promise<string> {
  const isPdf = mime === 'application/pdf' || data.subarray(0, 5).toString('latin1') === '%PDF-';
  if (isPdf) {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join('\n') : text).trim();
  }
  // DOCX is a zip; mammoth reads the document part.
  const result = await mammoth.extractRawText({ buffer: data });
  return result.value.trim();
}
