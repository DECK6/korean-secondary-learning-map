import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = join(root, 'data/kr');
const uiRoot = join(root, 'ui/data');
const detailRoot = join(uiRoot, 'courses');
const distUiRoot = join(root, 'dist/ui');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
const fileFor = (id) => `${createHash('sha256').update(id).digest('hex').slice(0, 20)}.json`;
const officialRecords = (records, label) => {
  const unsupported = records.find((record) => record.basisKind !== 'official-source');
  if (unsupported) throw new Error(`${label} contains non-official relation ${unsupported.id}`);
  return records;
};
async function atomicJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, stable(value), 'utf8');
  await rename(temporary, path);
}

await mkdir(detailRoot, { recursive: true });
await mkdir(distUiRoot, { recursive: true });
const profiles = {};
for (const profile of ['middle', 'high']) {
  const names = ['subject-groups', 'courses', 'domains', 'standards', 'topics', 'clusters', 'learning-relations', 'learning-relations.candidate'];
  profiles[profile] = {};
  for (const name of names) {
    const records = (await readJson(join(dataRoot, profile, `${name}.json`))).records;
    profiles[profile][name] = name === 'learning-relations' ? officialRecords(records, `${profile}/${name}`) : records;
  }
}
const highExtras = {};
for (const name of ['course-relations', 'credit-rules', 'choice-sets', 'pathways']) {
  const records = (await readJson(join(dataRoot, 'high', `${name}.json`))).records;
  highExtras[name] = name === 'course-relations' ? officialRecords(records, `high/${name}`) : records;
}
const transitions = officialRecords((await readJson(join(dataRoot, 'bridges/transition-alignments.json'))).records, 'bridges/transition-alignments');
const elementaryBridges = officialRecords((await readJson(join(dataRoot, 'bridges/elementary-transitions.json'))).records, 'bridges/elementary-transitions');
const elementaryCandidateBridges = (await readJson(join(dataRoot, 'bridges/elementary-transitions.candidate.json'))).records;
const elementaryInventory = await readJson(join(dataRoot, 'bridges/elementary-topic-inventory.json'));
const sourceManifest = await readJson(join(dataRoot, 'shared/source-manifest.json'));
const inventory = await readJson(join(dataRoot, 'inventory-report.json'));

const groupById = new Map();
const courseById = new Map();
const topicById = new Map();
for (const profile of ['middle', 'high']) {
  for (const group of profiles[profile]['subject-groups']) groupById.set(group.id, group);
  for (const course of profiles[profile].courses) courseById.set(course.id, course);
  for (const topic of profiles[profile].topics) topicById.set(topic.id, topic);
}
const describeCourse = (id) => ({ id, label: courseById.get(id)?.labelKorean ?? id });
const describeTopic = (id) => {
  const topic = topicById.get(id);
  return {
    id,
    label: topic?.labelKorean ?? id,
    courseLabels: (topic?.courseIds ?? []).map((courseId) => courseById.get(courseId)?.labelKorean).filter(Boolean),
  };
};
const describeLearningRelation = (relation) => ({
  ...relation,
  prerequisite: describeTopic(relation.prerequisiteTopicId),
  dependent: describeTopic(relation.dependentTopicId),
});
const describeCourseRelation = (relation) => ({
  ...relation,
  from: describeCourse(relation.fromCourseId),
  to: describeCourse(relation.toCourseId),
});
const courseRelationsByCourse = new Map();
for (const relation of highExtras['course-relations']) {
  for (const courseId of new Set([relation.fromCourseId, relation.toCourseId])) {
    if (!courseRelationsByCourse.has(courseId)) courseRelationsByCourse.set(courseId, []);
    courseRelationsByCourse.get(courseId).push(relation);
  }
}

const courseIndex = [];
for (const profile of ['middle', 'high']) {
  const standardsByCourse = Map.groupBy(profiles[profile].standards, (record) => record.courseId);
  const topicsByCourse = new Map();
  for (const topic of profiles[profile].topics) {
    for (const courseId of topic.courseIds) {
      if (!topicsByCourse.has(courseId)) topicsByCourse.set(courseId, []);
      topicsByCourse.get(courseId).push(topic);
    }
  }
  const relationsByTopic = new Map();
  for (const relation of profiles[profile]['learning-relations']) {
    for (const id of [relation.prerequisiteTopicId, relation.dependentTopicId]) {
      if (!relationsByTopic.has(id)) relationsByTopic.set(id, []);
      relationsByTopic.get(id).push(relation);
    }
  }
  const candidatesByTopic = new Map();
  for (const relation of profiles[profile]['learning-relations.candidate']) {
    for (const id of [relation.prerequisiteTopicId, relation.dependentTopicId]) {
      if (!candidatesByTopic.has(id)) candidatesByTopic.set(id, []);
      candidatesByTopic.get(id).push(relation);
    }
  }
  for (const course of profiles[profile].courses) {
    const standards = standardsByCourse.get(course.id) ?? [];
    const topics = topicsByCourse.get(course.id) ?? [];
    const topicIds = new Set(topics.map((topic) => topic.id));
    const relations = [...new Map([...topicIds].flatMap((id) => relationsByTopic.get(id) ?? []).map((item) => [item.id, item])).values()];
    const candidateRelations = [...new Map([...topicIds].flatMap((id) => candidatesByTopic.get(id) ?? []).map((item) => [item.id, item])).values()]
      .sort((a, b) => a.id.localeCompare(b.id, 'en'));
    const courseRelations = courseRelationsByCourse.get(course.id) ?? [];
    const sourceIds = new Set([
      ...course.sourceRefs,
      ...relations.flatMap((relation) => relation.sourceRefs),
      ...courseRelations.flatMap((relation) => relation.sourceRefs),
    ]);
    const detailFile = `data/courses/${fileFor(course.id)}`;
    const detail = {
      course,
      subjectGroup: groupById.get(course.subjectGroupId),
      domains: profiles[profile].domains.filter((domain) => domain.courseId === course.id),
      standards,
      topics,
      relations: relations.map(describeLearningRelation),
      candidateRelations: candidateRelations.map(describeLearningRelation),
      courseRelations: courseRelations.map(describeCourseRelation),
      sourceDocuments: sourceManifest.sources.filter((source) => sourceIds.has(source.id)),
    };
    await atomicJson(join(root, 'ui', detailFile), detail);
    courseIndex.push({
      id: course.id,
      label: course.labelKorean,
      level: profile,
      category: course.courseCategory,
      programScope: course.programScopes?.[0] ?? 'middle',
      groupId: course.subjectGroupId,
      groupLabel: groupById.get(course.subjectGroupId)?.labelKorean ?? '미분류',
      standardCount: standards.length,
      topicCount: topics.length,
      relationCount: relations.length + courseRelations.length,
      candidateRelationCount: candidateRelations.length,
      verificationStatus: course.verificationStatus,
      reviewStatus: course.reviewStatus,
      detailFile,
    });
  }
}

const transitionIndex = transitions.map((record) => {
  const fromTopics = record.fromTopicIds.map((id) => topicById.get(id)).filter(Boolean);
  const fromCourses = record.fromCourseIds.map((id) => courseById.get(id)).filter(Boolean);
  const toCourses = record.toCourseIds.map((id) => courseById.get(id)).filter(Boolean);
  const toTopics = record.toTopicIds.map((id) => topicById.get(id)).filter(Boolean);
  const fromCourse = fromCourses[0] ?? courseById.get(fromTopics[0]?.courseIds?.[0]);
  return {
    id: record.id,
    kind: record.transitionKind,
    basis: record.basis,
    sourceRefs: record.sourceRefs,
    from: { courseIds: record.fromCourseIds, topicIds: record.fromTopicIds, label: fromTopics[0]?.labelKorean ?? '과정 수준 공식 전이', courseLabel: fromCourse?.labelKorean ?? '', groupLabel: groupById.get(fromCourse?.subjectGroupId)?.labelKorean ?? '' },
    to: { courseIds: record.toCourseIds, topicIds: record.toTopicIds, courseLabels: toCourses.map((course) => course.labelKorean), topicLabel: toTopics[0]?.labelKorean ?? '' },
  };
});

// The elementary bridge layers are their own lazily fetched payload: the official layer is small but
// the R-DOMAIN-CONTINUITY candidate layer is far larger than the middle-high transition list, and the
// map index is fetched on every page load.
const middleDomainById = new Map(profiles.middle.domains.map((domain) => [domain.id, domain]));
const elementaryStandardByTopic = new Map(elementaryInventory.standards.map((standard) => [standard.representativeTopicId, standard]));
const describeElementaryBridge = (record) => {
  const elementary = elementaryStandardByTopic.get(record.prerequisiteTopicId);
  const topic = topicById.get(record.dependentTopicId);
  const domain = middleDomainById.get(topic?.domainId);
  return {
    id: record.id,
    layer: record.layer,
    relationKind: record.relationKind,
    from: {
      topicId: record.prerequisiteTopicId,
      code: elementary?.code ?? '',
      subjectLabel: elementary?.subjectKorean ?? '',
      domainLabel: elementary?.domainKorean ?? '',
      gradeBand: elementary?.gradeBand ?? '',
    },
    to: {
      topicId: record.dependentTopicId,
      courseLabel: courseById.get(topic?.courseIds?.[0])?.labelKorean ?? '',
      domainLabel: domain?.labelKorean ?? '',
      topicLabel: topic?.labelKorean ?? record.dependentTopicId,
    },
    basis: record.basis,
    sourceRefs: record.sourceRefs,
  };
};
const elementaryBridgeIndex = {
  version: inventory.version,
  elementaryReleaseVersion: elementaryInventory.elementaryReleaseVersion,
  counts: { official: elementaryBridges.length, candidate: elementaryCandidateBridges.length },
  layers: [
    { id: 'official', label: '공식 문서 근거', note: '공식 내용 체계표·해설이 직접 뒷받침하는 초→중 선수 관계입니다.' },
    { id: 'pedagogical-candidate', label: '권장(후보)', note: '내용 체계표의 영역 연속에서 저장소가 만든 학습 순서 제안이며, 공식 선수 관계가 아니고 전문가 검토 전 후보입니다.' },
  ],
  // Grouped by the middle endpoint so a truncated render still shows both layers of the same topic.
  records: [...elementaryBridges, ...elementaryCandidateBridges].map(describeElementaryBridge)
    .sort((a, b) => a.to.courseLabel.localeCompare(b.to.courseLabel, 'ko')
      || a.to.domainLabel.localeCompare(b.to.domainLabel, 'ko')
      || a.to.topicLabel.localeCompare(b.to.topicLabel, 'ko')
      || a.layer.localeCompare(b.layer, 'en')
      || a.from.code.localeCompare(b.from.code, 'ko')
      || a.id.localeCompare(b.id, 'en')),
};
await atomicJson(join(uiRoot, 'elementary-bridges.json'), elementaryBridgeIndex);

const levelOrder = { middle: 0, high: 1 };
courseIndex.sort((a, b) => levelOrder[a.level] - levelOrder[b.level] || a.groupLabel.localeCompare(b.groupLabel, 'ko') || a.label.localeCompare(b.label, 'ko'));
const highAcademicCourseIds = new Set(profiles.high.courses.filter((course) => course.programScopes.includes('all-high-schools')).map((course) => course.id));
const highVocationalCourseIds = new Set(profiles.high.courses.filter((course) => course.programScopes.includes('specialized-vocational')).map((course) => course.id));
const index = {
  version: inventory.version,
  generatedFrom: '2022-revised-current-notice-baseline',
  statistics: {
    officialDocuments: sourceManifest.sourceCount,
    middleCourses: inventory.middle.courses,
    middleStandards: inventory.middle.standards,
    middleTopics: inventory.middle.topics,
    middleSourceGroundedTopics: profiles.middle.topics.filter((topic) => topic.contentKind === 'source-grounded-draft').length,
    highSourceGroundedTopics: profiles.high.topics.filter((topic) => topic.contentKind === 'source-grounded-draft').length,
    highCourses: inventory.high.courses,
    highStandards: inventory.high.standards,
    highAcademicCourses: highAcademicCourseIds.size,
    highAcademicDomains: profiles.high.domains.filter((domain) => highAcademicCourseIds.has(domain.courseId)).length,
    highAcademicStandards: profiles.high.standards.filter((standard) => highAcademicCourseIds.has(standard.courseId)).length,
    highVocationalCourses: highVocationalCourseIds.size,
    highVocationalDomains: profiles.high.domains.filter((domain) => highVocationalCourseIds.has(domain.courseId)).length,
    highVocationalStandards: profiles.high.standards.filter((standard) => highVocationalCourseIds.has(standard.courseId)).length,
    middleOfficialRelations: profiles.middle['learning-relations'].length,
    highOfficialRelations: profiles.high['learning-relations'].length,
    middleCandidateRelations: profiles.middle['learning-relations.candidate'].length,
    highCandidateRelations: profiles.high['learning-relations.candidate'].length,
    highOfficialCourseRelations: highExtras['course-relations'].length,
    officialTransitions: transitions.length,
    transitions: inventory.bridges.transitionAlignments,
    elementaryOfficialTransitions: elementaryBridges.length,
    elementaryCandidateTransitions: elementaryCandidateBridges.length,
  },
  elementaryBridgeFile: 'data/elementary-bridges.json',
  comparisonBaselines: inventory.comparisonBaselines,
  subjectGroups: [...groupById.values()].map((group) => ({ id: group.id, label: group.labelKorean, level: group.schoolLevel })).sort((a, b) => a.level.localeCompare(b.level, 'en') || a.label.localeCompare(b.label, 'ko')),
  courses: courseIndex,
  transitions: transitionIndex,
  creditRules: highExtras['credit-rules'],
  pathways: highExtras.pathways.map((pathway) => ({ ...pathway, steps: pathway.steps.map((step) => ({ ...step, courseLabels: step.courseIds.map((id) => courseById.get(id)?.labelKorean).filter(Boolean) })) })),
  sourceSummary: { count: sourceManifest.sourceCount, rightsStatus: 'cleared', officialTextIncluded: false, publishers: [...new Set(sourceManifest.sources.map((source) => source.publisher))] },
  boundaries: [
    '과목은 국가 교육과정 정의이며 특정 학교의 실제 개설을 뜻하지 않습니다.',
    '전이·선수 관계는 공식 문서 근거가 있는 항목만 제공하며, 추천 과목 연계는 공식 이수 제약을 뜻하지 않습니다.',
    '권장 순서(후보)는 성취기준 코드 순서와 주제 분해 순서에서 저장소가 만든 학습 순서 제안이며, 공식 선수 관계가 아니고 전문가 검토 전 후보입니다.',
    '초→중 전이의 권장(후보) 층은 내용 체계표에서 초등 5~6학년군과 중학교가 같은 영역 계열인 교과에만 적용한 순서 제안이며, 공식 선수 관계가 아닙니다.',
    '공식 교육과정 원문은 포함하지 않고 코드·출처 위치와 기계적 초안 요약만 제공합니다.',
    '‘검토 초안’ 배지가 붙은 주제는 성취기준 해설 등 공식 출처를 근거로 새로 쓴 관찰 증거·평가 질문이며, 배지가 없는 주제는 성취기준 요약을 치환한 기계적 템플릿입니다. 둘 다 전문가 검토 전 후보입니다.',
    `초등 ${inventory.comparisonBaselines.elementary.dataRelease}의 기준당 주제 ${inventory.comparisonBaselines.elementary.topicsPerStandard.toFixed(2)}개와 비교해 중학교는 ${inventory.middleTopicDecomposition.topicsPerStandard.average.toFixed(2)}개이며, 모두 전문가 검토 전 후보입니다.`,
    '고등학교 합계는 비직업계 231과목과 직업계 전문교과 528과목을 포함하므로 학교급 수량을 그대로 비교하지 않습니다.',
  ],
};
await atomicJson(join(uiRoot, 'map-index.json'), index);
const artifactPaths = ['ui/index.html', 'ui/styles.css', 'ui/app.js', 'ui/data/map-index.json', 'ui/data/elementary-bridges.json', ...courseIndex.map((course) => `ui/${course.detailFile}`)].sort((a, b) => a.localeCompare(b, 'en'));
const artifacts = [];
for (const path of artifactPaths) {
  const contents = await readFile(join(root, path));
  artifacts.push({ path, bytes: contents.byteLength, sha256: createHash('sha256').update(contents).digest('hex') });
}
await atomicJson(join(distUiRoot, 'manifest.json'), { version: inventory.version, courseDetailCount: courseIndex.length, artifacts });
console.log(`UI data build passed: ${courseIndex.length} courses, ${transitionIndex.length} transitions`);
