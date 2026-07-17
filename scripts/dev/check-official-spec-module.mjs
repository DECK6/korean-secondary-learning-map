// Gate: validate one official-relation spec module produced by a mining worker.
// Usage: bun scripts/dev/check-official-spec-module.mjs scripts/lib/official-relation-specs/<subject>.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const modulePath = process.argv[2];
if (!modulePath) {
  console.error('usage: check-official-spec-module.mjs <module-path>');
  process.exit(2);
}

const errors = [];
const warn = [];

const raw = readFileSync(modulePath, 'utf8');
if (/\b(import|require|function|=>)\b/.test(raw)) {
  errors.push('module must be pure data: no import/require/function/arrow allowed');
}
if (/["'“][^"'”]{60,}["'”]/.test(raw)) {
  warn.push('a string longer than 60 chars found: check it is not a verbatim official quotation');
}

const spec = (await import(resolve(modulePath))).default;
if (!spec || typeof spec !== 'object') {
  console.error('FAIL: missing default export object');
  process.exit(1);
}

const loadJson = (p) => JSON.parse(readFileSync(resolve(p), 'utf8'));
const middleStandards = loadJson('data/kr/middle/standards.json').records;
const middleCourses = loadJson('data/kr/middle/courses.json').records;
const highStandards = loadJson('data/kr/high/standards.json').records;
const inventory = new Set(loadJson('data/kr/bridges/elementary-topic-inventory.json').topicIds);
const catalog = loadJson('sources/official/source-catalog.json');
const catalogIds = new Set(
  (Array.isArray(catalog) ? catalog : catalog.sources ?? catalog.records ?? []).map((s) => s.id),
);

const strip = (code) => String(code).replace(/^\[|\]$/g, '');
const courseIdsByLabel = new Map(middleCourses.map((c) => [c.labelKorean, c.id]));
const highCodes = new Set(highStandards.map((s) => strip(s.code)));

const level = spec.level === 'high' ? 'high' : 'middle';
const requiredFields = level === 'high' ? ['subject', 'annexId'] : ['subject', 'annexId', 'courseLabels'];
for (const field of requiredFields) {
  if (!spec[field] || (Array.isArray(spec[field]) && spec[field].length === 0)) {
    errors.push(`missing or empty field: ${field}`);
  }
}
if (spec.annexId && !catalogIds.has(spec.annexId)) errors.push(`unknown annexId: ${spec.annexId}`);
const declaredCourseIds = new Set();
if (level === 'middle') {
  for (const label of spec.courseLabels ?? []) {
    const id = courseIdsByLabel.get(label);
    if (!id) errors.push(`unknown middle course label: ${label}`);
    else declaredCourseIds.add(id);
  }
}
const declaredCodes = new Set(
  level === 'middle'
    ? middleStandards.filter((s) => declaredCourseIds.has(s.courseId)).map((s) => strip(s.code))
    : middleStandards.map((s) => strip(s.code)),
);
// high codes that belong to this module's annex (used to anchor high-level edges)
const annexHighCodes = new Set(
  highStandards.filter((s) => (s.sourceRefs ?? []).includes(spec.annexId)).map((s) => strip(s.code)),
);

const isPage = (p) => Number.isInteger(p) && p > 0 && p < 1500;
const checkText = (s, max, ctx) => {
  if (typeof s !== 'string' || s.length === 0) errors.push(`${ctx}: empty text`);
  else if (s.length > max) errors.push(`${ctx}: text longer than ${max} chars (no verbatim quotes)`);
};

const shapes = {
  middleRequired: 4,
  middleCommentaryRequired: 4,
  elementaryToMiddleRequired: 5,
  middleToHighRequired: 4,
};
// optional array: elementary→middle edges backed by commentary instead of the content-system table
if (spec.elementaryCommentaryRequired == null) spec.elementaryCommentaryRequired = [];
shapes.elementaryCommentaryRequired = 4;
// optional arrays (contract v2): high-school internal edges
if (spec.highRequired == null) spec.highRequired = [];
if (spec.highCommentaryRequired == null) spec.highCommentaryRequired = [];
shapes.highRequired = 4;
shapes.highCommentaryRequired = 4;
if (level === 'high') {
  for (const f of ['middleRequired', 'middleCommentaryRequired', 'elementaryToMiddleRequired', 'elementaryCommentaryRequired']) {
    if (Array.isArray(spec[f]) && spec[f].length > 0) {
      errors.push(`level=high module must keep ${f} empty`);
    }
    spec[f] = spec[f] ?? [];
  }
}
const middleEdges = [];
const seenPairs = new Set();

for (const [field, len] of Object.entries(shapes)) {
  const rows = spec[field];
  if (!Array.isArray(rows)) {
    errors.push(`missing array: ${field}`);
    continue;
  }
  if (rows.length === 0) warn.push(`${field} is empty (acceptable if no official evidence exists)`);
  rows.forEach((row, i) => {
    const ctx = `${field}[${i}]`;
    if (!Array.isArray(row) || row.length !== len) {
      errors.push(`${ctx}: expected ${len} entries`);
      return;
    }
    if (field === 'highRequired' || field === 'highCommentaryRequired') {
      const [a, b] = [strip(row[0]), strip(row[1])];
      const page = field === 'highRequired' ? row[3] : row[2];
      if (!highCodes.has(a)) errors.push(`${ctx}: unknown high code ${a}`);
      if (!highCodes.has(b)) errors.push(`${ctx}: unknown high code ${b}`);
      if (!annexHighCodes.has(a) && !annexHighCodes.has(b)) {
        errors.push(`${ctx}: neither endpoint belongs to annex ${spec.annexId}`);
      }
      if (a === b) errors.push(`${ctx}: self-loop`);
      if (!isPage(page)) errors.push(`${ctx}: bad page ${page}`);
      checkText(field === 'highRequired' ? row[2] : row[3], 80, ctx);
      const key = `${a}->${b}`;
      if (seenPairs.has(key)) errors.push(`${ctx}: duplicate pair ${key}`);
      seenPairs.add(key);
      middleEdges.push([a, b]); // shares the cycle check graph
    } else if (field === 'middleRequired' || field === 'middleCommentaryRequired') {
      const [a, b] = [strip(row[0]), strip(row[1])];
      const page = field === 'middleRequired' ? row[3] : row[2];
      if (!declaredCodes.has(a)) errors.push(`${ctx}: unknown/foreign middle code ${a}`);
      if (!declaredCodes.has(b)) errors.push(`${ctx}: unknown/foreign middle code ${b}`);
      if (a === b) errors.push(`${ctx}: self-loop`);
      if (!isPage(page)) errors.push(`${ctx}: bad page ${page}`);
      checkText(field === 'middleRequired' ? row[2] : row[3], 80, ctx);
      const key = `${a}->${b}`;
      if (seenPairs.has(key)) errors.push(`${ctx}: duplicate pair ${key}`);
      seenPairs.add(key);
      middleEdges.push([a, b]);
    } else if (field === 'elementaryToMiddleRequired') {
      const [elemId, mid, domain, page, label] = row;
      if (!inventory.has(elemId)) errors.push(`${ctx}: elementary topicId not in pinned inventory: ${elemId}`);
      if (!declaredCodes.has(strip(mid))) errors.push(`${ctx}: unknown/foreign middle code ${mid}`);
      if (!isPage(page)) errors.push(`${ctx}: bad page ${page}`);
      checkText(domain, 40, ctx);
      checkText(label, 80, ctx);
    } else if (field === 'elementaryCommentaryRequired') {
      const [elemId, mid, page, label] = row;
      if (!inventory.has(elemId)) errors.push(`${ctx}: elementary topicId not in pinned inventory: ${elemId}`);
      if (!declaredCodes.has(strip(mid))) errors.push(`${ctx}: unknown/foreign middle code ${mid}`);
      if (!isPage(page)) errors.push(`${ctx}: bad page ${page}`);
      checkText(label, 80, ctx);
    } else {
      const [mid, high, page, note] = row;
      if (!declaredCodes.has(strip(mid))) errors.push(`${ctx}: unknown/foreign middle code ${mid}`);
      if (!highCodes.has(strip(high))) errors.push(`${ctx}: unknown high code ${high}`);
      if (!isPage(page)) errors.push(`${ctx}: bad page ${page}`);
      checkText(note, 80, ctx);
    }
  });
}

// cycle check over this module's middle edges
const adj = new Map();
for (const [a, b] of middleEdges) {
  if (!adj.has(a)) adj.set(a, []);
  adj.get(a).push(b);
}
const state = new Map();
const hasCycle = (n) => {
  state.set(n, 1);
  for (const m of adj.get(n) ?? []) {
    if (state.get(m) === 1) return true;
    if (!state.has(m) && hasCycle(m)) return true;
  }
  state.set(n, 2);
  return false;
};
for (const n of adj.keys()) {
  if (!state.has(n) && hasCycle(n)) {
    errors.push(`cycle detected involving ${n}`);
    break;
  }
}

for (const w of warn) console.warn(`WARN: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  process.exit(1);
}
const counts = Object.fromEntries(Object.keys(shapes).map((f) => [f, spec[f].length]));
console.log(`OK ${spec.subject}: ${JSON.stringify(counts)}`);
