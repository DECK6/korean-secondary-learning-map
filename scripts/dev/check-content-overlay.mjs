// Gate for content authors: bun scripts/dev/check-content-overlay.mjs <file> [--profile middle|high]
// Checks one 주제 콘텐츠 오버레이 file before the build merges it — schema, dangling topic ids,
// verbatim official-summary copies, exact duplicates, minimum lengths, entry counts.
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OVERLAY_SCHEMA_ID, analyzeOverlay } from '../lib/content-overlay.mjs';
import { createAjv } from '../validate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
let target = null;
let flagProfile = null;
for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value.startsWith('--profile=')) flagProfile = value.slice('--profile='.length);
  else if (value === '--profile') flagProfile = args[index += 1];
  else if (!value.startsWith('--') && !target) target = value;
}
if (!target) {
  console.error('usage: bun scripts/dev/check-content-overlay.mjs <file> [--profile middle|high]');
  process.exit(2);
}
const path = resolve(target);
const profile = flagProfile ?? path.match(/data\/kr\/(middle|high)\/content\//)?.[1];
if (!['middle', 'high'].includes(profile)) {
  console.error(`cannot tell which profile ${target} belongs to; pass --profile middle|high`);
  process.exit(2);
}

const readRecords = async (name) => JSON.parse(await readFile(join(root, 'data/kr', profile, name), 'utf8')).records;
const overlay = { file: basename(path), slug: basename(path, '.json'), path, document: JSON.parse(await readFile(path, 'utf8')) };
const topicsById = new Map((await readRecords('topics.json')).map((topic) => [topic.id, topic]));
const standardsById = new Map((await readRecords('standards.json')).map((standard) => [standard.id, standard]));
const coursesById = new Map((await readRecords('courses.json')).map((course) => [course.id, course]));
const sourceIds = new Set(JSON.parse(await readFile(join(root, 'data/kr/shared/source-manifest.json'), 'utf8')).sources.map((source) => source.id));

const errors = [];
const ajv = await createAjv(root);
const validate = ajv.getSchema(OVERLAY_SCHEMA_ID);
if (!validate(overlay.document)) {
  for (const error of validate.errors ?? []) errors.push(`schema ${error.instancePath || '/'} ${error.message}`);
}
for (const ref of overlay.document.sourceRefs ?? []) {
  if (!sourceIds.has(ref)) errors.push(`unresolved sourceRef ${ref}`);
}
for (const [topicId, entry] of Object.entries(overlay.document.entries ?? {})) {
  const sourceId = entry.sourceLocator?.sourceId;
  if (sourceId && !sourceIds.has(sourceId)) errors.push(`${topicId}: unresolved sourceLocator.sourceId ${sourceId}`);
}
const { errors: contentErrors, stats } = analyzeOverlay({ label: overlay.file, overlay, topicsById, standardsById, coursesById });
errors.push(...contentErrors);

console.log(`${profile}/content/${overlay.file}: ${stats.entries} entries, ${stats.evidence} evidence, ${stats.assessmentPrompts} prompts, ${stats.misconceptions} misconceptions, ${stats.verbatim} verbatim copies, ${stats.duplicates} exact duplicates`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('content overlay check passed');
