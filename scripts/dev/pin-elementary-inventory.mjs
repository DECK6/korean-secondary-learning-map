// Dev tool: re-pin data/kr/bridges/elementary-topic-inventory.json against the elementary repository.
// Usage: bun scripts/dev/pin-elementary-inventory.mjs [path-to-korean-elementary-learning-map] [--check]
// The bridge builders never read the elementary repository; they read this pin, so the pin carries
// every field the builders need: the topic id set, each standard's domain, and the representative
// (facetKey=concept) topic of each standard.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checkOnly = process.argv.includes('--check');
const elementaryRoot = resolve(process.argv.find((value, index) => index > 1 && !value.startsWith('--')) ?? join(root, '../korean-elementary-learning-map'));
const outputPath = join(root, 'data/kr/bridges/elementary-topic-inventory.json');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const byId = (a, b) => a.localeCompare(b, 'en');

function stableJson(value) {
  const sort = (input) => {
    if (Array.isArray(input)) return input.map(sort);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(Object.keys(input).sort(byId).map((key) => [key, sort(input[key])]));
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

const [manifest, topicsFile, standardsFile] = await Promise.all([
  readJson(join(elementaryRoot, 'data/kr/manifest.json')),
  readJson(join(elementaryRoot, 'data/kr/topics.json')),
  readJson(join(elementaryRoot, 'data/kr/curriculum-standards.json')),
]);

const topics = topicsFile.topics;
const topicsByStandard = new Map();
for (const topic of topics) {
  if (!topic.standardKey) throw new Error(`elementary topic ${topic.id} has no standardKey`);
  if (!topicsByStandard.has(topic.standardKey)) topicsByStandard.set(topic.standardKey, []);
  topicsByStandard.get(topic.standardKey).push(topic);
}

const standards = [];
for (const curriculum of standardsFile.curricula) {
  for (const standard of curriculum.standards) {
    const aligned = (topicsByStandard.get(standard.key) ?? []).slice().sort((a, b) => byId(a.id, b.id));
    if (!aligned.length) throw new Error(`elementary standard ${standard.key} has no topic`);
    // Contract v1 section 3: expand a standard through its concept facet, else its first topic.
    const representative = aligned.find((topic) => topic.facetKey === 'concept') ?? aligned[0];
    standards.push({
      standardKey: standard.key,
      code: standard.code,
      subjectKorean: standard.subjectKorean ?? curriculum.subjectKorean,
      domainKorean: standard.domainKorean ?? standard.officialAreaKorean,
      gradeBand: standard.gradeBand,
      representativeTopicId: representative.id,
      representativeFacetKey: representative.facetKey,
      topicIds: aligned.map((topic) => topic.id),
    });
  }
}
standards.sort((a, b) => byId(a.standardKey, b.standardKey));

const inventory = {
  profile: 'bridges',
  recordType: 'elementaryTopicInventory',
  elementaryReleaseVersion: manifest.taxonomyVersion,
  source: 'DECK6/korean-elementary-learning-map data/kr/topics.json',
  sourcePin: {
    taxonomyVersion: manifest.taxonomyVersion,
    file: 'data/kr/topics.json',
    bytes: manifest.files['topics.json'].bytes,
    sha256: manifest.files['topics.json'].sha256,
  },
  facetSelectionRule: '각 초등 성취기준의 facetKey=concept 주제를 대표로 고르고, concept 주제가 없으면 topicId 정렬상 첫 주제를 고른다.',
  topicCount: topics.length,
  standardCount: standards.length,
  topicIds: topics.map((topic) => topic.id).sort(byId),
  standards,
};

const expected = stableJson(inventory);
if (checkOnly) {
  const actual = await readFile(outputPath, 'utf8');
  if (actual !== expected) throw new Error('data/kr/bridges/elementary-topic-inventory.json is stale; run bun scripts/dev/pin-elementary-inventory.mjs');
  console.log(`elementary inventory pin check passed: ${inventory.elementaryReleaseVersion}, ${inventory.topicCount} topics`);
} else {
  const temporary = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporary, expected, 'utf8');
  await rename(temporary, outputPath);
  console.log(`elementary inventory pinned: ${inventory.elementaryReleaseVersion}, ${inventory.topicCount} topics, ${inventory.standardCount} standards`);
}
