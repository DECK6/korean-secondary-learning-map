import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText } from './lib/content-overlay.mjs';
import { AUTO_CANDIDATE_JACCARD, facetCollapseRuleByCode, jaccard, overlayTokens } from './lib/facet-collapse-rules.mjs';
import { readProfileCollection, readRelease } from './lib/profile-collections.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const contentMetrics = {};
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

// The academic and vocational high-school releases carry the same record contract, so both run the
// same governance checks; only the review record they belong to differs.
const academicHighTopicIds = new Set(
  (await readProfileCollection(root, 'high', 'topics')).map((topic) => topic.id),
);
for (const profile of ['middle', 'high', 'high-vocational']) {
  const release = await readRelease(root, profile);
  const courses = await readProfileCollection(root, profile, 'courses', release);
  const domains = await readProfileCollection(root, profile, 'domains', release);
  const standards = await readProfileCollection(root, profile, 'standards', release);
  const topics = await readProfileCollection(root, profile, 'topics', release);
  const clusters = await readProfileCollection(root, profile, 'clusters', release);
  const learningRelations = await readProfileCollection(root, profile, 'learningRelations', release);
  const reviewRecords = await readProfileCollection(root, profile, 'reviewRecords', release);
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
  // P3-2 지표: 완전 중복 문장, 템플릿 비율(성취기준 요약을 'X'로 치환한 뒤 남는 동일 문자열), 출처 기반 초안 수.
  const summaryById = new Map(standards.map((standard) => [standard.id, normalizeText(standard.summary)]));
  const templateShape = (topic, text) => {
    let shape = normalizeText(text);
    for (const alignment of topic.standardAlignments ?? []) {
      const summary = summaryById.get(alignment.standardId);
      if (summary) shape = shape.split(summary).join('X');
    }
    return shape;
  };
  const metrics = { topics: topics.length, sourceGroundedDraft: 0, mechanicalDerivative: 0, duplicateEvidence: 0, duplicateAssessmentPrompts: 0, templateRatio: 0, misconceptions: 0, collapseCandidates: 0 };
  const seenEvidence = new Map();
  const seenPrompts = new Map();
  const shapes = new Set();
  let shapeTotal = 0;
  for (const topic of topics) {
    if (topic.contentKind === 'source-grounded-draft') metrics.sourceGroundedDraft += 1;
    else metrics.mechanicalDerivative += 1;
    metrics.misconceptions += topic.misconceptions?.length ?? 0;
    for (const [field, seen, counter] of [['evidence', seenEvidence, 'duplicateEvidence'], ['assessmentPrompts', seenPrompts, 'duplicateAssessmentPrompts']]) {
      for (const text of topic[field] ?? []) {
        const normalized = normalizeText(text);
        const previous = seen.get(normalized);
        if (previous) {
          metrics[counter] += 1;
          if (topic.contentKind === 'source-grounded-draft') errors.push(`${topic.id}: source-grounded ${field} duplicates ${previous} exactly`);
        } else seen.set(normalized, topic.id);
        shapes.add(templateShape(topic, text));
        shapeTotal += 1;
      }
    }
  }
  metrics.templateRatio = shapeTotal ? Number(((shapeTotal - shapes.size) / shapeTotal).toFixed(4)) : 0;

  // 계약 8절 자동 판정: 같은 성취기준에 걸린 두 authored 주제의 evidence+prompt 토큰 자카드가
  // 0.6 이상이면 overlapping-facets 축약 후보다. 규칙표에 없는 후보는 경고만 낸다(빌드 실패 아님).
  const standardCodeById = new Map(standards.map((standard) => [standard.id, standard.code]));
  const authoredByStandard = new Map();
  for (const topic of topics) {
    if (topic.contentKind !== 'source-grounded-draft') continue;
    for (const alignment of topic.standardAlignments ?? []) {
      if (!authoredByStandard.has(alignment.standardId)) authoredByStandard.set(alignment.standardId, []);
      authoredByStandard.get(alignment.standardId).push(topic);
    }
  }
  for (const [standardId, siblings] of authoredByStandard) {
    if (siblings.length < 2) continue;
    const tokens = siblings.map((topic) => overlayTokens([...topic.evidence ?? [], ...topic.assessmentPrompts ?? []]));
    for (let left = 0; left < siblings.length; left += 1) {
      for (let right = left + 1; right < siblings.length; right += 1) {
        const similarity = jaccard(tokens[left], tokens[right]);
        if (similarity < AUTO_CANDIDATE_JACCARD) continue;
        metrics.collapseCandidates += 1;
        const code = standardCodeById.get(standardId);
        if (!facetCollapseRuleByCode.has(code)) {
          warnings.push(`${profile}/standards/${code}: ${siblings[left].facetKey}/${siblings[right].facetKey} overlay similarity ${similarity.toFixed(2)} is an unlisted overlapping-facets collapse candidate`);
        }
      }
    }
  }
  contentMetrics[profile] = metrics;

  if (profile === 'middle' && (topics.length < standards.length * 2 || topics.length > standards.length * 5)) errors.push('middle topic decomposition must remain within 2-5 topics per standard');
  if (profile !== 'middle' && topics.length !== standards.length) errors.push(`${profile} topic count must remain one mechanical candidate per standard until a separate decomposition policy exists`);
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
const candidateElementaryTransitions = (await readJson(join(root, 'data/kr/bridges/elementary-transitions.candidate.json'))).records;
for (const transition of candidateElementaryTransitions) {
  if (transition.reviewStatus !== 'candidate' || transition.relationKind !== 'recommended-before' || transition.basisKind === 'official-source' || !transition.sourceRefs.length) errors.push(`${transition.id}: candidate elementary transition boundary missing`);
  if (!/^R-[A-Z-]+ /.test(transition.basis)) errors.push(`${transition.id}: candidate elementary transition basis must name its rule`);
  if (bridgeReviewTargets.has(transition.id)) errors.push(`${transition.id}: candidate elementary transition must not be claimed as reviewed`);
}
const sources = (await readJson(join(root, 'data/kr/shared/source-manifest.json'))).sources;
for (const source of sources) if (source.rightsStatus !== 'cleared') errors.push(`${source.id}: official document rights status must be cleared (public official documents)`);

const uiIndex = await readJson(join(root, 'ui/data/map-index.json'));
const middleRelease = await readRelease(root, 'middle');
const highRelease = await readRelease(root, 'high');
const vocationalRelease = await readRelease(root, 'high-vocational');
const highSchoolCourses = highRelease.counts.courses + vocationalRelease.counts.courses;
const highSchoolStandards = highRelease.counts.standards + vocationalRelease.counts.standards;
const highSourceGroundedTopics = contentMetrics.high.sourceGroundedDraft + contentMetrics['high-vocational'].sourceGroundedDraft;
if (uiIndex.statistics.middleCourses !== middleRelease.counts.courses || uiIndex.statistics.highCourses !== highSchoolCourses) errors.push('UI course statistics are stale');
if (uiIndex.statistics.middleStandards !== middleRelease.counts.standards || uiIndex.statistics.highStandards !== highSchoolStandards) errors.push('UI standard statistics are stale');
if (uiIndex.statistics.middleTopics !== middleRelease.counts.topics) errors.push('UI middle topic statistics are stale');
if (uiIndex.statistics.middleSourceGroundedTopics !== contentMetrics.middle.sourceGroundedDraft || uiIndex.statistics.highSourceGroundedTopics !== highSourceGroundedTopics) errors.push('UI source-grounded topic statistics are stale');
if (uiIndex.statistics.highAcademicStandards !== highRelease.counts.standards || uiIndex.statistics.highVocationalStandards !== vocationalRelease.counts.standards) errors.push('UI high-school scope split is stale');
if (uiIndex.statistics.highAcademicCourses !== highRelease.counts.courses || uiIndex.statistics.highVocationalCourses !== vocationalRelease.counts.courses) errors.push('UI high-school course scope split is stale');
if (uiIndex.statistics.highAcademicStandards + uiIndex.statistics.highVocationalStandards !== uiIndex.statistics.highStandards) errors.push('UI high-school scope split does not add up to the aggregate');
if (!uiIndex.courses.some((course) => course.detailFile.startsWith('data/high-vocational/'))) errors.push('UI vocational course details are not lazily separated');
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
for (const warning of warnings.slice(0, 100)) console.warn(`warning: ${warning}`);
console.log(`content/governance check passed: ${sources.length} sources, ${pathways.length} illustrative pathways, ${transitions.length} reviewed transitions, ${warnings.length} collapse warnings`);
for (const [profile, metrics] of Object.entries(contentMetrics)) {
  console.log(`${profile} content: ${metrics.sourceGroundedDraft} source-grounded-draft / ${metrics.topics} topics, duplicates evidence ${metrics.duplicateEvidence} prompt ${metrics.duplicateAssessmentPrompts}, template ratio ${(metrics.templateRatio * 100).toFixed(1)}%, misconceptions ${metrics.misconceptions}, collapse candidates ${metrics.collapseCandidates}`);
}
