import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { createAjv } from '../scripts/validate.mjs';
import bridgeDomainMap from '../scripts/lib/bridge-domain-map.mjs';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const officialFiles = ['../data/kr/middle/learning-relations.json', '../data/kr/high/learning-relations.json', '../data/kr/high-vocational/learning-relations.json'];
const candidateFiles = ['../data/kr/middle/learning-relations.candidate.json', '../data/kr/high/learning-relations.candidate.json'];
const facetKeys = new Set(['concept', 'procedure', 'representation', 'application', 'inquiry', 'communication', 'reflection', 'core']);
const candidateBasisKinds = new Set(['official-code-order', 'decomposition-order']);

function cyclicNodeCount(edges) {
  const outgoing = new Map();
  const indegree = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.prerequisiteTopicId)) outgoing.set(edge.prerequisiteTopicId, []);
    outgoing.get(edge.prerequisiteTopicId).push(edge.dependentTopicId);
    indegree.set(edge.prerequisiteTopicId, indegree.get(edge.prerequisiteTopicId) ?? 0);
    indegree.set(edge.dependentTopicId, (indegree.get(edge.dependentTopicId) ?? 0) + 1);
  }
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  for (let index = 0; index < queue.length; index += 1) {
    visited += 1;
    for (const next of outgoing.get(queue[index]) ?? []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  return indegree.size - visited;
}

describe('relation layers', () => {
  test('official files carry only reviewed official prerequisites', async () => {
    for (const path of [...officialFiles, '../data/kr/bridges/elementary-transitions.json']) {
      const records = (await readJson(path)).records;
      expect(records.length).toBeGreaterThan(0);
      expect(records.every((record) => record.layer === 'official')).toBe(true);
      expect(records.every((record) => record.basisKind === 'official-source')).toBe(true);
      expect(records.every((record) => record.relationKind === 'required-prerequisite')).toBe(true);
      expect(records.every((record) => record.strength === 'required')).toBe(true);
      expect(records.every((record) => / p\.\d+/.test(record.basis))).toBe(true);
    }
  });

  test('candidate files carry only recommended, rule-derived orderings', async () => {
    for (const path of candidateFiles) {
      const records = (await readJson(path)).records;
      expect(records.length).toBeGreaterThan(0);
      expect(records.every((record) => record.layer === 'pedagogical-candidate')).toBe(true);
      expect(records.every((record) => record.relationKind === 'recommended-before')).toBe(true);
      expect(records.every((record) => record.strength === 'recommended')).toBe(true);
      expect(records.every((record) => record.reviewStatus === 'candidate')).toBe(true);
      expect(records.every((record) => candidateBasisKinds.has(record.basisKind))).toBe(true);
      expect(records.every((record) => /^R-(CODE|FACET) /.test(record.basis))).toBe(true);
      expect(records.every((record) => record.sourceRefs.length > 0)).toBe(true);
      expect(records.every((record) => record.id.includes('.candidate.'))).toBe(true);
    }
  });

  test('each layer and their union stay acyclic without duplicated pairs', async () => {
    for (const [officialPath, candidatePath] of [[officialFiles[0], candidateFiles[0]], [officialFiles[1], candidateFiles[1]]]) {
      const official = (await readJson(officialPath)).records;
      const candidate = (await readJson(candidatePath)).records;
      expect(cyclicNodeCount(official)).toBe(0);
      expect(cyclicNodeCount(candidate)).toBe(0);
      expect(cyclicNodeCount([...official, ...candidate])).toBe(0);
      const officialPairs = new Set(official.map((record) => `${record.prerequisiteTopicId}|${record.dependentTopicId}`));
      expect(candidate.some((record) => officialPairs.has(`${record.prerequisiteTopicId}|${record.dependentTopicId}`))).toBe(false);
    }
  });

  test('the candidate layer covers every middle course and no vocational high course', async () => {
    const middleCourses = (await readJson('../data/kr/middle/courses.json')).records;
    const middleTopics = new Map((await readJson('../data/kr/middle/topics.json')).records.map((topic) => [topic.id, topic]));
    const middleCandidates = (await readJson(candidateFiles[0])).records;
    const covered = new Set(middleCandidates.flatMap((record) => middleTopics.get(record.dependentTopicId).courseIds));
    expect(middleCourses.filter((course) => !covered.has(course.id))).toEqual([]);

    const highCourses = new Map((await readJson('../data/kr/high/courses.json')).records.map((course) => [course.id, course]));
    const highTopics = new Map((await readJson('../data/kr/high/topics.json')).records.map((topic) => [topic.id, topic]));
    const highCandidates = (await readJson(candidateFiles[1])).records;
    const scopes = new Set(highCandidates.flatMap((record) => highTopics.get(record.dependentTopicId).courseIds)
      .flatMap((courseId) => highCourses.get(courseId).programScopes));
    expect(scopes.has('specialized-vocational')).toBe(false);
    expect(scopes.has('all-high-schools')).toBe(true);
    // The vocational release publishes the official layer only; no candidate file exists for it.
    expect(existsSync(new URL('../data/kr/high-vocational/learning-relations.candidate.json', import.meta.url))).toBe(false);
    const vocationalRelease = await readJson('../data/kr/high-vocational/release.json');
    expect(vocationalRelease.collections.candidateLearningRelations).toBeUndefined();
  });

  test('topics carry the shared eight-key facet vocabulary', async () => {
    const vocabularies = await readJson('../data/kr/shared/controlled-vocabularies.json');
    expect(new Set(vocabularies.facetKeys.map((term) => term.id))).toEqual(facetKeys);
    const mapped = new Map(vocabularies.facetKeyMappings.map((entry) => [entry.id, entry.facetKey]));
    for (const [profile, requiresDetail] of [['middle', true], ['high', false]]) {
      const topics = (await readJson(`../data/kr/${profile}/topics.json`)).records;
      expect(topics.every((topic) => facetKeys.has(topic.facetKey))).toBe(true);
      if (!requiresDetail) {
        expect(topics.every((topic) => topic.facetKey === 'core')).toBe(true);
        continue;
      }
      expect(topics.every((topic) => mapped.get(topic.facetKeyDetail) === topic.facetKey)).toBe(true);
      expect(topics.filter((topic) => topic.decompositionKind === 'standard-core')
        .every((topic) => topic.facetKey === 'core' && topic.facetKeyDetail === 'core')).toBe(true);
    }
  });

  test('every official bridge starts from the pinned concept facet of an elementary standard', async () => {
    const inventory = await readJson('../data/kr/bridges/elementary-topic-inventory.json');
    const collection = await readJson('../data/kr/bridges/elementary-transitions.json');
    expect(collection.elementaryReleaseVersion).toBe(inventory.elementaryReleaseVersion);
    expect(inventory.elementaryReleaseVersion).toBe('kr-full-depth-v0.5');
    expect(inventory.topicIds.length).toBe(inventory.topicCount);
    const byRepresentative = new Map(inventory.standards.map((standard) => [standard.representativeTopicId, standard]));
    const chosen = collection.records.map((record) => byRepresentative.get(record.prerequisiteTopicId));
    expect(chosen.every(Boolean)).toBe(true);
    // 영어 인벤토리에는 concept facet 주제가 없어 정렬상 첫 주제(communication)를 쓴다.
    // docs/reviews/2026-09-05-bridge-facet-normalization.md에 기록된 유일한 예외다.
    const exceptions = chosen.filter((standard) => standard.representativeFacetKey !== 'concept');
    expect([...new Set(exceptions.map((standard) => standard.subjectKorean))]).toEqual(['영어']);
    expect([...new Set(exceptions.map((standard) => standard.representativeFacetKey))]).toEqual(['communication']);
  });

  test('the candidate bridge layer is rule-derived, recommended and free of official pairs', async () => {
    const official = (await readJson('../data/kr/bridges/elementary-transitions.json')).records;
    const collection = await readJson('../data/kr/bridges/elementary-transitions.candidate.json');
    const records = collection.records;
    expect(records.length).toBeGreaterThan(0);
    expect(collection.recordType).toBe('candidateElementaryTransitions');
    expect(records.every((record) => record.layer === 'pedagogical-candidate')).toBe(true);
    expect(records.every((record) => record.relationKind === 'recommended-before')).toBe(true);
    expect(records.every((record) => record.strength === 'recommended')).toBe(true);
    expect(records.every((record) => record.scope === 'cross-school-level')).toBe(true);
    expect(records.every((record) => record.reviewStatus === 'candidate')).toBe(true);
    expect(records.every((record) => record.basisKind !== 'official-source')).toBe(true);
    expect(records.every((record) => record.basis.startsWith(`${bridgeDomainMap.ruleId} `))).toBe(true);
    expect(records.every((record) => record.sourceRefs.length > 0)).toBe(true);
    expect(records.every((record) => record.id.includes('.candidate.'))).toBe(true);
    const officialPairs = new Set(official.map((record) => `${record.prerequisiteTopicId}|${record.dependentTopicId}`));
    expect(records.some((record) => officialPairs.has(`${record.prerequisiteTopicId}|${record.dependentTopicId}`))).toBe(false);
    expect(cyclicNodeCount(records)).toBe(0);
    expect(cyclicNodeCount([...official, ...records])).toBe(0);
  });

  test('the bridge domain map only names domains that exist on both sides', async () => {
    const inventory = await readJson('../data/kr/bridges/elementary-topic-inventory.json');
    const courses = new Map((await readJson('../data/kr/middle/courses.json')).records.map((course) => [course.labelKorean, course.id]));
    const domains = new Set((await readJson('../data/kr/middle/domains.json')).records.map((domain) => `${domain.courseId}|${domain.labelKorean}`));
    const elementaryDomains = new Set(inventory.standards.filter((standard) => standard.gradeBand === '5-6').map((standard) => `${standard.subjectKorean}|${standard.domainKorean}`));
    const mappedCourses = new Set();
    for (const subject of bridgeDomainMap.subjects) {
      expect(courses.has(subject.middleCourse)).toBe(true);
      mappedCourses.add(subject.middleCourse);
      for (const entry of subject.domains) {
        expect(elementaryDomains.has(`${subject.elementarySubject}|${entry.elementaryDomain}`)).toBe(true);
        expect(Number.isInteger(entry.printedPage)).toBe(true);
        for (const middleDomain of entry.middleDomains) {
          expect(domains.has(`${courses.get(subject.middleCourse)}|${middleDomain}`)).toBe(true);
        }
      }
    }
    const unmappedCourses = bridgeDomainMap.unmapped.flatMap((entry) => entry.middleCourses);
    expect(unmappedCourses.filter((course) => mappedCourses.has(course))).toEqual([]);
    expect(bridgeDomainMap.unmapped.every((entry) => entry.reason.length > 0)).toBe(true);
  });

  test('elementary bridges cover at least 60% of middle achievement standards across both layers', async () => {
    const report = await readJson('../data/kr/relation-coverage-report.json');
    const standards = (await readJson('../data/kr/middle/standards.json')).records;
    expect(report.bridges.middleStandards).toBe(standards.length);
    expect(report.bridges.middleStandardsWithOfficialBridge).toBeGreaterThan(0);
    expect(report.bridges.middleStandardsWithAnyBridge).toBeGreaterThanOrEqual(report.bridges.middleStandardsWithOfficialBridge);
    expect(report.bridges.anyBridgeStandardCoverage).toBeGreaterThanOrEqual(0.6);
  });

  test('the official relation schema rejects a candidate-layer record', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema('https://dexa.art/learnmap/schema/secondary/middle-profile.schema.json#/$defs/learningRelation');
    expect(validate({
      id: 'kr.learning-relation.example',
      dependentTopicId: 'kr.topic.b',
      prerequisiteTopicId: 'kr.topic.a',
      layer: 'pedagogical-candidate',
      relationKind: 'recommended-before',
      scope: 'same-course',
      strength: 'recommended',
      reason: '예시',
      basisKind: 'official-code-order',
      basis: 'R-CODE 코드 순서',
      sourceRefs: ['kr-moe-2022-33-annex8'],
      reviewStatus: 'candidate',
    })).toBe(false);
  });

  test('the candidate bridge schema rejects an official-source claim', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema('https://dexa.art/learnmap/schema/secondary/bridge-profile.schema.json#/$defs/candidateElementaryTransition');
    const record = {
      id: 'kr.learning-relation.example.bridge.candidate',
      dependentTopicId: 'kr.topic.2022.middle.example',
      prerequisiteTopicId: 'kr.mt.math.5-6.6su0101.concept',
      layer: 'pedagogical-candidate',
      relationKind: 'recommended-before',
      scope: 'cross-school-level',
      strength: 'recommended',
      reason: '예시',
      basisKind: 'repository-authored',
      basis: 'R-DOMAIN-CONTINUITY 영역 연속',
      sourceRefs: ['kr-moe-2022-33-annex8'],
      reviewStatus: 'candidate',
    };
    expect(validate(record)).toBe(true);
    expect(validate({ ...record, basisKind: 'official-source' })).toBe(false);
    expect(validate({ ...record, layer: 'official' })).toBe(false);
    expect(validate({ ...record, relationKind: 'required-prerequisite' })).toBe(false);
    expect(validate({ ...record, strength: 'required' })).toBe(false);
    expect(validate({ ...record, reviewStatus: 'internal-reviewed' })).toBe(false);
  });

  test('the candidate relation schema rejects an official-source claim', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema('https://dexa.art/learnmap/schema/secondary/middle-profile.schema.json#/$defs/candidateLearningRelation');
    const record = {
      id: 'kr.learning-relation.example.candidate',
      dependentTopicId: 'kr.topic.b',
      prerequisiteTopicId: 'kr.topic.a',
      layer: 'pedagogical-candidate',
      relationKind: 'recommended-before',
      scope: 'same-domain',
      strength: 'recommended',
      reason: '예시',
      basisKind: 'official-code-order',
      basis: 'R-CODE 코드 순서',
      sourceRefs: ['kr-moe-2022-33-annex8'],
      reviewStatus: 'candidate',
    };
    expect(validate(record)).toBe(true);
    expect(validate({ ...record, basisKind: 'official-source' })).toBe(false);
    expect(validate({ ...record, layer: 'official' })).toBe(false);
    expect(validate({ ...record, relationKind: 'required-prerequisite' })).toBe(false);
    expect(validate({ ...record, reviewStatus: 'internal-reviewed' })).toBe(false);
  });
});
