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
  const names = ['subject-groups', 'courses', 'domains', 'standards', 'topics', 'clusters', 'learning-relations'];
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
  for (const course of profiles[profile].courses) {
    const standards = standardsByCourse.get(course.id) ?? [];
    const topics = topicsByCourse.get(course.id) ?? [];
    const topicIds = new Set(topics.map((topic) => topic.id));
    const relations = [...new Map([...topicIds].flatMap((id) => relationsByTopic.get(id) ?? []).map((item) => [item.id, item])).values()];
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
    highOfficialCourseRelations: highExtras['course-relations'].length,
    officialTransitions: transitions.length,
    transitions: inventory.bridges.transitionAlignments,
  },
  comparisonBaselines: inventory.comparisonBaselines,
  subjectGroups: [...groupById.values()].map((group) => ({ id: group.id, label: group.labelKorean, level: group.schoolLevel })).sort((a, b) => a.level.localeCompare(b.level, 'en') || a.label.localeCompare(b.label, 'ko')),
  courses: courseIndex,
  transitions: transitionIndex,
  creditRules: highExtras['credit-rules'],
  pathways: highExtras.pathways.map((pathway) => ({ ...pathway, steps: pathway.steps.map((step) => ({ ...step, courseLabels: step.courseIds.map((id) => courseById.get(id)?.labelKorean).filter(Boolean) })) })),
  sourceSummary: { count: sourceManifest.sourceCount, rightsStatus: 'hold', officialTextIncluded: false, publishers: [...new Set(sourceManifest.sources.map((source) => source.publisher))] },
  boundaries: [
    '과목은 국가 교육과정 정의이며 특정 학교의 실제 개설을 뜻하지 않습니다.',
    '전이·선수 관계는 공식 문서 근거가 있는 항목만 제공하며, 추천 과목 연계는 공식 이수 제약을 뜻하지 않습니다.',
    '공식 교육과정 원문은 포함하지 않고 코드·출처 위치와 기계적 초안 요약만 제공합니다.',
    `초등 ${inventory.comparisonBaselines.elementary.dataRelease}의 기준당 주제 ${inventory.comparisonBaselines.elementary.topicsPerStandard.toFixed(2)}개와 비교해 중학교는 ${inventory.middleTopicDecomposition.topicsPerStandard.average.toFixed(2)}개이며, 모두 전문가 검토 전 후보입니다.`,
    '고등학교 합계는 비직업계 231과목과 직업계 전문교과 528과목을 포함하므로 학교급 수량을 그대로 비교하지 않습니다.',
  ],
};
await atomicJson(join(uiRoot, 'map-index.json'), index);
const artifactPaths = ['ui/index.html', 'ui/styles.css', 'ui/app.js', 'ui/data/map-index.json', ...courseIndex.map((course) => `ui/${course.detailFile}`)].sort((a, b) => a.localeCompare(b, 'en'));
const artifacts = [];
for (const path of artifactPaths) {
  const contents = await readFile(join(root, path));
  artifacts.push({ path, bytes: contents.byteLength, sha256: createHash('sha256').update(contents).digest('hex') });
}
await atomicJson(join(distUiRoot, 'manifest.json'), { version: inventory.version, courseDetailCount: courseIndex.length, artifacts });
console.log(`UI data build passed: ${courseIndex.length} courses, ${transitionIndex.length} transitions`);
