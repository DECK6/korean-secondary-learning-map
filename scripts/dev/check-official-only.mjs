// Gate: after the official-only refactor, verify that
// (1) every remaining relation record is backed by an official source,
// (2) no repository-authored relation records or exploratory files remain,
// (3) every official-source relation ID that existed at git HEAD is preserved.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const relationFiles = [
  'data/kr/middle/learning-relations.json',
  'data/kr/high/learning-relations.json',
  'data/kr/high/course-relations.json',
  'data/kr/bridges/transition-alignments.json',
  'data/kr/bridges/elementary-transitions.json',
];
const forbiddenFiles = [
  'data/kr/middle/learning-relations-exploratory.json',
  'data/kr/high/learning-relations-exploratory.json',
  'data/kr/bridges/transition-alignments-exploratory.json',
];

const errors = [];
const records = (text) => JSON.parse(text).records;

for (const f of forbiddenFiles) {
  if (existsSync(f)) errors.push(`forbidden file exists: ${f} (AI-authored records must be deleted, not moved)`);
}

for (const file of relationFiles) {
  let current;
  try {
    current = records(readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`${file}: cannot load: ${e.message}`);
    continue;
  }
  for (const r of current) {
    if (r.basisKind !== 'official-source') {
      errors.push(`${file}: non-official record remains: ${r.id} (basisKind=${r.basisKind})`);
      break;
    }
  }
  let head = [];
  try {
    head = records(execFileSync('git', ['show', `HEAD:${file}`], { maxBuffer: 1 << 28, encoding: 'utf8' }));
  } catch {
    // file may be new relative to HEAD; nothing to preserve
  }
  const currentIds = new Set(current.map((r) => r.id));
  for (const r of head) {
    if (r.basisKind === 'official-source' && !currentIds.has(r.id)) {
      errors.push(`${file}: official record lost: ${r.id}`);
      break;
    }
  }
  console.log(`${file}: official=${current.length} (HEAD official=${head.filter((r) => r.basisKind === 'official-source').length}, HEAD total=${head.length})`);
}

if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  process.exit(1);
}
console.log('OK: only official-source relations remain and none were lost');
