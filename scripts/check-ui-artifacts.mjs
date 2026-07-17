import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));
const [manifest, index, middleRelations, highRelations, highCourseRelations, transitions] = await Promise.all([
  readJson('dist/ui/manifest.json'),
  readJson('ui/data/map-index.json'),
  readJson('data/kr/middle/learning-relations.json'),
  readJson('data/kr/high/learning-relations.json'),
  readJson('data/kr/high/course-relations.json'),
  readJson('data/kr/bridges/transition-alignments.json'),
]);
const errors = [];
const expectedStatistics = {
  middleOfficialRelations: middleRelations.recordCount,
  highOfficialRelations: highRelations.recordCount,
  highOfficialCourseRelations: highCourseRelations.recordCount,
  officialTransitions: transitions.recordCount,
};
for (const [name, expected] of Object.entries(expectedStatistics)) {
  if (index.statistics[name] !== expected) errors.push(`ui/data/map-index.json: statistics.${name} expected ${expected}, received ${index.statistics[name]}`);
}
if (index.transitions.length !== transitions.recordCount) errors.push('ui/data/map-index.json: official transition count mismatch');
if (index.transitions.some((item) => !item.basis || !item.sourceRefs.length)) errors.push('ui/data/map-index.json: transition basis or source missing');
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
    }
  } catch (error) {
    errors.push(`${artifact.path}: ${error.message}`);
  }
}
if (manifest.courseDetailCount !== manifest.artifacts.filter((item) => item.path.startsWith('ui/data/courses/')).length) errors.push('courseDetailCount mismatch');
const expectedDetails = new Set(manifest.artifacts.filter((item) => item.path.startsWith('ui/data/courses/')).map((item) => item.path.slice('ui/data/courses/'.length)));
for (const file of await readdir(join(root, 'ui/data/courses'))) {
  if (file.endsWith('.json') && !expectedDetails.has(file)) errors.push(`ui/data/courses/${file}: untracked stale course detail`);
}
const app = await readFile(join(root, 'ui/app.js'), 'utf8');
if (!app.includes('공식 문서가 명시한 선수학습 관계 없음')) errors.push('ui/app.js: sparse relation state message missing');
if (app.includes('관계 후보')) errors.push('ui/app.js: candidate relation label remains');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`UI artifact check passed: ${manifest.courseDetailCount} course details, ${middleRelations.recordCount + highRelations.recordCount + highCourseRelations.recordCount + transitions.recordCount} official relations, ${manifest.artifacts.length} files`);
