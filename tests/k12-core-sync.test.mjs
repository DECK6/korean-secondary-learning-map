import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// The K-12 core TBox is kept as a byte-identical copy in the elementary and secondary
// repositories. The baseline hash recorded in the file header is the sha256 of the file with the
// header hash line removed, so both copies can be checked offline and independently.
const HASH_LINE = /^# k12-core-sync-sha256: ([0-9a-f]{64})\n/m;
const CORE_ONTOLOGY_IRI = 'https://dexa.art/learnmap/ontology/k12-core';
const CORE_VERSION_IRI = 'https://dexa.art/learnmap/ontology/k12-core/1.0.0';

const coreText = await readFile(new URL('../ontology/k12-core.ttl', import.meta.url), 'utf8');

test('k12-core.ttl declares its own sync baseline hash', () => {
  const match = HASH_LINE.exec(coreText);
  expect(match).not.toBeNull();
  const body = coreText.replace(HASH_LINE, '');
  expect(createHash('sha256').update(body).digest('hex')).toBe(match[1]);
});

test('k12-core.ttl carries the versioned core ontology IRI', () => {
  expect(coreText).toContain(`<${CORE_ONTOLOGY_IRI}>`);
  expect(coreText).toContain(`owl:versionIRI <${CORE_VERSION_IRI}>`);
});

test('the repository TBox imports the core module', async () => {
  const tbox = await readFile(new URL('../ontology/learning-map.ttl', import.meta.url), 'utf8');
  expect(tbox).toContain(`owl:imports <${CORE_ONTOLOGY_IRI}>`);
});
