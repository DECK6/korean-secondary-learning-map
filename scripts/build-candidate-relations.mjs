import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import bridgeDomainMap from './lib/bridge-domain-map.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const natural = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

// Rules that may enter the pedagogical-candidate layer. Cross-course and cross-subject
// candidates stay out: course-level progression is carried by the official course-relations.
const rules = {
  'R-CODE': { basisKind: 'official-code-order', scope: 'same-domain' },
  'R-FACET': { basisKind: 'decomposition-order', scope: 'same-standard' },
};
const bridgeRuleId = bridgeDomainMap.ruleId;

function hash(value, length = 20) {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function stableJson(value) {
  const sort = (input) => {
    if (Array.isArray(input)) return input.map(sort);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(
      Object.keys(input)
        .sort((a, b) => a.localeCompare(b, 'en'))
        .map((key) => [key, sort(input[key])]),
    );
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(root, relativePath), 'utf8'));
}

async function writeOrCheck(relativePath, value) {
  const path = join(root, relativePath);
  const expected = stableJson(value);
  if (checkOnly) {
    const actual = await readFile(path, 'utf8').catch(() => null);
    if (actual !== expected) throw new Error(`${relativePath} is stale; run bun run build:candidates`);
    return;
  }
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, expected, 'utf8');
  await rename(temporary, path);
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

// Union reachability guard. Candidate edges are appended in id order and an edge is dropped
// when the union graph already reaches the prerequisite from the dependent.
function createGraph(edges) {
  const outgoing = new Map();
  const link = (from, to) => {
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push(to);
  };
  for (const edge of edges) link(edge.prerequisiteTopicId, edge.dependentTopicId);
  const reaches = (from, target) => {
    const stack = [from];
    const seen = new Set(stack);
    while (stack.length) {
      const node = stack.pop();
      if (node === target) return true;
      for (const next of outgoing.get(node) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    return false;
  };
  return { link, reaches };
}

function facetLabel(topic) {
  const parts = topic.labelKorean.split(' — ');
  return parts.length > 2 ? parts.at(-1) : topic.facetKeyDetail ?? topic.facetKey;
}

function buildProfile(profile, { courses, domains, standards, topics, officialRelations }) {
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const domainById = new Map(domains.map((domain) => [domain.id, domain]));
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const topicsByStandard = new Map();
  for (const topic of topics) {
    for (const alignment of topic.standardAlignments) {
      if (!topicsByStandard.has(alignment.standardId)) topicsByStandard.set(alignment.standardId, []);
      topicsByStandard.get(alignment.standardId).push(topic);
    }
  }
  const coreTopic = (standard) => {
    const aligned = topicsByStandard.get(standard.id) ?? [];
    const core = profile === 'middle' ? aligned.filter((topic) => topic.decompositionKind === 'standard-core') : aligned;
    if (core.length !== 1) throw new Error(`${profile} standard ${standard.code} resolved to ${core.length} core topics`);
    return core[0];
  };
  const inScope = (course) => (
    profile === 'middle'
    || ((course.programScopes ?? []).includes('all-high-schools') && !(course.programScopes ?? []).includes('specialized-vocational'))
  );

  const drafts = [];
  const scopedStandards = standards.filter((standard) => inScope(courseById.get(standard.courseId)));

  // R-CODE: adjacent achievement-standard codes inside one course and domain.
  for (const [, grouped] of groupBy(scopedStandards, (standard) => `${standard.courseId}|${standard.domainId}`)) {
    const ordered = [...grouped].sort((a, b) => natural.compare(a.code, b.code) || a.id.localeCompare(b.id, 'en'));
    for (let index = 1; index < ordered.length; index += 1) {
      const prerequisite = ordered[index - 1];
      const dependent = ordered[index];
      const courseLabel = courseById.get(dependent.courseId).labelKorean;
      const domainLabel = domainById.get(dependent.domainId).labelKorean;
      drafts.push({
        rule: 'R-CODE',
        prerequisiteTopicId: coreTopic(prerequisite).id,
        dependentTopicId: coreTopic(dependent).id,
        reason: `${courseLabel} ${domainLabel} 영역의 성취기준 코드 순서에서 ${prerequisite.code} 다음이 ${dependent.code}이므로 이 순서로 다루기를 권장한다.`,
        basis: `R-CODE 코드 순서: ${courseLabel} ${domainLabel} 영역의 공식 성취기준 코드가 ${prerequisite.code} → ${dependent.code}로 인접한다. 공식 문서가 선수 관계로 명시한 것은 아니다.`,
        sourceRefs: [...dependent.sourceRefs].sort(),
      });
    }
  }

  // R-FACET: a standard's core topic before each of its subject-facet topics.
  if (profile === 'middle') {
    for (const standard of scopedStandards) {
      const core = coreTopic(standard);
      const facets = (topicsByStandard.get(standard.id) ?? [])
        .filter((topic) => topic.decompositionKind === 'subject-facet')
        .sort((a, b) => a.id.localeCompare(b.id, 'en'));
      const courseLabel = courseById.get(standard.courseId).labelKorean;
      for (const topic of facets) {
        drafts.push({
          rule: 'R-FACET',
          prerequisiteTopicId: core.id,
          dependentTopicId: topic.id,
          reason: `${courseLabel} ${standard.code}의 핵심 주제를 먼저 다룬 뒤 ‘${facetLabel(topic)}’ 관점의 세부 주제로 나아가기를 권장한다.`,
          basis: `R-FACET 분해 순서: ${standard.code}를 저장소가 핵심 주제와 ‘${facetLabel(topic)}’ 세부 주제로 분해한 순서다. 공식 문서가 선수 관계로 명시한 것은 아니다.`,
          sourceRefs: [...standard.sourceRefs].sort(),
        });
      }
    }
  }

  const officialPairs = new Set(officialRelations.map((relation) => `${relation.prerequisiteTopicId}|${relation.dependentTopicId}`));
  const seen = new Set();
  const candidates = [];
  for (const draft of drafts) {
    const pair = `${draft.prerequisiteTopicId}|${draft.dependentTopicId}`;
    if (draft.prerequisiteTopicId === draft.dependentTopicId) continue;
    if (officialPairs.has(pair) || seen.has(pair)) continue;
    seen.add(pair);
    const { basisKind, scope } = rules[draft.rule];
    candidates.push({
      id: `kr.learning-relation.2022.${profile}.candidate.${hash(`${pair}|recommended-before|${draft.rule}`)}`,
      dependentTopicId: draft.dependentTopicId,
      prerequisiteTopicId: draft.prerequisiteTopicId,
      layer: 'pedagogical-candidate',
      relationKind: 'recommended-before',
      scope,
      strength: 'recommended',
      reason: draft.reason,
      basisKind,
      basis: draft.basis,
      sourceRefs: draft.sourceRefs,
      reviewStatus: 'candidate',
    });
  }
  candidates.sort((a, b) => a.id.localeCompare(b.id, 'en'));

  const graph = createGraph(officialRelations);
  const accepted = [];
  const dropped = [];
  for (const candidate of candidates) {
    if (graph.reaches(candidate.dependentTopicId, candidate.prerequisiteTopicId)) {
      dropped.push(candidate.id);
      continue;
    }
    graph.link(candidate.prerequisiteTopicId, candidate.dependentTopicId);
    accepted.push(candidate);
  }
  for (const candidate of accepted) {
    if (!topicById.has(candidate.prerequisiteTopicId) || !topicById.has(candidate.dependentTopicId)) {
      throw new Error(`${profile} candidate ${candidate.id} references an unknown topic`);
    }
  }
  return { records: accepted, dropped };
}

// R-DOMAIN-CONTINUITY: inside one subject, every elementary 5~6 grade band standard of a content
// system 영역 is recommended before every middle achievement standard of the corresponding 영역.
// The elementary side uses the pinned representative (facetKey=concept) topic, the middle side the
// standard-core topic, so this layer joins exactly the topics the official bridge already joins.
function buildElementaryBridgeCandidates({ courses, domains, standards, topics, inventory, officialBridges, sourceCatalog }) {
  const courseIdByLabel = new Map(courses.map((course) => [course.labelKorean, course.id]));
  const courseLabelById = new Map(courses.map((course) => [course.id, course.labelKorean]));
  const domainIdByLabel = new Map(domains.map((domain) => [`${domain.courseId}|${domain.labelKorean}`, domain.id]));
  const standardsByDomain = groupBy(standards, (standard) => standard.domainId);
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const coreTopicIdByStandard = new Map();
  for (const topic of topics) {
    if (topic.decompositionKind !== 'standard-core') continue;
    for (const alignment of topic.standardAlignments) coreTopicIdByStandard.set(alignment.standardId, topic.id);
  }
  const elementaryByDomain = new Map();
  for (const standard of inventory.standards) {
    if (standard.gradeBand !== '5-6') continue;
    const key = `${standard.subjectKorean}|${standard.domainKorean}`;
    if (!elementaryByDomain.has(key)) elementaryByDomain.set(key, []);
    elementaryByDomain.get(key).push(standard);
  }
  const catalogById = new Map(sourceCatalog.sources.map((source) => [source.id, source]));

  const drafts = [];
  const mappedDomainPairs = [];
  for (const subject of bridgeDomainMap.subjects) {
    const courseId = courseIdByLabel.get(subject.middleCourse);
    if (!courseId) throw new Error(`bridge domain map references unknown middle course ${subject.middleCourse}`);
    const source = catalogById.get(subject.annexId);
    if (!source) throw new Error(`bridge domain map references unknown annex ${subject.annexId}`);
    const citation = `${source.governingNotice} 별책${source.annex}`;
    for (const entry of subject.domains) {
      const elementaryStandards = elementaryByDomain.get(`${subject.elementarySubject}|${entry.elementaryDomain}`) ?? [];
      if (!elementaryStandards.length) {
        throw new Error(`bridge domain map found no elementary 5-6 standard for ${subject.elementarySubject} ${entry.elementaryDomain}`);
      }
      for (const middleDomainLabel of entry.middleDomains) {
        const domainId = domainIdByLabel.get(`${courseId}|${middleDomainLabel}`);
        if (!domainId) throw new Error(`bridge domain map references unknown ${subject.middleCourse} domain ${middleDomainLabel}`);
        const middleStandards = [...(standardsByDomain.get(domainId) ?? [])]
          .sort((a, b) => natural.compare(a.code, b.code) || a.id.localeCompare(b.id, 'en'));
        mappedDomainPairs.push(`${subject.elementarySubject} ${entry.elementaryDomain} → ${subject.middleCourse} ${middleDomainLabel}`);
        for (const elementary of elementaryStandards) {
          for (const middle of middleStandards) {
            drafts.push({
              prerequisiteTopicId: elementary.representativeTopicId,
              dependentTopicId: coreTopicIdByStandard.get(middle.id),
              reason: `초등 ${subject.elementarySubject} ${entry.elementaryDomain} 영역의 ${elementary.code} 다음에 ${subject.middleCourse} ${middleDomainLabel} 영역의 ${middle.code} 순서로 다루기를 권장한다.`,
              basis: `${bridgeRuleId} 영역 연속: ${citation} 내용 체계표가 초등 5~6학년군 ‘${entry.elementaryDomain}’ 영역과 중학교 ‘${middleDomainLabel}’ 영역을 같은 영역 계열로 제시한다 p.${entry.printedPage}. 공식 문서가 이 두 성취기준을 선수 관계로 명시한 것은 아니다.`,
              sourceRefs: [subject.annexId],
            });
          }
        }
      }
    }
  }

  const officialPairs = new Set(officialBridges.map((relation) => `${relation.prerequisiteTopicId}|${relation.dependentTopicId}`));
  const seen = new Set();
  const records = [];
  let officialDuplicates = 0;
  for (const draft of drafts) {
    const pair = `${draft.prerequisiteTopicId}|${draft.dependentTopicId}`;
    if (officialPairs.has(pair)) { officialDuplicates += 1; continue; }
    if (seen.has(pair)) continue;
    seen.add(pair);
    records.push({
      id: `kr.learning-relation.2022.bridge.elementary.candidate.${hash(`${pair}|recommended-before|${bridgeRuleId}`)}`,
      dependentTopicId: draft.dependentTopicId,
      prerequisiteTopicId: draft.prerequisiteTopicId,
      layer: 'pedagogical-candidate',
      relationKind: 'recommended-before',
      scope: 'cross-school-level',
      strength: 'recommended',
      reason: draft.reason,
      basisKind: 'repository-authored',
      basis: draft.basis,
      sourceRefs: draft.sourceRefs,
      reviewStatus: 'candidate',
    });
  }
  records.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const elementaryTopicIds = new Set(inventory.topicIds);
  for (const record of records) {
    if (!elementaryTopicIds.has(record.prerequisiteTopicId)) throw new Error(`${record.id} references an unpinned elementary topic`);
    if (!topicById.has(record.dependentTopicId)) throw new Error(`${record.id} references an unknown middle topic`);
  }
  const graph = createGraph([...officialBridges, ...records]);
  for (const record of records) {
    if (graph.reaches(record.dependentTopicId, record.prerequisiteTopicId)) throw new Error(`${record.id} closes a cycle in the bridge union graph`);
  }
  const coveredStandardIds = new Set();
  for (const record of records) {
    for (const alignment of topicById.get(record.dependentTopicId).standardAlignments) coveredStandardIds.add(alignment.standardId);
  }
  return { records, officialDuplicates, mappedDomainPairs, coveredStandardIds, coveredCourses: new Set(records.map((record) => courseLabelById.get(topicById.get(record.dependentTopicId).courseIds[0]))) };
}

const outputs = [];
const summary = [];
const counts = {};
for (const profile of ['middle', 'high']) {
  const release = await readJson(`data/kr/${profile}/release.json`);
  const built = buildProfile(profile, {
    courses: (await readJson(`data/kr/${profile}/courses.json`)).records,
    domains: (await readJson(`data/kr/${profile}/domains.json`)).records,
    standards: (await readJson(`data/kr/${profile}/standards.json`)).records,
    topics: (await readJson(`data/kr/${profile}/topics.json`)).records,
    officialRelations: (await readJson(`data/kr/${profile}/learning-relations.json`)).records,
  });
  if (!built.records.length) throw new Error(`${profile} candidate layer is empty`);
  outputs.push([`data/kr/${profile}/learning-relations.candidate.json`, {
    $schema: `../../../schema/${profile}-profile.schema.json#/$defs/candidateLearningRelationCollection`,
    profile,
    releaseId: release.releaseId,
    recordType: 'candidateLearningRelations',
    recordCount: built.records.length,
    records: built.records,
  }]);
  outputs.push([`data/kr/${profile}/release.json`, {
    ...release,
    collections: { ...release.collections, candidateLearningRelations: 'learning-relations.candidate.json' },
    counts: { ...release.counts, candidateLearningRelations: built.records.length },
  }]);
  counts[profile] = built.records.length;
  const byRule = { 'R-CODE': 0, 'R-FACET': 0 };
  for (const record of built.records) byRule[record.basisKind === 'official-code-order' ? 'R-CODE' : 'R-FACET'] += 1;
  summary.push(`${profile} ${built.records.length} (R-CODE ${byRule['R-CODE']}, R-FACET ${byRule['R-FACET']}, cycle-dropped ${built.dropped.length})`);
}

const bridgeRelease = await readJson('data/kr/bridges/release.json');
const bridge = buildElementaryBridgeCandidates({
  courses: (await readJson('data/kr/middle/courses.json')).records,
  domains: (await readJson('data/kr/middle/domains.json')).records,
  standards: (await readJson('data/kr/middle/standards.json')).records,
  topics: (await readJson('data/kr/middle/topics.json')).records,
  inventory: await readJson('data/kr/bridges/elementary-topic-inventory.json'),
  officialBridges: (await readJson('data/kr/bridges/elementary-transitions.json')).records,
  sourceCatalog: await readJson('sources/official/source-catalog.json'),
});
if (!bridge.records.length) throw new Error('bridge candidate layer is empty');
outputs.push(['data/kr/bridges/elementary-transitions.candidate.json', {
  $schema: '../../../schema/bridge-profile.schema.json#/$defs/candidateElementaryTransitionCollection',
  profile: 'bridges',
  releaseId: bridgeRelease.releaseId,
  recordType: 'candidateElementaryTransitions',
  elementaryReleaseVersion: (await readJson('data/kr/bridges/elementary-transitions.json')).elementaryReleaseVersion,
  recordCount: bridge.records.length,
  records: bridge.records,
}]);
outputs.push(['data/kr/bridges/release.json', {
  ...bridgeRelease,
  collections: { ...bridgeRelease.collections, candidateElementaryTransitions: 'elementary-transitions.candidate.json' },
  counts: { ...bridgeRelease.counts, candidateElementaryTransitions: bridge.records.length },
}]);
summary.push(`bridges ${bridge.records.length} (${bridgeRuleId} ${bridge.mappedDomainPairs.length} domain pairs, official-duplicate ${bridge.officialDuplicates})`);

const inventoryReport = await readJson('data/kr/inventory-report.json');
outputs.push(['data/kr/inventory-report.json', {
  ...inventoryReport,
  middle: { ...inventoryReport.middle, candidateLearningRelations: counts.middle },
  high: { ...inventoryReport.high, candidateLearningRelations: counts.high },
  bridges: { ...inventoryReport.bridges, candidateElementaryTransitions: bridge.records.length },
}]);

// P2-3 coverage indicator: middle achievement standards reachable from an elementary bridge in
// either layer. build:relations already wrote the official-only figure into the same block.
const coverageReport = await readJson('data/kr/relation-coverage-report.json');
const officialBridges = (await readJson('data/kr/bridges/elementary-transitions.json')).records;
const middleTopicById = new Map((await readJson('data/kr/middle/topics.json')).records.map((topic) => [topic.id, topic]));
const anyBridgeStandardIds = new Set(bridge.coveredStandardIds);
for (const relation of officialBridges) {
  for (const alignment of middleTopicById.get(relation.dependentTopicId).standardAlignments) anyBridgeStandardIds.add(alignment.standardId);
}
outputs.push(['data/kr/relation-coverage-report.json', {
  ...coverageReport,
  bridges: {
    ...coverageReport.bridges,
    candidateElementaryTransitions: bridge.records.length,
    mappedElementaryDomainPairs: bridge.mappedDomainPairs.length,
    middleCoursesWithCandidateBridge: bridge.coveredCourses.size,
    middleStandardsWithAnyBridge: anyBridgeStandardIds.size,
    anyBridgeStandardCoverage: Number((anyBridgeStandardIds.size / coverageReport.bridges.middleStandards).toFixed(4)),
  },
}]);

for (const [path, value] of outputs) await writeOrCheck(path, value);
console.log(`candidate relation ${checkOnly ? 'check' : 'build'} passed: ${summary.join('; ')}`);
