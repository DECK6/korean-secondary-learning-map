import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { officialRelationSpecs } from './lib/official-relation-specs/index.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const version = '0.5.0-candidate';
const elementaryReleaseVersion = 'kr-full-depth-v0.4';
const releaseIds = {
  middle: 'kr-2022-middle-v0.5.0-candidate',
  high: 'kr-2022-high-v0.5.0-candidate',
  bridges: 'kr-2022-middle-high-bridge-v0.5.0-candidate',
};
const natural = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

const officialHighCourseProgressions = [
  ['공통국어1', '공통국어2', 'kr-moe-2022-33-annex5', 104, '공통국어 1·2의 반복·심화·확장 연계'],
  ['공통국어2', '화법과 언어', 'kr-moe-2022-33-annex5', 104, '공통국어에서 선택 국어로 이어지는 심화·확장'],
  ['공통국어2', '독서와 작문', 'kr-moe-2022-33-annex5', 104, '공통국어에서 선택 국어로 이어지는 심화·확장'],
  ['공통국어2', '문학', 'kr-moe-2022-33-annex5', 104, '공통국어에서 선택 국어로 이어지는 심화·확장'],
  ['공통국어2', '직무 의사소통', 'kr-moe-2022-33-annex5', 177, '초·중 국어와 공통국어를 직무 의사소통에서 심화·확장'],
  ['공통수학1', '공통수학2', 'kr-moe-2022-33-annex8', 59, '고등학교 수학의 공통 기초 과목 계열'],
  ['기본수학1', '기본수학2', 'kr-moe-2022-33-annex8', 59, '공통수학 1·2에 대응하는 기본수학 과목 계열'],
  ['공통수학2', '대수', 'kr-moe-2022-33-annex8', 59, '공통 과목을 기초로 하는 일반 선택 수학'],
  ['공통수학2', '미적분Ⅰ', 'kr-moe-2022-33-annex8', 59, '공통 과목을 기초로 하는 일반 선택 수학'],
  ['공통수학2', '확률과 통계', 'kr-moe-2022-33-annex8', 59, '공통 과목을 기초로 하는 일반 선택 수학'],
  ['공통수학2', '기하', 'kr-moe-2022-33-annex8', 59, '공통 과목을 기초로 하는 진로 선택 수학'],
  ['통합과학1', '통합과학2', 'kr-nec-2024-3-annex9', 81, '중학교 과학과 연계된 통합과학 공통 과목 계열'],
  ['과학탐구실험1', '과학탐구실험2', 'kr-nec-2024-3-annex9', 98, '탐구 활동이 연계되는 과학탐구실험 공통 과목 계열'],
  ['통합과학2', '물리학', 'kr-nec-2024-3-annex9', 76, '공통 과학과 연계하는 일반 선택 기초 과학'],
  ['통합과학2', '화학', 'kr-nec-2024-3-annex9', 76, '공통 과학과 연계하는 일반 선택 기초 과학'],
  ['통합과학2', '생명과학', 'kr-nec-2024-3-annex9', 76, '공통 과학과 연계하는 일반 선택 기초 과학'],
  ['통합과학2', '지구과학', 'kr-nec-2024-3-annex9', 76, '공통 과학과 연계하는 일반 선택 기초 과학'],
  ['물리학', '역학과 에너지', 'kr-nec-2024-3-annex9', 165, '일반 선택 물리학을 바탕으로 하는 진로 선택 과목'],
  ['물리학', '전자기와 양자', 'kr-nec-2024-3-annex9', 177, '일반 선택 물리학을 바탕으로 하는 진로 선택 과목'],
  ['화학', '물질과 에너지', 'kr-nec-2024-3-annex9', 189, '고등학교 화학 지식과 실천을 확장'],
  ['화학', '화학 반응의 세계', 'kr-nec-2024-3-annex9', 201, '고등학교 화학 지식과 실천을 확장'],
  ['생명과학', '세포와 물질대사', 'kr-nec-2024-3-annex9', 212, '고등학교 생명과학 지식과 실천을 연계'],
  ['생명과학', '생물의 유전', 'kr-nec-2024-3-annex9', 224, '고등학교 생명과학 지식과 실천을 연계'],
  ['지구과학', '지구시스템과학', 'kr-nec-2024-3-annex9', 235, '일반 선택 지구과학까지의 지식과 실천을 연계'],
  ['지구과학', '행성우주과학', 'kr-nec-2024-3-annex9', 247, '일반 선택 지구과학까지의 지식과 실천을 연계'],
  ['기술⋅가정', '생활과학 탐구', 'kr-moe-2022-33-annex10', 47, '기술·가정이 생활과학 진로 선택 학습의 기본 과목'],
  ['기술⋅가정', '아동발달과 부모', 'kr-moe-2022-33-annex10', 48, '기술·가정의 생활과학 내용을 심화·발전'],
  ['기술⋅가정', '생애 설계와 자립', 'kr-moe-2022-33-annex10', 48, '기술·가정의 생활과학 내용을 심화·발전'],
  ['기술⋅가정', '로봇과 공학세계', 'kr-moe-2022-33-annex10', 48, '기술·가정의 공학 지식과 문제 해결을 심화·확장'],
  ['기술⋅가정', '창의 공학 설계', 'kr-moe-2022-33-annex10', 48, '기술·가정의 공학 지식과 문제 해결을 심화·확장'],
  ['기술⋅가정', '지식 재산 일반', 'kr-moe-2022-33-annex10', 48, '기술·가정의 공학 지식과 문제 해결을 심화·확장'],
  ['공통영어1', '공통영어2', 'kr-nec-2024-3-annex14', 58, '학기별 이수 흐름을 고려한 공통영어 과목 계열'],
  ['기본영어1', '기본영어2', 'kr-nec-2024-3-annex14', 58, '학기별 이수 흐름을 고려한 기본영어 과목 계열'],
  ['공통영어2', '영어 I', 'kr-nec-2024-3-annex14', 89, '공통영어에서 배운 내용을 바탕으로 일반 영어를 심화'],
  ['영어 I', '영어 Ⅱ', 'kr-nec-2024-3-annex14', 58, '일반 목적 영어의 단계적 선택 과목 계열'],
  ['공통영어2', '영어 독해와 작문', 'kr-nec-2024-3-annex14', 120, '공통영어에서 배운 내용을 바탕으로 독해와 작문을 심화'],
  ['공통영어2', '직무 영어', 'kr-nec-2024-3-annex14', 135, '공통영어에서 배운 내용을 바탕으로 직무 영어를 심화'],
  ['기초 체육 전공 실기', '심화 체육 전공 실기', 'kr-moe-2022-33-annex21', 10, '기본 기능에서 복합 기능으로 이어지는 체계적 심화'],
  ['심화 체육 전공 실기', '고급 체육 전공 실기', 'kr-moe-2022-33-annex21', 10, '복합 기능에서 응용 기능으로 이어지는 체계적 심화'],
];

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

function courseCoverage(courses, topics, learningRelations, courseRelations = []) {
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const relationIdsByCourse = new Map(courses.map((course) => [course.id, new Set()]));
  for (const relation of learningRelations) {
    for (const topicId of [relation.prerequisiteTopicId, relation.dependentTopicId]) {
      for (const courseId of topicById.get(topicId)?.courseIds ?? []) relationIdsByCourse.get(courseId)?.add(relation.id);
    }
  }
  for (const relation of courseRelations) {
    relationIdsByCourse.get(relation.fromCourseId)?.add(relation.id);
    relationIdsByCourse.get(relation.toCourseId)?.add(relation.id);
  }
  const byCourse = courses
    .map((course) => ({
      courseId: course.id,
      courseLabel: course.labelKorean,
      hasOfficialRelations: relationIdsByCourse.get(course.id).size > 0,
      relationCount: relationIdsByCourse.get(course.id).size,
    }))
    .sort((a, b) => natural.compare(a.courseLabel, b.courseLabel) || a.courseId.localeCompare(b.courseId, 'en'));
  const coursesWithOfficialRelations = byCourse.filter((course) => course.hasOfficialRelations).length;
  return {
    totalCourses: courses.length,
    coursesWithOfficialRelations,
    coursesWithoutOfficialRelations: courses.length - coursesWithOfficialRelations,
    byCourse,
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
  sourceCatalog,
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
  readJson('sources/official/source-catalog.json'),
]);

const middleCourses = records(middleCoursesEnvelope);
const middleStandards = records(middleStandardsEnvelope);
const middleTopics = records(middleTopicsEnvelope);
const highCourses = records(highCoursesEnvelope);
const highStandards = records(highStandardsEnvelope);
const highTopics = records(highTopicsEnvelope);
const officialSourceIds = new Set(sourceManifest.sources.map((source) => source.id));
const sourceCatalogById = new Map(sourceCatalog.sources.map((source) => [source.id, source]));
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

const requireStandard = (index, code, profile) => {
  const standard = index.get(normalizeCode(code));
  if (!standard) throw new Error(`${profile} standard not found: ${code}`);
  return standard;
};

function relationSpecContext(spec) {
  const source = sourceCatalogById.get(spec.annexId);
  if (!source) throw new Error(`${spec.subject} relation spec references unknown annex ${spec.annexId}`);
  if (spec.level !== 'high') {
    for (const courseLabel of spec.courseLabels) oneByLabel(middleCourses, courseLabel, 'middle');
  }
  const subjectLabel = spec.level === 'high'
    ? source.originalName
      .replace(/\.pdf$/i, '')
      .replace(/^.*?\[별책\d+\]\s*/, '')
      .replace(/_+\s*국가교육위원회\s*고시.*$/, '')
      .trim()
    : spec.courseLabels.join('·');
  return {
    citation: `${source.governingNotice} 별책${source.annex} ${subjectLabel}${spec.level === 'high' ? '' : '과 교육과정'}`,
    subjectLabel,
  };
}

const middleDrafts = new Map();
for (const spec of officialRelationSpecs) {
  const { citation, subjectLabel } = relationSpecContext(spec);
  for (const [prerequisiteCode, dependentCode, domainLabel, page] of spec.middleRequired) {
    const prerequisite = requireStandard(middleStandardByCode, prerequisiteCode, 'middle');
    const dependent = requireStandard(middleStandardByCode, dependentCode, 'middle');
    addLearningRelation(middleDrafts, {
      dependentTopicId: middleTopicIndexes.coreByStandard.get(dependent.id).id,
      prerequisiteTopicId: middleTopicIndexes.coreByStandard.get(prerequisite.id).id,
      relationKind: 'required-prerequisite',
      scope: 'same-course',
      strength: 'required',
      reason: `${subjectLabel}과 내용 체계표의 ${domainLabel} 학년군 계열과 개념 의존성을 대조한 ${prerequisite.code} → ${dependent.code} 필수 선수 연결이다.`,
      basisKind: 'official-source',
      basis: `${citation} ${domainLabel} 내용 체계표 p.${page}`,
      sourceRefs: [spec.annexId],
      reviewStatus: 'internal-reviewed',
    });
  }
  for (const [prerequisiteCode, dependentCode, page, reason] of spec.middleCommentaryRequired) {
    const prerequisite = requireStandard(middleStandardByCode, prerequisiteCode, 'middle');
    const dependent = requireStandard(middleStandardByCode, dependentCode, 'middle');
    addLearningRelation(middleDrafts, {
      dependentTopicId: middleTopicIndexes.coreByStandard.get(dependent.id).id,
      prerequisiteTopicId: middleTopicIndexes.coreByStandard.get(prerequisite.id).id,
      relationKind: 'required-prerequisite',
      scope: 'same-course',
      strength: 'required',
      reason,
      basisKind: 'official-source',
      basis: `${citation} 성취기준 해설 p.${page}`,
      sourceRefs: [spec.annexId],
      reviewStatus: 'internal-reviewed',
    });
  }
}
const middleRelations = finalizeLearningRelations('middle', middleDrafts);

const highDrafts = new Map();
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
for (const spec of officialRelationSpecs) {
  const { citation } = relationSpecContext(spec);
  for (const [prerequisiteCode, dependentCode, domainLabel, page] of spec.highRequired ?? []) {
    const prerequisite = requireStandard(highStandardByCode, prerequisiteCode, 'high');
    const dependent = requireStandard(highStandardByCode, dependentCode, 'high');
    addLearningRelation(highDrafts, {
      dependentTopicId: highTopicIndexes.coreByStandard.get(dependent.id).id,
      prerequisiteTopicId: highTopicIndexes.coreByStandard.get(prerequisite.id).id,
      relationKind: 'required-prerequisite',
      scope: prerequisite.courseId === dependent.courseId ? 'same-course' : 'cross-course',
      strength: 'required',
      reason: `${domainLabel} 내용 체계/과목 설계가 ${prerequisite.code} → ${dependent.code} 필수 선수 관계를 직접 뒷받침한다.`,
      basisKind: 'official-source',
      basis: `${citation} 내용 체계/과목 설계 p.${page}`,
      sourceRefs: [spec.annexId],
      reviewStatus: 'internal-reviewed',
    });
  }
  for (const [prerequisiteCode, dependentCode, page, reason] of spec.highCommentaryRequired ?? []) {
    const prerequisite = requireStandard(highStandardByCode, prerequisiteCode, 'high');
    const dependent = requireStandard(highStandardByCode, dependentCode, 'high');
    addLearningRelation(highDrafts, {
      dependentTopicId: highTopicIndexes.coreByStandard.get(dependent.id).id,
      prerequisiteTopicId: highTopicIndexes.coreByStandard.get(prerequisite.id).id,
      relationKind: 'required-prerequisite',
      scope: prerequisite.courseId === dependent.courseId ? 'same-course' : 'cross-course',
      strength: 'required',
      reason,
      basisKind: 'official-source',
      basis: `${citation} 성취기준 해설 p.${page}`,
      sourceRefs: [spec.annexId],
      reviewStatus: 'internal-reviewed',
    });
  }
}
const highRelations = finalizeLearningRelations('high', highDrafts);

const transitionAlignments = [];
for (const spec of officialRelationSpecs) {
  const { citation } = relationSpecContext(spec);
  for (const [middleCode, highCode, page, reason] of spec.middleToHighRequired) {
    const middleStandard = requireStandard(middleStandardByCode, middleCode, 'middle');
    const highStandard = requireStandard(highStandardByCode, highCode, 'high');
    const fromTopic = middleTopicIndexes.coreByStandard.get(middleStandard.id);
    const toTopic = highTopicIndexes.coreByStandard.get(highStandard.id);
    transitionAlignments.push({
      id: `kr.transition.${hash(`${fromTopic.id}|${toTopic.id}|official-${spec.subject}-bridge`, 24)}`,
      fromSchoolLevel: 'middle',
      toSchoolLevel: 'high',
      fromCourseIds: [middleStandard.courseId],
      fromTopicIds: [fromTopic.id],
      toCourseIds: [highStandard.courseId],
      toTopicIds: [toTopic.id],
      transitionKind: 'deepens',
      reason,
      basisKind: 'official-source',
      basis: `${citation} p.${page} 성취기준 적용 시 고려 사항`,
      sourceRefs: [spec.annexId],
      reviewStatus: 'internal-reviewed',
    });
  }
}
transitionAlignments.sort((a, b) => a.id.localeCompare(b.id, 'en'));

const elementaryTransitions = [];
for (const spec of officialRelationSpecs) {
  const { citation, subjectLabel } = relationSpecContext(spec);
  for (const [prerequisiteTopicId, middleCode, domainLabel, page, conceptLabel] of spec.elementaryToMiddleRequired) {
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
      reason: `${subjectLabel}과 내용 체계표 ${domainLabel} 영역에서 초등 ${conceptLabel} 학습을 ${middleStandard.code}의 선수 지식으로 연결한다.`,
      basisKind: 'official-source',
      basis: `${citation} ${domainLabel} 내용 체계표 p.${page}`,
      sourceRefs: [spec.annexId],
      reviewStatus: 'internal-reviewed',
    });
  }
  for (const [prerequisiteTopicId, middleCode, page, conceptLabel] of spec.elementaryCommentaryRequired) {
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
      reason: `${subjectLabel}과 성취기준 해설이 초등 ${conceptLabel}을 ${middleStandard.code} 학습에 직접 연계한다.`,
      basisKind: 'official-source',
      basis: `${citation} 성취기준 해설 p.${page}`,
      sourceRefs: [spec.annexId],
      reviewStatus: 'internal-reviewed',
    });
  }
}
elementaryTransitions.sort((a, b) => a.id.localeCompare(b.id, 'en'));

const middleReviews = [makeReviewRecord(
  'middle',
  middleRelations.map((relation) => relation.id),
  '별책8 수학과 교육과정의 내용 체계표와 성취기준 해설이 직접 뒷받침하는 중학교 필수 선수 관계를 검토했다. 자동 검증은 공식 출처·참조 무결성·중복·순환을 검사한다.',
)];
const highReviews = [makeReviewRecord(
  'high',
  [...highRelations, ...highCourseRelations].map((relation) => relation.id),
  '교과 교육과정의 내용 체계·과목 설계·성취기준 해설이 직접 뒷받침하는 고등학교 필수 선수 관계와 과목 간 추천 연계를 검토했다. 자동 검증은 공식 출처·참조 무결성·중복·순환을 검사한다.',
)];
const bridgeReviews = [makeReviewRecord(
  'bridges',
  [...transitionAlignments, ...elementaryTransitions].map((relation) => relation.id),
  '별책8의 수학 주제 수준 중→고 연계와 초등 수학→중학교 수학 필수 연결을 검토했다. 공식 문서 근거가 없는 과정 수준 탐색 연결은 포함하지 않는다.',
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
const middleCourseCoverage = courseCoverage(middleCourses, middleTopics, middleRelations);
const highCourseCoverage = courseCoverage(highCourses, highTopics, highRelations, highCourseRelations);

const middleGaps = [
  ...records(middleGapsEnvelope).filter((gap) => gap.id === 'gap.middle.document-rights-review-pending'),
  {
    id: 'gap.middle.subject-expert-refinement-pending',
    description: '수학의 공식 선수 관계는 내부 검토되었다. 공식 문서 근거가 있는 다른 과목의 선수 관계를 추가 발굴하는 작업은 남아 있다.',
    severity: 'medium',
    status: 'open',
    sourceRefs: [],
  },
];
const highGaps = [
  ...records(highGapsEnvelope).filter((gap) => gap.id === 'gap.high.document-rights-review-pending'),
  {
    id: 'gap.high.subject-expert-refinement-pending',
    description: '공식 문서가 직접 설명한 고등학교 과목 연계는 내부 검토되었다. 추가적인 주제 수준 선수 관계를 공식 근거와 함께 발굴하는 작업은 남아 있다.',
    severity: 'medium',
    status: 'open',
    sourceRefs: [],
  },
];
const bridgeGaps = [
  ...records(bridgeGapsEnvelope).filter((gap) => gap.id === 'gap.bridges.document-rights-review-pending'),
  {
    id: 'gap.bridges.subject-expert-refinement-pending',
    description: '수학의 공식 주제 수준 학교급 전이는 내부 검토되었다. 수학 이외 교과의 주제 수준 전이를 공식 근거와 함께 발굴하는 작업은 남아 있다.',
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
  generatedDate: '2026-07-17',
  releaseIds,
  policy: {
    officialOnly: '학습 관계와 학교급 전이는 공식 문서가 직접 뒷받침하는 official-source 레코드만 공개한다.',
    officialRequired: '공식 내용 체계·해설이 직접 뒷받침하는 관계만 required-prerequisite로 기록한다.',
    courseProgression: '교과 총론이 직접 설명한 연계·심화만 reviewed-recommendation으로 기록한다.',
  },
  middle: { relations: relationStats(middleRelations), coverage: middleCoverage, courseCoverage: middleCourseCoverage },
  high: { relations: relationStats(highRelations), courseRelations: relationStats(highCourseRelations), coverage: highCoverage, courseCoverage: highCourseCoverage },
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
