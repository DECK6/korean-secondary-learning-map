import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const sha256 = (contents) => createHash('sha256').update(contents).digest('hex');

test('pins the complete official source inventory', async () => {
  const catalog = await readJson('../sources/official/source-catalog.json');
  const receipts = await readJson('../sources/official/source-receipts.json');
  expect(catalog.sourceCount).toBe(38);
  expect(receipts.sourceCount).toBe(38);
  expect(receipts.totalBytes).toBe(210511860);
  expect(receipts.sources.every((source) => source.sha256.length === 64 && source.pdfPages > 0)).toBe(true);
});

test('publishes ontology and UI manifests with matching hashes', async () => {
  for (const manifestPath of ['../dist/ontology/manifest.json', '../dist/ui/manifest.json']) {
    const manifest = await readJson(manifestPath);
    for (const artifact of manifest.artifacts) {
      const contents = await readFile(new URL(`../${artifact.path}`, import.meta.url));
      expect(contents.byteLength).toBe(artifact.bytes);
      expect(sha256(contents)).toBe(artifact.sha256);
    }
  }
});

test('keeps educational interpretations visibly non-official', async () => {
  const pathways = await readJson('../data/kr/high/pathways.json');
  const transitions = await readJson('../data/kr/bridges/transition-alignments.json');
  expect(pathways.records.every((item) => item.pathwayKind === 'illustrative' && item.notOfficialRequirement === true && item.reviewStatus === 'candidate')).toBe(true);
  expect(transitions.records.every((item) => item.reviewStatus === 'candidate' && item.basisKind === 'repository-authored')).toBe(true);
});
