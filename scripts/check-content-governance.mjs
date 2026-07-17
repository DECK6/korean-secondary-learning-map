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
  const reviewRecords = (await readJson(join(root, 'data/kr', profile, 'review-records.json'))).records;
  const reviewedTargetIds = new Set(reviewRecords.flatMap((review) => review.targetIds));
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
    if (profile === 'middle') {
      if (!['standard-core', 'subject-facet'].includes(topic.decompositionKind) || !topic.facetKey) errors.push(`${topic.id}: middle topic decomposition provenance missing`);
      if (topic.decompositionKind === 'standard-core' && topic.facetKey !== 'core') errors.push(`${topic.id}: stable core topic facet mismatch`);
      if (topic.decompositionKind === 'subject-facet' && !topic.standardAlignments.some((alignment) => alignment.basis === 'middle-subject-facet-decomposition-v1')) errors.push(`${topic.id}: subject facet basis missing`);
    }
  }
  if (profile === 'middle' && (topics.length < standards.length * 2 || topics.length > standards.length * 5)) errors.push('middle topic decomposition must remain within 2-5 topics per standard');
  if (profile === 'high' && topics.length !== standards.length) errors.push('high topic count must remain one mechanical candidate per standard until a separate decomposition policy exists');
  for (const cluster of clusters) {
    if (!domainIds.has(cluster.domainId)) errors.push(`${cluster.id}: missing domain`);
  }
  for (const relation of learningRelations) {
    if (relation.basis === 'official-code-order-candidate-v1' || relation.reviewStatus === 'candidate') errors.push(`${relation.id}: unreviewed automatic prerequisite relation is prohibited`);
    if (!reviewedTargetIds.has(relation.id)) errors.push(`${relation.id}: reviewed learning relation has no review record`);
    if (relation.basisKind !== 'official-source' || !relation.sourceRefs.length) errors.push(`${relation.id}: learning relation lacks official-source provenance`);
    if (relation.relationKind === 'required-prerequisite' && (relation.basisKind !== 'official-source' || relation.strength !== 'required')) errors.push(`${relation.id}: required relation lacks official-source provenance`);
    if (relation.relationKind === 'recommended-before' && relation.strength !== 'recommended') errors.push(`${relation.id}: recommendation strength mismatch`);
  }
}

const pathways = (await readJson(join(root, 'data/kr/high/pathways.json'))).records;
for (const pathway of pathways) if (pathway.notOfficialRequirement !== true || pathway.pathwayKind !== 'illustrative') errors.push(`${pathway.id}: official-requirement boundary missing`);
const courseRelations = (await readJson(join(root, 'data/kr/high/course-relations.json'))).records;
const highReviewTargets = new Set((await readJson(join(root, 'data/kr/high/review-records.json'))).records.flatMap((review) => review.targetIds));
for (const relation of courseRelations) {
  if (relation.claimStatus !== 'reviewed-recommendation' || relation.reviewStatus !== 'internal-reviewed' || relation.basisKind !== 'official-source' || !relation.basis || !relation.sourceRefs.length) errors.push(`${relation.id}: reviewed course relation provenance boundary missing`);
  if (!highReviewTargets.has(relation.id)) errors.push(`${relation.id}: reviewed course relation has no review record`);
}
const transitions = (await readJson(join(root, 'data/kr/bridges/transition-alignments.json'))).records;
const elementaryTransitions = (await readJson(join(root, 'data/kr/bridges/elementary-transitions.json'))).records;
const bridgeReviewTargets = new Set((await readJson(join(root, 'data/kr/bridges/review-records.json'))).records.flatMap((review) => review.targetIds));
for (const transition of transitions) {
  if (transition.reviewStatus !== 'internal-reviewed' || !bridgeReviewTargets.has(transition.id)) errors.push(`${transition.id}: transition review record is missing`);
  if (!transition.fromCourseIds?.length || !transition.toCourseIds?.length) errors.push(`${transition.id}: transition course anchors are missing`);
  if (transition.fromTopicIds.length !== 1 || transition.toTopicIds.length !== 1 || transition.basisKind !== 'official-source' || !transition.sourceRefs.length) errors.push(`${transition.id}: transition lacks topic-level official-source provenance`);
}
for (const transition of elementaryTransitions) {
  if (transition.reviewStatus !== 'internal-reviewed' || transition.relationKind !== 'required-prerequisite' || transition.basisKind !== 'official-source' || !transition.sourceRefs.length) errors.push(`${transition.id}: elementary transition provenance boundary missing`);
  if (!bridgeReviewTargets.has(transition.id)) errors.push(`${transition.id}: elementary transition has no review record`);
}
const sources = (await readJson(join(root, 'data/kr/shared/source-manifest.json'))).sources;
for (const source of sources) if (source.rightsStatus !== 'cleared') errors.push(`${source.id}: official document rights status must be cleared (public official documents)`);

const uiIndex = await readJson(join(root, 'ui/data/map-index.json'));
const middleRelease = await readJson(join(root, 'data/kr/middle/release.json'));
const highRelease = await readJson(join(root, 'data/kr/high/release.json'));
if (uiIndex.statistics.middleCourses !== middleRelease.counts.courses || uiIndex.statistics.highCourses !== highRelease.counts.courses) errors.push('UI course statistics are stale');
if (uiIndex.statistics.middleStandards !== middleRelease.counts.standards || uiIndex.statistics.highStandards !== highRelease.counts.standards) errors.push('UI standard statistics are stale');
if (uiIndex.statistics.middleTopics !== middleRelease.counts.topics) errors.push('UI middle topic statistics are stale');
if (uiIndex.statistics.highAcademicStandards + uiIndex.statistics.highVocationalStandards !== highRelease.counts.standards) errors.push('UI high-school scope split is stale');
if (uiIndex.statistics.highAcademicCourses + uiIndex.statistics.highVocationalCourses !== highRelease.counts.courses) errors.push('UI high-school course scope split is stale');
if (uiIndex.sourceSummary.rightsStatus !== 'cleared' || uiIndex.sourceSummary.officialTextIncluded !== false) errors.push('UI rights boundary is stale');
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
console.log(`content/governance check passed: ${sources.length} sources, ${pathways.length} illustrative pathways, ${transitions.length} reviewed transitions`);
