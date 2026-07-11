import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

for (const profile of ['middle', 'high']) {
  const courses = (await readJson(join(root, 'data/kr', profile, 'courses.json'))).records;
  const domains = (await readJson(join(root, 'data/kr', profile, 'domains.json'))).records;
  const standards = (await readJson(join(root, 'data/kr', profile, 'standards.json'))).records;
  const topics = (await readJson(join(root, 'data/kr', profile, 'topics.json'))).records;
  const clusters = (await readJson(join(root, 'data/kr', profile, 'clusters.json'))).records;
  const learningRelations = (await readJson(join(root, 'data/kr', profile, 'learning-relations.json'))).records;
  const courseIds = new Set(courses.map((course) => course.id));
  const domainIds = new Set(domains.map((domain) => domain.id));
  const courseIdentityKeys = new Set();
  for (const course of courses) {
    if (!course.labelKorean?.trim() || course.labelKorean.length > 80 || /(?:있으며|하며|한다)[.!]?$/.test(course.labelKorean)) errors.push(`${profile} suspicious course label: ${course.labelKorean}`);
    if (course.sourceTextIncluded !== false) errors.push(`${course.id}: sourceTextIncluded must be false`);
    if (course.reviewStatus !== 'candidate') errors.push(`${course.id}: generated course must remain candidate without a review record`);
    const identityKey = `${course.subjectGroupId}|${course.courseCategory}|${course.labelKorean}`;
    if (courseIdentityKeys.has(identityKey)) errors.push(`${course.id}: duplicate course identity ${identityKey}`);
    courseIdentityKeys.add(identityKey);
  }
  for (const domain of domains) {
    if (!courseIds.has(domain.courseId)) errors.push(`${domain.id}: missing course`);
    if (domain.reviewStatus !== 'candidate') errors.push(`${domain.id}: generated domain must remain candidate`);
  }
  for (const standard of standards) {
    if (!courseIds.has(standard.courseId)) errors.push(`${standard.id}: missing course`);
    if (!domainIds.has(standard.domainId)) errors.push(`${standard.id}: missing domain`);
    if (/두 자리 수로 제시|교과목의 2개 글자를 제시/.test(standard.summary)) errors.push(`${standard.id}: code legend extracted as standard`);
    if (/[가-힣]수행하기/.test(standard.summary)) errors.push(`${standard.id}: malformed summary ending`);
    if (standard.summaryKind !== 'mechanical-derivative') errors.push(`${standard.id}: summary provenance boundary missing`);
    if (standard.officialTextIncluded !== false || standard.sourceTextIncluded !== false) errors.push(`${standard.id}: official source text boundary missing`);
  }
  for (const topic of topics) {
    if (!domainIds.has(topic.domainId)) errors.push(`${topic.id}: missing domain`);
    if (!topic.evidence?.length || !topic.assessmentPrompts?.length) errors.push(`${topic.id}: evidence or assessment prompt missing`);
    if (topic.reviewStatus !== 'candidate') errors.push(`${topic.id}: generated topic must remain candidate`);
  }
  for (const cluster of clusters) {
    if (!domainIds.has(cluster.domainId)) errors.push(`${cluster.id}: missing domain`);
  }
  for (const relation of learningRelations) {
    if (relation.basis === 'official-code-order-candidate-v1' || relation.reviewStatus === 'candidate') errors.push(`${relation.id}: unreviewed automatic prerequisite relation is prohibited`);
  }
}

const pathways = (await readJson(join(root, 'data/kr/high/pathways.json'))).records;
for (const pathway of pathways) if (pathway.notOfficialRequirement !== true || pathway.pathwayKind !== 'illustrative') errors.push(`${pathway.id}: official-requirement boundary missing`);
const courseRelations = (await readJson(join(root, 'data/kr/high/course-relations.json'))).records;
for (const relation of courseRelations) if (relation.claimStatus !== 'candidate' || relation.reviewStatus !== 'candidate' || relation.basisKind !== 'repository-authored' || !relation.basis) errors.push(`${relation.id}: course relation provenance boundary missing`);
const transitions = (await readJson(join(root, 'data/kr/bridges/transition-alignments.json'))).records;
for (const transition of transitions) {
  if (transition.reviewStatus !== 'candidate' || transition.basisKind !== 'repository-authored') errors.push(`${transition.id}: transition claim status is unsafe`);
  if (!transition.fromCourseIds?.length || transition.fromTopicIds?.length || transition.toTopicIds?.length) errors.push(`${transition.id}: candidate transition must remain course-level until topic review`);
}
const sources = (await readJson(join(root, 'data/kr/shared/source-manifest.json'))).sources;
for (const source of sources) if (source.rightsStatus !== 'needs-document-level-review') errors.push(`${source.id}: official document rights review was bypassed`);

const uiIndex = await readJson(join(root, 'ui/data/map-index.json'));
const middleRelease = await readJson(join(root, 'data/kr/middle/release.json'));
const highRelease = await readJson(join(root, 'data/kr/high/release.json'));
if (uiIndex.statistics.middleCourses !== middleRelease.counts.courses || uiIndex.statistics.highCourses !== highRelease.counts.courses) errors.push('UI course statistics are stale');
if (uiIndex.statistics.middleStandards !== middleRelease.counts.standards || uiIndex.statistics.highStandards !== highRelease.counts.standards) errors.push('UI standard statistics are stale');
if (uiIndex.sourceSummary.rightsStatus !== 'hold' || uiIndex.sourceSummary.officialTextIncluded !== false) errors.push('UI rights boundary is stale');
const html = await readFile(join(root, 'ui/index.html'), 'utf8');
const css = await readFile(join(root, 'ui/styles.css'), 'utf8');
if (/https?:\/\//.test(html) || /@import\s+url\(['"]?https?:\/\//.test(css)) errors.push('UI has an external runtime dependency');

async function sourceFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'data', 'sources'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await sourceFiles(path));
    else if (['.js', '.mjs', '.json', '.md', '.yml', '.yaml', '.ttl', '.rq', '.html', '.css'].includes(extname(entry.name))) output.push(path);
  }
  return output;
}
const secretPatterns = [/\bsk-[A-Za-z0-9_-]{20,}\b/, /\bghp_[A-Za-z0-9]{20,}\b/, /AKIA[0-9A-Z]{16}/, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/];
for (const path of await sourceFiles(root)) {
  const text = await readFile(path, 'utf8');
  for (const pattern of secretPatterns) if (pattern.test(text)) errors.push(`${path}: possible secret ${pattern}`);
}

if (errors.length) { console.error(errors.slice(0, 100).join('\n')); process.exit(1); }
console.log(`content/governance check passed: ${sources.length} sources, ${pathways.length} illustrative pathways, ${transitions.length} candidate transitions`);
