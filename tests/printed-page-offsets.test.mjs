import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'bun:test';
import { printedPageFor, printedPageOffset } from '../scripts/lib/printed-page-offsets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = (body, number) => `${body}\n\n${number === null ? '' : `                    ${number}`}\n`;

describe('printed page offsets', () => {
  let sources;
  let offsets;
  let pagesById;

  beforeAll(async () => {
    const receipts = JSON.parse(await readFile(join(root, 'sources/official/source-receipts.json'), 'utf8'));
    sources = receipts.sources;
    offsets = new Map();
    pagesById = new Map();
    for (const source of sources) {
      const text = await readFile(join(root, source.textFile), 'utf8');
      offsets.set(source.id, printedPageOffset(text));
      pagesById.set(source.id, text.split('\f'));
    }
  }, 120000);

  test('reads a constant offset out of a numbered document', () => {
    const text = [page('표지', null), page('차례', null), ...Array.from({ length: 12 }, (_, i) => page('본문', i + 1))].join('\f');
    expect(printedPageOffset(text)).toMatchObject({ offset: 2, numberedPages: 12 });
    expect(printedPageFor(9, 2)).toBe(7);
    // Front matter sits before the printed numbering, and an unknown offset yields no printed page.
    expect(printedPageFor(2, 2)).toBe(null);
    expect(printedPageFor(9, null)).toBe(null);
  });

  test('refuses to guess when a document disagrees with itself or is barely numbered', () => {
    const shifting = [
      ...Array.from({ length: 12 }, (_, i) => page('본문', i + 1)),
      ...Array.from({ length: 12 }, (_, i) => page('본문', i + 20)),
    ].join('\f');
    expect(printedPageOffset(shifting).offset).toBe(null);
    expect(printedPageOffset(shifting).offsets.length).toBe(2);
    const sparse = [...Array.from({ length: 30 }, () => page('본문', null)), page('본문', 1)].join('\f');
    expect(printedPageOffset(sparse).offset).toBe(null);
  });

  test('every official annex resolves one offset for the whole document', () => {
    const unresolved = sources.filter((source) => offsets.get(source.id).offset === null);
    expect(unresolved.map((source) => `${source.id} ${JSON.stringify(offsets.get(source.id).offsets)}`)).toEqual([]);
    // 별책8 was corrected by hand on 2026-09-05 to 인쇄 = PDF − 6; official-relation-specs/math.mjs
    // still carries that offset as `idPageOffset: -6`, so the derived value has to agree.
    expect(offsets.get('kr-moe-2022-33-annex8').offset).toBe(6);
  });

  test('every built standard cites a printed page that the cited PDF page really shows', async () => {
    for (const profile of ['middle', 'high']) {
      const records = JSON.parse(await readFile(join(root, `data/kr/${profile}/standards.json`), 'utf8')).records;
      const wrong = records.filter((record) => {
        const { sourceId, pdfPage, printedPage } = record.sourceLocator;
        return printedPage !== printedPageFor(pdfPage, offsets.get(sourceId).offset);
      });
      expect(wrong.map((record) => record.code)).toEqual([]);
      // Sample the running foot of the cited PDF page: it has to print the number we published.
      const sample = records.filter((_, index) => index % Math.ceil(records.length / 20) === 0).slice(0, 20);
      expect(sample.length).toBe(20);
      for (const record of sample) {
        const { sourceId, pdfPage, printedPage } = record.sourceLocator;
        const lines = pagesById.get(sourceId)[pdfPage - 1].split('\n').filter((line) => line.trim());
        const marks = [...lines.slice(-3), ...lines.slice(0, 2)].map((line) => line.trim());
        expect(marks).toContain(String(printedPage));
      }
    }
  });
});
