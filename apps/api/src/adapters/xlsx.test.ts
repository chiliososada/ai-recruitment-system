import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { makeResumeXlsx, SAMPLE_RESUME_TEXT } from '../testing/fixtures.js';
import { extractResumeText } from './extract.js';
import {
  decodeXml,
  excelSerialToDate,
  extractXlsxText,
  isPlainXlsx,
  MAX_XLSX_XML_BYTES,
  XlsxError,
} from './xlsx.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('xlsx résumé extraction', () => {
  it('extracts every text row of the visible sheet, in order', async () => {
    const text = await extractXlsxText(await makeResumeXlsx(SAMPLE_RESUME_TEXT));
    expect(text.startsWith('【職務経歴書】')).toBe(true);
    for (const line of SAMPLE_RESUME_TEXT.split('\n').filter(Boolean)) {
      expect(text).toContain(line);
    }
    const ts = text.indexOf('TypeScript');
    const exp = text.indexOf('Experience:');
    expect(ts).toBeGreaterThan(-1);
    expect(exp).toBeGreaterThan(ts);
  });

  it('drops furigana (phonetic runs) and renders date-formatted cells as dates', async () => {
    const text = await extractXlsxText(await makeResumeXlsx('x'));
    const firstRow = text.split('\n')[1];
    expect(firstRow).toBe('東京都\t2015/04/01\t7');
    expect(text).not.toContain('トウキョウト');
  });

  it('skips hidden sheets', async () => {
    const text = await extractXlsxText(await makeResumeXlsx('visible', { withHiddenSheet: true }));
    expect(text).toContain('visible');
    expect(text).not.toContain('HIDDEN-LOOKUP-DATA');
  });

  it('reads inline strings, formula string results and booleans; decodes entities', async () => {
    const extra =
      `<row r="50"><c r="A50" t="inlineStr"><is><r><t>R&amp;D </t></r><r><t>リーダー</t></r></is></c>` +
      `<c r="B50" t="str"><f>A1&amp;"x"</f><v>計算結果</v></c><c r="C50" t="b"><v>1</v></c>` +
      `<c r="D50" t="e"><v>#N/A</v></c></row>`;
    const text = await extractXlsxText(await makeResumeXlsx('x', { extraRowsXml: extra }));
    expect(text).toContain('R&D リーダー\t計算結果\tTRUE');
    expect(text).not.toContain('#N/A');
  });

  it('is routed by extractResumeText for the xlsx MIME type', async () => {
    const text = await extractResumeText(await makeResumeXlsx('Go, Kubernetes'), XLSX);
    expect(text).toContain('Go, Kubernetes');
  });

  it('refuses macro-enabled workbooks and non-workbooks', async () => {
    const macro = await makeResumeXlsx('x', { withMacros: true });
    expect(await isPlainXlsx(macro)).toBe(false);
    await expect(extractXlsxText(macro)).rejects.toBeInstanceOf(XlsxError);

    const notExcel = new JSZip();
    notExcel.file('word/document.xml', '<w:document/>');
    const buf = await notExcel.generateAsync({ type: 'nodebuffer' });
    expect(await isPlainXlsx(buf)).toBe(false);
    expect(await isPlainXlsx(Buffer.from('not a zip at all'))).toBe(false);
    expect(await isPlainXlsx(await makeResumeXlsx('ok'))).toBe(true);
  });

  it('stops reading a decompression bomb instead of inflating it', async () => {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      '<workbook><sheets><sheet name="s" sheetId="1" r:id="rId1"/></sheets></workbook>',
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    );
    // Highly compressible payload just over the cap.
    zip.file('xl/sharedStrings.xml', 'a'.repeat(MAX_XLSX_XML_BYTES + 1024));
    const bomb = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(extractXlsxText(bomb)).rejects.toBeInstanceOf(XlsxError);
  });
});

describe('xlsx helpers', () => {
  it('converts Excel serial dates in both date systems', () => {
    expect(excelSerialToDate(1)).toBe('1900/01/01');
    expect(excelSerialToDate(59)).toBe('1900/02/28');
    expect(excelSerialToDate(61)).toBe('1900/03/01');
    expect(excelSerialToDate(42095)).toBe('2015/04/01');
    expect(excelSerialToDate(45000.75)).toBe('2023/03/15');
    expect(excelSerialToDate(1, true)).toBe('1904/01/02');
    expect(excelSerialToDate(-3)).toBeNull();
  });

  it('decodes only predefined and numeric XML entities', () => {
    expect(decodeXml('a &lt;b&gt; &amp; &#x6771;&#20140; &custom;')).toBe('a <b> & 東京 &custom;');
  });
});
