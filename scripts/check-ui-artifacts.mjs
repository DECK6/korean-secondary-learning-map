import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));
const [manifest, index, middleRelations, highRelations, vocationalRelations, middleCandidates, highCandidates, highCourseRelations, transitions, elementaryBridges, elementaryCandidateBridges, elementaryBridgeIndex] = await Promise.all([
  readJson('dist/ui/manifest.json'),
  readJson('ui/data/map-index.json'),
  readJson('data/kr/middle/learning-relations.json'),
  readJson('data/kr/high/learning-relations.json'),
  readJson('data/kr/high-vocational/learning-relations.json'),
  readJson('data/kr/middle/learning-relations.candidate.json'),
  readJson('data/kr/high/learning-relations.candidate.json'),
  readJson('data/kr/high/course-relations.json'),
  readJson('data/kr/bridges/transition-alignments.json'),
  readJson('data/kr/bridges/elementary-transitions.json'),
  readJson('data/kr/bridges/elementary-transitions.candidate.json'),
  readJson('ui/data/elementary-bridges.json'),
]);
const errors = [];
const expectedStatistics = {
  middleOfficialRelations: middleRelations.recordCount,
  highOfficialRelations: highRelations.recordCount,
  highVocationalOfficialRelations: vocationalRelations.recordCount,
  highOfficialCourseRelations: highCourseRelations.recordCount,
  officialTransitions: transitions.recordCount,
  middleCandidateRelations: middleCandidates.recordCount,
  highCandidateRelations: highCandidates.recordCount,
  elementaryOfficialTransitions: elementaryBridges.recordCount,
  elementaryCandidateTransitions: elementaryCandidateBridges.recordCount,
};
for (const [name, expected] of Object.entries(expectedStatistics)) {
  if (index.statistics[name] !== expected) errors.push(`ui/data/map-index.json: statistics.${name} expected ${expected}, received ${index.statistics[name]}`);
}
if (index.transitions.length !== transitions.recordCount) errors.push('ui/data/map-index.json: official transition count mismatch');
if (index.transitions.some((item) => !item.basis || !item.sourceRefs.length)) errors.push('ui/data/map-index.json: transition basis or source missing');
if (index.elementaryBridgeFile !== 'data/elementary-bridges.json') errors.push('ui/data/map-index.json: elementary bridge payload is not linked');
if (elementaryBridgeIndex.counts.official !== elementaryBridges.recordCount || elementaryBridgeIndex.counts.candidate !== elementaryCandidateBridges.recordCount) {
  errors.push('ui/data/elementary-bridges.json: layer counts are stale');
}
if (elementaryBridgeIndex.records.length !== elementaryBridges.recordCount + elementaryCandidateBridges.recordCount) {
  errors.push('ui/data/elementary-bridges.json: record count mismatch');
}
if (elementaryBridgeIndex.records.some((item) => !['official', 'pedagogical-candidate'].includes(item.layer) || !item.basis || !item.sourceRefs.length || !item.from.code || !item.to.courseLabel)) {
  errors.push('ui/data/elementary-bridges.json: layer boundary, basis, source or endpoint label missing');
}
if (elementaryBridgeIndex.records.some((item) => (item.layer === 'official') !== (item.relationKind === 'required-prerequisite'))) {
  errors.push('ui/data/elementary-bridges.json: relation kind does not match its layer');
}
const courseByDetail = new Map(index.courses.map((course) => [`ui/${course.detailFile}`, course]));
for (const artifact of manifest.artifacts) {
  try {
    const contents = await readFile(join(root, artifact.path));
    const digest = createHash('sha256').update(contents).digest('hex');
    if (contents.byteLength !== artifact.bytes || digest !== artifact.sha256) errors.push(`${artifact.path}: stale hash or size`);
    if (courseByDetail.has(artifact.path)) {
      const detail = JSON.parse(contents);
      const relations = [...detail.relations, ...detail.courseRelations];
      if (relations.length !== courseByDetail.get(artifact.path).relationCount) errors.push(`${artifact.path}: official relation count mismatch`);
      if (relations.some((relation) => relation.basisKind !== 'official-source' || !relation.basis || !relation.sourceRefs.length)) errors.push(`${artifact.path}: non-official or unsourced relation`);
      const candidates = detail.candidateRelations ?? [];
      if (candidates.length !== courseByDetail.get(artifact.path).candidateRelationCount) errors.push(`${artifact.path}: candidate relation count mismatch`);
      if (candidates.some((relation) => relation.layer !== 'pedagogical-candidate' || relation.relationKind !== 'recommended-before')) errors.push(`${artifact.path}: candidate layer boundary missing`);
    }
  } catch (error) {
    errors.push(`${artifact.path}: ${error.message}`);
  }
}
// Middle and academic high details share ui/data/courses; the vocational release keeps its own
// lazily fetched directory so the first-screen payload does not grow.
const detailDirectories = ['ui/data/courses', 'ui/data/high-vocational'];
const detailArtifacts = manifest.artifacts.filter((item) => detailDirectories.some((directory) => item.path.startsWith(`${directory}/`)));
if (manifest.courseDetailCount !== detailArtifacts.length) errors.push('courseDetailCount mismatch');
const expectedDetails = new Set(detailArtifacts.map((item) => item.path));
for (const directory of detailDirectories) {
  for (const file of await readdir(join(root, directory))) {
    if (file.endsWith('.json') && !expectedDetails.has(`${directory}/${file}`)) errors.push(`${directory}/${file}: untracked stale course detail`);
  }
}
if (!manifest.artifacts.some((item) => item.path.startsWith('ui/data/high-vocational/'))) errors.push('vocational course details are not published to their own lazy directory');
const app = await readFile(join(root, 'ui/app.js'), 'utf8');
if (!app.includes('공식 문서가 명시한 선수학습 관계 없음')) errors.push('ui/app.js: sparse relation state message missing');
if (!app.includes('권장 순서(후보)')) errors.push('ui/app.js: candidate layer section missing');
if (!app.includes('권장(후보)')) errors.push('ui/app.js: elementary bridge candidate layer badge missing');
if (!app.includes('검토 초안')) errors.push('ui/app.js: source-grounded content badge missing');
if (!app.includes('축약 주제')) errors.push('ui/app.js: collapsed auxiliary topic section missing');
if (app.includes('관계 후보')) errors.push('ui/app.js: candidate relation label remains');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`UI artifact check passed: ${manifest.courseDetailCount} course details, ${middleRelations.recordCount + highRelations.recordCount + vocationalRelations.recordCount + highCourseRelations.recordCount + transitions.recordCount} official relations, ${manifest.artifacts.length} files`);
