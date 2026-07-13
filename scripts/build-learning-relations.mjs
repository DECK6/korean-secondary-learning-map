import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  mathElementaryCommentaryRequired,
  mathElementaryToMiddleRequired,
  mathMiddleRequired,
  mathMiddleToHighRequired,
  middleToHighCourseTargets,
  officialHighCourseProgressions,
} from './lib/reviewed-learning-relation-specs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const version = '0.4.0-candidate';
const elementaryReleaseVersion = 'kr-full-depth-v0.4';
const releaseIds = {
  middle: 'kr-2022-middle-v0.4.0-candidate',
  high: 'kr-2022-high-v0.4.0-candidate',
  bridges: 'kr-2022-middle-high-bridge-v0.4.0-candidate',
};
const natural = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

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
    const actual = await readFile(path, 'utf8');
    if (actual !== expected) throw new Error(`${relativePath} is stale; run bun run build:relations`);
    return;
  }
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, expected, 'utf8');
  await rename(temporary, path);
}

function collection(profile, recordType, records) {
  const schemaFile = profile === 'middle' ? 'middle-profile' : profile === 'high' ? 'high-profile' : 'bridge-profile';
  const definition = {
    learningRelations: 'learningRelationCollection',
    courseRelations: 'courseRelationCollection',
    transitionAlignments: 'transitionAlignmentCollection',
    elementaryTransitions: 'elementaryTransitionCollection',
    reviewRecords: 'reviewRecordCollection',
    coverageGaps: 'coverageGapCollection',
  }[recordType];
  return {
    $schema: `../../../schema/${schemaFile}.schema.json#/$defs/${definition}`,
    profile,
    releaseId: releaseIds[profile],
    recordType,
    ...(recordType === 'elementaryTransitions' ? { elementaryReleaseVersion } : {}),
    recordCount: records.length,
    records,
  };
}

function records(envelope) {
  return envelope.records;
}

function normalizeCode(value) {
  return value.normalize('NFKC').replaceAll('[', '').replaceAll(']', '').replace(/\s+/g, '').trim();
}

function sourceUnion(...items) {
  return [...new Set(items.flatMap((item) => item?.sourceRefs ?? item ?? []))].sort((a, b) => a.localeCompare(b, 'en'));
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

function standardOrder(a, b) {
  return (a.sourceLocator.pdfPage ?? 0) - (b.sourceLocator.pdfPage ?? 0)
    || natural.compare(a.code, b.code)
    || a.id.localeCompare(b.id, 'en');
}

function oneByLabel(courses, label, profile) {
  const matches = courses.filter((course) => course.labelKorean === label);
  if (matches.length !== 1) throw new Error(`${profile} course label ${JSON.stringify(label)} resolved to ${matches.length} records`);
  return matches[0];
}

function topicIndex(topics, standards, profile) {
  const standardIds = new Set(standards.map((standard) => standard.id));
  const byStandard = new Map();
  for (const topic of topics) {
    for (const alignment of topic.standardAlignments) {
      if (!standardIds.has(alignment.standardId)) continue;
      if (!byStandard.has(alignment.standardId)) byStandard.set(alignment.standardId, []);
      byStandard.get(alignment.standardId).push(topic);
    }
  }
  const coreByStandard = new Map();
  for (const standard of standards) {
    const aligned = byStandard.get(standard.id) ?? [];
    const core = profile === 'middle'
      ? aligned.filter((topic) => topic.decompositionKind === 'standard-core')
      : aligned;
    if (core.length !== 1) throw new Error(`${profile} standard ${standard.code} resolved to ${core.length} core topics`);
    coreByStandard.set(standard.id, core[0]);
  }
  return { byStandard, coreByStandard };
}

function relationPriority(relation) {
  if (relation.relationKind === 'required-prerequisite') return 30;
  if (relation.basisKind === 'official-source') return 20;
  return 10;
}

function addLearningRelation(map, draft) {
  if (draft.prerequisiteTopicId === draft.dependentTopicId) throw new Error(`self relation: ${draft.prerequisiteTopicId}`);
  const key = `${draft.prerequisiteTopicId}|${draft.dependentTopicId}`;
  const existing = map.get(key);
  if (!existing || relationPriority(draft) > relationPriority(existing)) map.set(key, draft);
}

function finalizeLearningRelations(profile, drafts) {
  return [...drafts.values()]
    .map((draft) => ({
      id: `kr.learning-relation.2022.${profile}.${hash(`${draft.prerequisiteTopicId}|${draft.dependentTopicId}|${draft.relationKind}|${draft.basis}`)}`,
      ...draft,
    }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

function makeReviewRecord(profile, targetIds, note) {
  return {
    id: `kr.review.2026.secondary-learning-relations.${profile}`,
    targetIds: [...new Set(targetIds)].sort((a, b) => a.localeCompare(b, 'en')),
    reviewStatus: 'internal-reviewed',
    reviewKind: 'internal',
    note,
    reviewerRole: 'repository-owner-approved-agent-review',
    reviewDate: '2026-07-13',
  };
}

function assertUniqueIds(label, values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value.id)) throw new Error(`${label} duplicate id: ${value.id}`);
    seen.add(value.id);
  }
}

function assertDag(label, nodeIds, edges, fromKey, toKey) {
  const nodeSet = new Set(nodeIds);
  const outgoing = new Map();
  const indegree = new Map([...nodeSet].map((id) => [id, 0]));
  for (const edge of edges) {
    const from = edge[fromKey];
    const to = edge[toKey];
    if (!nodeSet.has(from) || !nodeSet.has(to)) throw new Error(`${label} has a dangling edge ${from} -> ${to}`);
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push(to);
    indegree.set(to, indegree.get(to) + 1);
  }
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    visited += 1;
    for (const target of outgoing.get(id) ?? []) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  if (visited !== nodeSet.size) throw new Error(`${label} contains a cycle (${nodeSet.size - visited} cyclic nodes)`);
}

function elementaryTopicId(code) {
  const match = normalizeCode(code).match(/^([246])수(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`unsupported elementary math code: ${code}`);
  const [, grade, area, sequence] = match;
  const gradeBand = { 2: '1-2', 4: '3-4', 6: '5-6' }[grade];
  const domain = {
    '01': 'number-operations',
    '02': 'change-relationships',
    '03': 'geometry-measurement',
    '04': 'data-probability',
  }[area];
  if (!domain) throw new Error(`unsupported elementary math area: ${code}`);
  return `kr.mt.math.${domain}.g${gradeBand}.s${grade}-${area}-${sequence}.application`;
}

function relationStats(values) {
  const countBy = (key) => Object.fromEntries(
    [...groupBy(values, (value) => value[key])]
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([name, grouped]) => [name, grouped.length]),
  );
  return {
    total: values.length,
    byRelationKind: countBy('relationKind'),
    byBasisKind: countBy('basisKind'),
    byReviewStatus: countBy('reviewStatus'),
  };
}

function topicCoverage(topics, courses, relations) {
  const participating = new Set(relations.flatMap((relation) => [relation.prerequisiteTopicId, relation.dependentTopicId]));
  const dependent = new Set(relations.map((relation) => relation.dependentTopicId));
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const coveredCourseIds = new Set();
  for (const topicId of participating) {
    for (const courseId of topicById.get(topicId)?.courseIds ?? []) coveredCourseIds.add(courseId);
  }
  return {
    graphNodes: topics.length,
    participatingTopics: participating.size,
    rootTopics: topics.length - dependent.size,
    coveredCourses: coveredCourseIds.size,
    totalCourses: courses.length,
    uncoveredCourseLabels: courses.filter((course) => !coveredCourseIds.has(course.id)).map((course) => course.labelKorean).sort(natural.compare),
  };
}

const [
  middleCoursesEnvelope,
  middleStandardsEnvelope,
  middleTopicsEnvelope,
  middleRelease,
  middleGapsEnvelope,
  highCoursesEnvelope,
  highStandardsEnvelope,
  highTopicsEnvelope,
  highRelease,
  highGapsEnvelope,
  bridgeRelease,
  bridgeGapsEnvelope,
  elementaryInventory,
  inventoryReport,
  sourceManifest,
] = await Promise.all([
  readJson('data/kr/middle/courses.json'),
  readJson('data/kr/middle/standards.json'),
  readJson('data/kr/middle/topics.json'),
  readJson('data/kr/middle/release.json'),
  readJson('data/kr/middle/coverage-gaps.json'),
  readJson('data/kr/high/courses.json'),
  readJson('data/kr/high/standards.json'),
  readJson('data/kr/high/topics.json'),
  readJson('data/kr/high/release.json'),
  readJson('data/kr/high/coverage-gaps.json'),
  readJson('data/kr/bridges/release.json'),
  readJson('data/kr/bridges/coverage-gaps.json'),
  readJson('data/kr/bridges/elementary-topic-inventory.json'),
  readJson('data/kr/inventory-report.json'),
  readJson('data/kr/shared/source-manifest.json'),
]);

const middleCourses = records(middleCoursesEnvelope);
const middleStandards = records(middleStandardsEnvelope);
const middleTopics = records(middleTopicsEnvelope);
const highCourses = records(highCoursesEnvelope);
const highStandards = records(highStandardsEnvelope);
const highTopics = records(highTopicsEnvelope);
const officialSourceIds = new Set(sourceManifest.sources.map((source) => source.id));
const elementaryTopicIds = new Set(elementaryInventory.topicIds);
if (elementaryInventory.elementaryReleaseVersion !== elementaryReleaseVersion) {
  throw new Error(`elementary inventory is ${elementaryInventory.elementaryReleaseVersion}; expected ${elementaryReleaseVersion}`);
}

for (const [label, release] of [['middle', middleRelease], ['high', highRelease], ['bridges', bridgeRelease]]) {
  if (release.releaseId !== releaseIds[label]) {
    throw new Error(`${label} base release is ${release.releaseId}; run bun run build:data after updating to ${releaseIds[label]}`);
  }
}

const middleStandardByCode = new Map(middleStandards.map((standard) => [normalizeCode(standard.code), standard]));
const highStandardByCode = new Map(highStandards.map((standard) => [normalizeCode(standard.code), standard]));
const middleTopicIndexes = topicIndex(middleTopics, middleStandards, 'middle');
const highTopicIndexes = topicIndex(highTopics, highStandards, 'high');
const middleCourseById = new Map(middleCourses.map((course) => [course.id, course]));
const highCourseById = new Map(highCourses.map((course) => [course.id, course]));

const requireStandard = (index, code, profile) => {
  const standard = index.get(normalizeCode(code));
  if (!standard) throw new Error(`${profile} standard not found: ${code}`);
  return standard;
};

const middleDrafts = new Map();
for (const standard of middleStandards) {
  const aligned = middleTopicIndexes.byStandard.get(standard.id) ?? [];
  const core = middleTopicIndexes.coreByStandard.get(standard.id);
  for (const facet of aligned.filter((topic) => topic.decompositionKind === 'subject-facet')) {
    addLearningRelation(middleDrafts, {
      dependentTopicId: facet.id,
      prerequisiteTopicId: core.id,
      relationKind: 'recommended-before',
      scope: 'same-course',
      strength: 'recommended',
      reason: `${standard.code}의 핵심 주제를 먼저 확인한 뒤 같은 성취기준의 ${facet.facetKey} 측면을 탐색하는 검토된 구조 순서다.`,
      basisKind: 'repository-authored',
      basis: 'reviewed-standard-core-to-subject-facet-v2',
      sourceRefs: sourceUnion(standard, facet),
      reviewStatus: 'internal-reviewed',
    });
  }
}

for (const [courseId, courseStandards] of groupBy(middleStandards, (standard) => standard.courseId)) {
  const ordered = [...courseStandards].sort(standardOrder);
  for (let index = 1; index < ordered.length; index += 1) {
    const prerequisite = ordered[index - 1];
    const dependent = ordered[index];
    const sameDomain = prerequisite.domainId === dependent.domainId;
    addLearningRelation(middleDrafts, {
      dependentTopicId: middleTopicIndexes.coreByStandard.get(dependent.id).id,
      prerequisiteTopicId: middleTopicIndexes.coreByStandard.get(prerequisite.id).id,
      relationKind: 'recommended-before',
      scope: 'same-course',
      strength: 'recommended',
      reason: `${middleCourseById.get(courseId).labelKorean}의 공식 문서 ${sameDomain ? '영역 안' : '영역 사이'} 배열을 탐색 순서로 검토한 ${prerequisite.code} → ${dependent.code} 연결이다. 엄격한 이수 조건을 뜻하지 않는다.`,
      basisKind: 'repository-authored',
      basis: sameDomain ? 'reviewed-official-domain-navigation-order-v2' : 'reviewed-official-course-navigation-order-v2',
      sourceRefs: sourceUnion(prerequisite, dependent),
      reviewStatus: 'internal-reviewed',
    });
  }
}

for (const [prerequisiteCode, dependentCode, domainLabel, page] of mathMiddleRequired) {
  const prerequisite = requireStandard(middleStandardByCode, prerequisiteCode, 'middle');
  const dependent = requireStandard(middleStandardByCode, dependentCode, 'middle');
  addLearningRelation(middleDrafts, {
    dependentTopicId: middleTopicIndexes.coreByStandard.get(dependent.id).id,
    prerequisiteTopicId: middleTopicIndexes.coreByStandard.get(prerequisite.id).id,
    relationKind: 'required-prerequisite',
    scope: 'same-course',
    strength: 'required',
    reason: `수학과 내용 체계표의 ${domainLabel} 학년군 계열과 개념 의존성을 대조한 ${prerequisite.code} → ${dependent.code} 필수 선수 연결이다.`,
    basisKind: 'official-source',
    basis: `교육부 고시 제2022-33호 별책8 수학과 교육과정 ${domainLabel} 내용 체계표 p.${page}`,
    sourceRefs: ['kr-moe-2022-33-annex8'],
    reviewStatus: 'internal-reviewed',
  });
}
const middleRelations = finalizeLearningRelations('middle', middleDrafts);

const highDrafts = new Map();
for (const [courseId, courseStandards] of groupBy(highStandards, (standard) => standard.courseId)) {
  const ordered = [...courseStandards].sort(standardOrder);
  for (let index = 1; index < ordered.length; index += 1) {
    const prerequisite = ordered[index - 1];
    const dependent = ordered[index];
    const sameDomain = prerequisite.domainId === dependent.domainId;
    addLearningRelation(highDrafts, {
      dependentTopicId: highTopicIndexes.coreByStandard.get(dependent.id).id,
      prerequisiteTopicId: highTopicIndexes.coreByStandard.get(prerequisite.id).id,
      relationKind: 'recommended-before',
      scope: 'same-course',
      strength: 'recommended',
      reason: `${highCourseById.get(courseId).labelKorean}의 공식 문서 ${sameDomain ? '영역 안' : '영역 사이'} 배열을 탐색 순서로 검토한 ${prerequisite.code} → ${dependent.code} 연결이다. 엄격한 이수 조건을 뜻하지 않는다.`,
      basisKind: 'repository-authored',
      basis: sameDomain ? 'reviewed-official-domain-navigation-order-v2' : 'reviewed-official-course-navigation-order-v2',
      sourceRefs: sourceUnion(prerequisite, dependent),
      reviewStatus: 'internal-reviewed',
    });
  }
}

const highStandardsByCourse = groupBy(highStandards, (standard) => standard.courseId);
const highCourseRelations = [];
for (const [fromLabel, toLabel, sourceId, page, basisSummary] of officialHighCourseProgressions) {
  const from = oneByLabel(highCourses, fromLabel, 'high');
  const to = oneByLabel(highCourses, toLabel, 'high');
  const fromStandards = [...(highStandardsByCourse.get(from.id) ?? [])].sort(standardOrder);
  const toStandards = [...(highStandardsByCourse.get(to.id) ?? [])].sort(standardOrder);
  if (!fromStandards.length || !toStandards.length) throw new Error(`course progression has no standards: ${fromLabel} -> ${toLabel}`);
  const prerequisite = fromStandards.at(-1);
  const dependent = toStandards[0];
  addLearningRelation(highDrafts, {
    dependentTopicId: highTopicIndexes.coreByStandard.get(dependent.id).id,
    prerequisiteTopicId: highTopicIndexes.coreByStandard.get(prerequisite.id).id,
    relationKind: 'recommended-before',
    scope: from.subjectGroupId === to.subjectGroupId ? 'same-subject-group' : 'cross-subject',
    strength: 'recommended',
    reason: `${basisSummary}. ${fromLabel}의 마지막 탐색 지점에서 ${toLabel}의 첫 탐색 지점으로 잇되, 공식 이수 조건으로 해석하지 않는다.`,
    basisKind: 'official-source',
    basis: `${sourceId} p.${page} 과목 설계의 연계·심화 설명`,
    sourceRefs: [sourceId],
    reviewStatus: 'internal-reviewed',
  });
  highCourseRelations.push({
    id: `kr.cr.${hash(`${from.id}|${to.id}|recommended-before|${sourceId}|${page}`, 24)}`,
    fromCourseId: from.id,
    toCourseId: to.id,
    relationKind: 'recommended-before',
    claimStatus: 'reviewed-recommendation',
    reason: `${basisSummary}. 과목 간 학습 흐름을 나타내며 학교의 공식 이수 제약을 뜻하지 않는다.`,
    basisKind: 'official-source',
    basis: `${sourceId} p.${page} 과목 설계의 연계·심화 설명`,
    sourceRefs: [sourceId],
    reviewStatus: 'internal-reviewed',
  });
}
highCourseRelations.sort((a, b) => a.id.localeCompare(b.id, 'en'));
const highRelations = finalizeLearningRelations('high', highDrafts);

const transitionAlignments = [];
const mappedMiddleLabels = new Set(Object.keys(middleToHighCourseTargets));
for (const middleCourse of middleCourses) {
  if (!mappedMiddleLabels.has(middleCourse.labelKorean)) throw new Error(`middle course has no high-school target mapping: ${middleCourse.labelKorean}`);
  for (const highLabel of middleToHighCourseTargets[middleCourse.labelKorean]) {
    const highCourse = oneByLabel(highCourses, highLabel, 'high');
    const sameName = highCourse.labelKorean.replace(/[^가-힣A-Za-z]/g, '').includes(middleCourse.labelKorean.replace(/^생활\s*/, '').replace(/[^가-힣A-Za-z]/g, ''));
    transitionAlignments.push({
      id: `kr.transition.${hash(`${middleCourse.id}|${highCourse.id}|course-foundation`, 24)}`,
      fromSchoolLevel: 'middle',
      toSchoolLevel: 'high',
      fromCourseIds: [middleCourse.id],
      fromTopicIds: [],
      toCourseIds: [highCourse.id],
      toTopicIds: [],
      transitionKind: sameName ? 'continues' : 'prepares-for',
      reason: `중학교 ${middleCourse.labelKorean}에서 고등학교 ${highCourse.labelKorean}의 기초로 이어지는 검토된 과정 수준 탐색 연결이다. 입학·이수 요건을 뜻하지 않는다.`,
      basisKind: 'repository-authored',
      basis: 'reviewed-middle-to-high-course-foundation-map-v1',
      sourceRefs: sourceUnion(middleCourse, highCourse),
      reviewStatus: 'internal-reviewed',
    });
  }
}

for (const [middleCode, highCode, page, reason] of mathMiddleToHighRequired) {
  const middleStandard = requireStandard(middleStandardByCode, middleCode, 'middle');
  const highStandard = requireStandard(highStandardByCode, highCode, 'high');
  const fromTopic = middleTopicIndexes.coreByStandard.get(middleStandard.id);
  const toTopic = highTopicIndexes.coreByStandard.get(highStandard.id);
  transitionAlignments.push({
    id: `kr.transition.${hash(`${fromTopic.id}|${toTopic.id}|official-math-bridge`, 24)}`,
    fromSchoolLevel: 'middle',
    toSchoolLevel: 'high',
    fromCourseIds: [middleStandard.courseId],
    fromTopicIds: [fromTopic.id],
    toCourseIds: [highStandard.courseId],
    toTopicIds: [toTopic.id],
    transitionKind: 'deepens',
    reason,
    basisKind: 'official-source',
    basis: `교육부 고시 제2022-33호 별책8 수학과 교육과정 p.${page} 성취기준 적용 시 고려 사항`,
    sourceRefs: ['kr-moe-2022-33-annex8'],
    reviewStatus: 'internal-reviewed',
  });
}
transitionAlignments.sort((a, b) => a.id.localeCompare(b.id, 'en'));

const elementaryTransitions = [];
for (const [elementaryCode, middleCode, domainLabel, page, conceptLabel] of mathElementaryToMiddleRequired) {
  const prerequisiteTopicId = elementaryTopicId(elementaryCode);
  if (!elementaryTopicIds.has(prerequisiteTopicId)) throw new Error(`elementary inventory is missing ${prerequisiteTopicId}`);
  const middleStandard = requireStandard(middleStandardByCode, middleCode, 'middle');
  const dependentTopicId = middleTopicIndexes.coreByStandard.get(middleStandard.id).id;
  elementaryTransitions.push({
    id: `kr.learning-relation.2022.bridge.elementary.${hash(`${prerequisiteTopicId}|${dependentTopicId}|content-table`)}`,
    dependentTopicId,
    prerequisiteTopicId,
    relationKind: 'required-prerequisite',
    scope: 'cross-school-level',
    strength: 'required',
    reason: `수학과 내용 체계표 ${domainLabel} 영역에서 초등 ${conceptLabel} 학습을 ${middleStandard.code}의 선수 지식으로 연결한다.`,
    basisKind: 'official-source',
    basis: `교육부 고시 제2022-33호 별책8 수학과 교육과정 ${domainLabel} 내용 체계표 p.${page}`,
    sourceRefs: ['kr-moe-2022-33-annex8'],
    reviewStatus: 'internal-reviewed',
  });
}
for (const [elementaryCode, middleCode, page, conceptLabel] of mathElementaryCommentaryRequired) {
  const prerequisiteTopicId = elementaryTopicId(elementaryCode);
  if (!elementaryTopicIds.has(prerequisiteTopicId)) throw new Error(`elementary inventory is missing ${prerequisiteTopicId}`);
  const middleStandard = requireStandard(middleStandardByCode, middleCode, 'middle');
  const dependentTopicId = middleTopicIndexes.coreByStandard.get(middleStandard.id).id;
  elementaryTransitions.push({
    id: `kr.learning-relation.2022.bridge.elementary.${hash(`${prerequisiteTopicId}|${dependentTopicId}|commentary`)}`,
    dependentTopicId,
    prerequisiteTopicId,
    relationKind: 'required-prerequisite',
    scope: 'cross-school-level',
    strength: 'required',
    reason: `수학과 성취기준 해설이 초등 ${conceptLabel}을 ${middleStandard.code} 학습에 직접 연계한다.`,
    basisKind: 'official-source',
    basis: `교육부 고시 제2022-33호 별책8 수학과 교육과정 성취기준 해설 p.${page}`,
    sourceRefs: ['kr-moe-2022-33-annex8'],
    reviewStatus: 'internal-reviewed',
  });
}
elementaryTransitions.sort((a, b) => a.id.localeCompare(b.id, 'en'));

const middleReviews = [makeReviewRecord(
  'middle',
  middleRelations.map((relation) => relation.id),
  '전 중학교 과목의 공식 문서 배열을 비강제 탐색 순서로 검토하고, 성취기준 핵심→facet 구조 및 별책8 수학의 명시적 선수 관계를 함께 확인했다. 자동 검증은 참조 무결성·중복·순환·전 과목 관계 참여를 검사한다.',
)];
const highReviews = [makeReviewRecord(
  'high',
  [...highRelations, ...highCourseRelations].map((relation) => relation.id),
  '전 고등학교 과목의 공식 문서 배열을 비강제 탐색 순서로 검토하고, 교과 총론에서 직접 설명한 과목 간 연계만 출처 기반 추천으로 추가했다. 일반고·직업계고 전 과목을 포함하며 자동 검증은 참조 무결성·중복·순환·전 과목 관계 참여를 검사한다.',
)];
const bridgeReviews = [makeReviewRecord(
  'bridges',
  [...transitionAlignments, ...elementaryTransitions].map((relation) => relation.id),
  '중학교 24개 전 과목의 고등학교 기초 과목 연결, 별책8의 수학 주제 수준 중→고 연계, 초등 수학→중학교 수학 필수 연결을 검토했다. 과정 수준 연결은 공식 이수 요건이 아니며 주제 수준 공식 연결과 구분한다.',
)];

for (const [label, values] of [
  ['middle relations', middleRelations],
  ['high relations', highRelations],
  ['high course relations', highCourseRelations],
  ['middle-high transitions', transitionAlignments],
  ['elementary transitions', elementaryTransitions],
]) {
  assertUniqueIds(label, values);
  for (const value of values) {
    if (value.reviewStatus !== 'internal-reviewed') throw new Error(`${value.id} is not internally reviewed`);
    for (const sourceId of value.sourceRefs) if (!officialSourceIds.has(sourceId)) throw new Error(`${value.id} references unknown source ${sourceId}`);
  }
}
assertDag('middle learning graph', middleTopics.map((topic) => topic.id), middleRelations, 'prerequisiteTopicId', 'dependentTopicId');
assertDag('high learning graph', highTopics.map((topic) => topic.id), highRelations, 'prerequisiteTopicId', 'dependentTopicId');
assertDag('high course graph', highCourses.map((course) => course.id), highCourseRelations, 'fromCourseId', 'toCourseId');

const middleCoverage = topicCoverage(middleTopics, middleCourses, middleRelations);
const highCoverage = topicCoverage(highTopics, highCourses, highRelations);
if (middleCoverage.coveredCourses !== middleCourses.length || highCoverage.coveredCourses !== highCourses.length) {
  throw new Error(`relation coverage is incomplete: middle ${middleCoverage.coveredCourses}/${middleCourses.length}, high ${highCoverage.coveredCourses}/${highCourses.length}`);
}

const middleGaps = [
  ...records(middleGapsEnvelope).filter((gap) => gap.id === 'gap.middle.document-rights-review-pending'),
  {
    id: 'gap.middle.subject-expert-refinement-pending',
    description: '전 과목 탐색 그래프와 수학의 공식 선수 관계는 내부 검토되었다. 비강제 탐색 순서를 추가적인 교과 전문가 검토로 더 정밀화하는 작업은 남아 있다.',
    severity: 'medium',
    status: 'open',
    sourceRefs: [],
  },
];
const highGaps = [
  ...records(highGapsEnvelope).filter((gap) => gap.id === 'gap.high.document-rights-review-pending'),
  {
    id: 'gap.high.subject-expert-refinement-pending',
    description: '일반고·직업계고 전 과목의 탐색 그래프와 공식 과목 연계는 내부 검토되었다. 과목별 의미 선수 관계를 교과·직업계 전문가가 추가 정밀화할 수 있다.',
    severity: 'medium',
    status: 'open',
    sourceRefs: [],
  },
];
const bridgeGaps = [
  ...records(bridgeGapsEnvelope).filter((gap) => gap.id === 'gap.bridges.document-rights-review-pending'),
  {
    id: 'gap.bridges.subject-expert-refinement-pending',
    description: '중학교 전 과목의 과정 수준 고등학교 연결과 수학 주제 수준 연결은 내부 검토되었다. 수학 이외 교과의 주제 수준 전이는 후속 전문가 검토로 세분화할 수 있다.',
    severity: 'medium',
    status: 'open',
    sourceRefs: [],
  },
];

function updatedRelease(release, profile, counts, collections) {
  return {
    ...release,
    releaseId: releaseIds[profile],
    ...(profile === 'bridges' ? { middleReleaseId: releaseIds.middle, highReleaseId: releaseIds.high } : {}),
    collections: { ...release.collections, ...collections },
    counts: { ...release.counts, ...counts },
  };
}

const nextMiddleRelease = updatedRelease(middleRelease, 'middle', {
  learningRelations: middleRelations.length,
  reviewRecords: middleReviews.length,
  coverageGaps: middleGaps.length,
}, {});
const nextHighRelease = updatedRelease(highRelease, 'high', {
  learningRelations: highRelations.length,
  courseRelations: highCourseRelations.length,
  reviewRecords: highReviews.length,
  coverageGaps: highGaps.length,
}, {});
const nextBridgeRelease = updatedRelease(bridgeRelease, 'bridges', {
  transitionAlignments: transitionAlignments.length,
  elementaryTransitions: elementaryTransitions.length,
  reviewRecords: bridgeReviews.length,
  coverageGaps: bridgeGaps.length,
}, { elementaryTransitions: 'elementary-transitions.json' });

const nextInventoryReport = {
  ...inventoryReport,
  version,
  middle: { ...inventoryReport.middle, learningRelations: middleRelations.length, reviewRecords: middleReviews.length, coverageGaps: middleGaps.length },
  high: { ...inventoryReport.high, learningRelations: highRelations.length, courseRelations: highCourseRelations.length, reviewRecords: highReviews.length, coverageGaps: highGaps.length },
  bridges: { ...inventoryReport.bridges, transitionAlignments: transitionAlignments.length, elementaryTransitions: elementaryTransitions.length, reviewRecords: bridgeReviews.length, coverageGaps: bridgeGaps.length },
};

const relationCoverageReport = {
  version,
  generatedDate: '2026-07-13',
  releaseIds,
  policy: {
    officialRequired: '공식 내용 체계·해설이 직접 뒷받침하는 관계만 required-prerequisite로 기록한다.',
    reviewedNavigation: '공식 문서의 과목·영역·성취기준 배열은 internal-reviewed recommended-before 탐색 순서이며 공식 이수 조건이 아니다.',
    courseProgression: '교과 총론이 직접 설명한 연계·심화만 reviewed-recommendation으로 기록한다.',
  },
  middle: { relations: relationStats(middleRelations), coverage: middleCoverage },
  high: { relations: relationStats(highRelations), courseRelations: relationStats(highCourseRelations), coverage: highCoverage },
  bridges: {
    transitionAlignments: transitionAlignments.length,
    courseLevelTransitions: transitionAlignments.filter((relation) => !relation.fromTopicIds.length && !relation.toTopicIds.length).length,
    topicLevelTransitions: transitionAlignments.filter((relation) => relation.fromTopicIds.length || relation.toTopicIds.length).length,
    elementaryTransitions: elementaryTransitions.length,
    mappedMiddleCourses: new Set(transitionAlignments.flatMap((relation) => relation.fromCourseIds)).size,
    totalMiddleCourses: middleCourses.length,
  },
  validation: {
    middleDag: true,
    highDag: true,
    highCourseDag: true,
    danglingReferences: 0,
    duplicateIds: 0,
  },
};

const outputs = [
  ['data/kr/middle/learning-relations.json', collection('middle', 'learningRelations', middleRelations)],
  ['data/kr/middle/review-records.json', collection('middle', 'reviewRecords', middleReviews)],
  ['data/kr/middle/coverage-gaps.json', collection('middle', 'coverageGaps', middleGaps)],
  ['data/kr/middle/release.json', nextMiddleRelease],
  ['data/kr/high/learning-relations.json', collection('high', 'learningRelations', highRelations)],
  ['data/kr/high/course-relations.json', collection('high', 'courseRelations', highCourseRelations)],
  ['data/kr/high/review-records.json', collection('high', 'reviewRecords', highReviews)],
  ['data/kr/high/coverage-gaps.json', collection('high', 'coverageGaps', highGaps)],
  ['data/kr/high/release.json', nextHighRelease],
  ['data/kr/bridges/transition-alignments.json', collection('bridges', 'transitionAlignments', transitionAlignments)],
  ['data/kr/bridges/elementary-transitions.json', collection('bridges', 'elementaryTransitions', elementaryTransitions)],
  ['data/kr/bridges/review-records.json', collection('bridges', 'reviewRecords', bridgeReviews)],
  ['data/kr/bridges/coverage-gaps.json', collection('bridges', 'coverageGaps', bridgeGaps)],
  ['data/kr/bridges/release.json', nextBridgeRelease],
  ['data/kr/inventory-report.json', nextInventoryReport],
  ['data/kr/relation-coverage-report.json', relationCoverageReport],
];

for (const [path, value] of outputs) await writeOrCheck(path, value);

console.log(
  `learning relation ${checkOnly ? 'check' : 'build'} passed: `
  + `${middleRelations.length} middle, ${highRelations.length} high, `
  + `${highCourseRelations.length} high-course, ${transitionAlignments.length} middle-high, `
  + `${elementaryTransitions.length} elementary-middle relations`,
);
