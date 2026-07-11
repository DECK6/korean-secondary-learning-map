import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'dist/ui/manifest.json'), 'utf8'));
const errors = [];
for (const artifact of manifest.artifacts) {
  try {
    const contents = await readFile(join(root, artifact.path));
    const digest = createHash('sha256').update(contents).digest('hex');
    if (contents.byteLength !== artifact.bytes || digest !== artifact.sha256) errors.push(`${artifact.path}: stale hash or size`);
  } catch (error) {
    errors.push(`${artifact.path}: ${error.message}`);
  }
}
if (manifest.courseDetailCount !== manifest.artifacts.filter((item) => item.path.startsWith('ui/data/courses/')).length) errors.push('courseDetailCount mismatch');
const expectedDetails = new Set(manifest.artifacts.filter((item) => item.path.startsWith('ui/data/courses/')).map((item) => item.path.slice('ui/data/courses/'.length)));
for (const file of await readdir(join(root, 'ui/data/courses'))) {
  if (file.endsWith('.json') && !expectedDetails.has(file)) errors.push(`ui/data/courses/${file}: untracked stale course detail`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`UI artifact check passed: ${manifest.courseDetailCount} course details, ${manifest.artifacts.length} files`);
