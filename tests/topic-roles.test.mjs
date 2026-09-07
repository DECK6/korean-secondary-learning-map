import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTO_CANDIDATE_JACCARD,
  COLLAPSE_REASONS,
  TOPIC_ROLES,
  facetCollapseRuleByCode,
  facetCollapseRules,
  jaccard,
  overlayTokens,
} from '../scripts/lib/facet-collapse-rules.mjs';
import { readProfileCollection } from '../scripts/lib/profile-collections.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const readRecords = async (file) => JSON.parse(await readFile(join(root, file), 'utf8')).records;
const FACET_KEYS = new Set(['concept', 'procedure', 'representation', 'application', 'inquiry', 'communication', 'reflection', 'core']);

const middleTopics = await readRecords('data/kr/middle/topics.json');
const middleStandards = await readRecords('data/kr/middle/standards.json');
const highTopics = await readRecords('data/kr/high/topics.json');
const vocationalTopics = await readProfileCollection(root, 'high-vocational', 'topics');

const standardById = new Map(middleStandards.map((standard) => [standard.id, standard]));
const topicById = new Map(middleTopics.map((topic) => [topic.id, topic]));
const standardIdOf = (topic) => topic.standardAlignments[0].standardId;

describe('facet collapse rules (계약 8절)', () => {
  test('every rule names a real middle standard with a controlled reason', () => {
    const codes = new Set(middleStandards.map((standard) => standard.code));
    for (const rule of facetCollapseRules) {
      expect(codes.has(rule.code)).toBe(true);
      expect(COLLAPSE_REASONS).toContain(rule.reason);
      expect(rule.auxiliaryFacetKeys.length).toBeGreaterThan(0);
      expect(new Set(rule.auxiliaryFacetKeys).size).toBe(rule.auxiliaryFacetKeys.length);
      for (const key of rule.auxiliaryFacetKeys) expect(FACET_KEYS.has(key)).toBe(true);
      expect(rule.note.trim().length).toBeGreaterThan(0);
    }
    expect(facetCollapseRuleByCode.size).toBe(facetCollapseRules.length);
  });

  test('the rule table drives exactly the auxiliary topics in the build output', () => {
    const auxiliary = middleTopics.filter((topic) => topic.topicRole === 'auxiliary');
    const expectedCount = facetCollapseRules.reduce((sum, rule) => sum + rule.auxiliaryFacetKeys.length, 0);
    expect(auxiliary.length).toBe(expectedCount);
    for (const topic of auxiliary) {
      const rule = facetCollapseRuleByCode.get(standardById.get(standardIdOf(topic)).code);
      expect(rule).toBeDefined();
      expect(rule.auxiliaryFacetKeys).toContain(topic.facetKey);
      expect(topic.collapseReason).toBe(rule.reason);
    }
  });
});

describe('topic roles (계약 8절)', () => {
  test('every standard has exactly one anchor topic', () => {
    const anchors = new Map();
    for (const topic of middleTopics) {
      expect(TOPIC_ROLES).toContain(topic.topicRole);
      const standardId = standardIdOf(topic);
      anchors.set(standardId, (anchors.get(standardId) ?? 0) + (topic.topicRole === 'anchor' ? 1 : 0));
    }
    expect(anchors.size).toBe(middleStandards.length);
    expect([...anchors.values()].every((count) => count === 1)).toBe(true);
  });

  test('the middle anchor is the standard-core topic and high school is 1:1', () => {
    for (const topic of middleTopics) {
      expect(topic.topicRole === 'anchor').toBe(topic.decompositionKind === 'standard-core');
    }
    for (const topic of [...highTopics, ...vocationalTopics]) expect(topic.topicRole).toBe('anchor');
  });

  test('collapseInto names a non-auxiliary sibling of the same standard', () => {
    for (const topic of middleTopics) {
      if (topic.topicRole !== 'auxiliary') {
        expect(topic.collapseInto).toBeUndefined();
        expect(topic.collapseReason).toBeUndefined();
        continue;
      }
      const target = topicById.get(topic.collapseInto);
      expect(target).toBeDefined();
      expect(target.topicRole).not.toBe('auxiliary');
      expect(standardIdOf(target)).toBe(standardIdOf(topic));
    }
  });

  test('official relations and bridges never end on an auxiliary topic', async () => {
    const auxiliaryIds = new Set(middleTopics.filter((topic) => topic.topicRole === 'auxiliary').map((topic) => topic.id));
    const endpoints = [
      ...(await readRecords('data/kr/middle/learning-relations.json')).flatMap((relation) => [relation.prerequisiteTopicId, relation.dependentTopicId]),
      ...(await readRecords('data/kr/bridges/elementary-transitions.json')).map((relation) => relation.dependentTopicId),
      ...(await readRecords('data/kr/bridges/transition-alignments.json')).flatMap((record) => record.fromTopicIds),
    ];
    expect(endpoints.filter((id) => auxiliaryIds.has(id))).toEqual([]);
  });
});

describe('topic identity and alignment kind (계약 9절)', () => {
  test('topic ids hash the standard and facet detail only, so alignmentKind cannot move them', () => {
    const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 20);
    for (const topic of middleTopics) {
      const standardId = standardIdOf(topic);
      const expected = topic.decompositionKind === 'standard-core'
        ? hash(standardId)
        : hash(`${standardId}|${topic.facetKeyDetail}`);
      expect(topic.id).toBe(`kr.topic.2022.middle.${expected}`);
    }
  });

  test('standard-core topics assess their standard and facets keep their own kind', () => {
    for (const topic of middleTopics) {
      const kinds = topic.standardAlignments.map((alignment) => alignment.alignmentKind);
      if (topic.decompositionKind === 'standard-core') expect(kinds).toEqual(['assesses']);
      else for (const kind of kinds) expect(['introduces', 'supports', 'extends']).toContain(kind);
    }
  });
});

describe('automatic collapse candidates (계약 8절)', () => {
  test('identical overlay text scores above the reporting threshold and distinct text does not', () => {
    const same = overlayTokens(['자료를 표로 정리해 규칙을 찾는다.', '규칙을 근거와 함께 설명한다.']);
    expect(jaccard(same, new Set(same))).toBe(1);
    expect(jaccard(same, overlayTokens(['악보를 보고 리코더로 연주한다.']))).toBeLessThan(AUTO_CANDIDATE_JACCARD);
  });

  test('no authored sibling pair reaches the threshold without a rule', () => {
    const authoredByStandard = new Map();
    for (const topic of middleTopics) {
      if (topic.contentKind !== 'source-grounded-draft') continue;
      const standardId = standardIdOf(topic);
      if (!authoredByStandard.has(standardId)) authoredByStandard.set(standardId, []);
      authoredByStandard.get(standardId).push(topic);
    }
    const unlisted = [];
    for (const [standardId, siblings] of authoredByStandard) {
      const tokens = siblings.map((topic) => overlayTokens([...topic.evidence, ...topic.assessmentPrompts]));
      for (let left = 0; left < siblings.length; left += 1) {
        for (let right = left + 1; right < siblings.length; right += 1) {
          if (jaccard(tokens[left], tokens[right]) < AUTO_CANDIDATE_JACCARD) continue;
          if (!facetCollapseRuleByCode.has(standardById.get(standardId).code)) unlisted.push(standardById.get(standardId).code);
        }
      }
    }
    expect(unlisted).toEqual([]);
  });
});
