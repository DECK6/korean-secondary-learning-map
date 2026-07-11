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
  for (const name of names) profiles[profile][name] = (await readJson(join(dataRoot, profile, `${name}.json`))).records;
}
const highExtras = {};
for (const name of ['course-relations', 'credit-rules', 'choice-sets', 'pathways']) highExtras[name] = (await readJson(join(dataRoot, 'high', `${name}.json`))).records;
const transitions = (await readJson(join(dataRoot, 'bridges/transition-alignments.json'))).records;
const sourceManifest = await readJson(join(dataRoot, 'shared/source-manifest.json'));
const inventory = await readJson(join(dataRoot, 'inventory-report.json'));

const groupById = new Map();
const courseById = new Map();
const topicById = new Map();
const standardById = new Map();
for (const profile of ['middle', 'high']) {
  for (const group of profiles[profile]['subject-groups']) groupById.set(group.id, group);
  for (const course of profiles[profile].courses) courseById.set(course.id, course);
  for (const topic of profiles[profile].topics) topicById.set(topic.id, topic);
  for (const standard of profiles[profile].standards) standardById.set(standard.id, standard);
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
    const detailFile = `data/courses/${fileFor(course.id)}`;
    const detail = {
      course,
      subjectGroup: groupById.get(course.subjectGroupId),
      domains: profiles[profile].domains.filter((domain) => domain.courseId === course.id),
      standards,
      topics,
      relations,
      sourceDocuments: sourceManifest.sources.filter((source) => course.sourceRefs.includes(source.id)),
    };
    await atomicJson(join(root, 'ui', detailFile), detail);
    courseIndex.push({
      id: course.id,
      label: course.labelKorean,
      level: profile,
      category: course.courseCategory,
      groupId: course.subjectGroupId,
      groupLabel: groupById.get(course.subjectGroupId)?.labelKorean ?? '미분류',
      standardCount: standards.length,
      topicCount: topics.length,
      relationCount: relations.length,
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
    reason: record.reason,
    reviewStatus: record.reviewStatus,
    from: { courseIds: record.fromCourseIds, topicIds: record.fromTopicIds, label: fromTopics[0]?.labelKorean ?? '과정 수준 전이 후보', courseLabel: fromCourse?.labelKorean ?? '', groupLabel: groupById.get(fromCourse?.subjectGroupId)?.labelKorean ?? '' },
    to: { courseIds: record.toCourseIds, topicIds: record.toTopicIds, courseLabels: toCourses.map((course) => course.labelKorean), topicLabel: toTopics[0]?.labelKorean ?? '' },
  };
});

const levelOrder = { middle: 0, high: 1 };
courseIndex.sort((a, b) => levelOrder[a.level] - levelOrder[b.level] || a.groupLabel.localeCompare(b.groupLabel, 'ko') || a.label.localeCompare(b.label, 'ko'));
const index = {
  version: inventory.version,
  generatedFrom: '2022-revised-current-notice-baseline',
  statistics: {
    officialDocuments: sourceManifest.sourceCount,
    middleCourses: inventory.middle.courses,
    middleStandards: inventory.middle.standards,
    highCourses: inventory.high.courses,
    highStandards: inventory.high.standards,
    transitions: inventory.bridges.transitionAlignments,
  },
  subjectGroups: [...groupById.values()].map((group) => ({ id: group.id, label: group.labelKorean, level: group.schoolLevel })).sort((a, b) => a.level.localeCompare(b.level, 'en') || a.label.localeCompare(b.label, 'ko')),
  courses: courseIndex,
  transitions: transitionIndex,
  creditRules: highExtras['credit-rules'],
  pathways: highExtras.pathways.map((pathway) => ({ ...pathway, steps: pathway.steps.map((step) => ({ ...step, courseLabels: step.courseIds.map((id) => courseById.get(id)?.labelKorean).filter(Boolean) })) })),
  sourceSummary: { count: sourceManifest.sourceCount, rightsStatus: 'hold', officialTextIncluded: false, publishers: [...new Set(sourceManifest.sources.map((source) => source.publisher))] },
  boundaries: [
    '과목은 국가 교육과정 정의이며 특정 학교의 실제 개설을 뜻하지 않습니다.',
    '전이·선수·경로는 전문가 검토 전 후보이며 공식 필수 요건이 아닙니다.',
    '공식 교육과정 원문은 포함하지 않고 코드·출처 위치와 기계적 초안 요약만 제공합니다.',
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
