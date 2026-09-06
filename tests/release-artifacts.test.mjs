import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { officialRelationSpecs } from '../scripts/lib/official-relation-specs/index.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const sha256 = (contents) => createHash('sha256').update(contents).digest('hex');
const highRequiredIn = (specs) => specs.reduce(
  (total, spec) => total + (spec.highRequired ?? []).length + (spec.highCommentaryRequired ?? []).length,
  0,
);
const registeredHighRequired = highRequiredIn(officialRelationSpecs.filter((spec) => !spec.subject.startsWith('voc-')));
const registeredVocationalRequired = highRequiredIn(officialRelationSpecs.filter((spec) => spec.subject.startsWith('voc-')));

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
  expect(transitions.records.every((item) => item.reviewStatus === 'internal-reviewed')).toBe(true);
  expect(transitions.records.every((item) => item.basisKind === 'official-source')).toBe(true);
  expect(transitions.records.every((item) => item.fromTopicIds.length && item.toTopicIds.length)).toBe(true);
});

test('publishes official-only acyclic relation coverage', async () => {
  const report = await readJson('../data/kr/relation-coverage-report.json');
  expect(report.middle.relations.byBasisKind).toEqual({ 'official-source': 56 });
  expect(report.high.relations.byBasisKind).toEqual({ 'official-source': registeredHighRequired });
  expect(report.high.relations.byRelationKind).toEqual({ 'required-prerequisite': registeredHighRequired });
  expect(report.highVocational.relations.byBasisKind).toEqual({ 'official-source': registeredVocationalRequired });
  expect(report.highVocational.relations.byRelationKind).toEqual({ 'required-prerequisite': registeredVocationalRequired });
  expect(report.high.courseRelations.byBasisKind).toEqual({ 'official-source': 39 });
  expect(report.middle.courseCoverage.coursesWithOfficialRelations).toBe(15);
  expect(report.high.courseCoverage.coursesWithOfficialRelations).toBeGreaterThan(0);
  expect(report.middle.courseCoverage.byCourse.find((course) => course.courseLabel === '수학')).toMatchObject({
    hasOfficialRelations: true,
    relationCount: 30,
  });
  expect(report.validation).toEqual({
    danglingReferences: 0,
    duplicateIds: 0,
    highCourseDag: true,
    highDag: true,
    highVocationalDag: true,
    middleDag: true,
  });
});

test('publishes registered high-school v2 relations as reviewed official requirements', async () => {
  for (const [path, expected] of [
    ['../data/kr/high/learning-relations.json', registeredHighRequired],
    ['../data/kr/high-vocational/learning-relations.json', registeredVocationalRequired],
  ]) {
    const relations = await readJson(path);
    const required = relations.records.filter((relation) => relation.relationKind === 'required-prerequisite');
    expect(required).toHaveLength(expected);
    expect(required.every((relation) => (
      relation.basisKind === 'official-source'
      && relation.strength === 'required'
      && relation.reviewStatus === 'internal-reviewed'
      && ['same-course', 'cross-course'].includes(relation.scope)
      && /(?:내용 체계\/과목 설계|성취기준 해설) p\.\d+$/.test(relation.basis)
    ))).toBe(true);
  }
});

test('keeps every high-school id stable across the vocational split', async () => {
  const readProfile = async (profile, collection) => {
    const release = await readJson(`../data/kr/${profile}/release.json`);
    const entry = release.collections[collection];
    const files = Array.isArray(entry) ? entry : [entry];
    const records = [];
    for (const file of files) records.push(...(await readJson(`../data/kr/${profile}/${file}`)).records);
    return records;
  };
  for (const [collection, total] of [['standards', 50749], ['topics', 50749], ['courses', 759], ['domains', 5169], ['clusters', 5169]]) {
    const ids = [
      ...(await readProfile('high', collection)).map((record) => record.id),
      ...(await readProfile('high-vocational', collection)).map((record) => record.id),
    ];
    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
    expect(ids.every((id) => id.startsWith('kr.') && id.includes('.2022.high.'))).toBe(true);
  }
});
