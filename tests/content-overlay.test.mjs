import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  CONTENT_KINDS,
  OVERLAY_SCHEMA_ID,
  analyzeOverlay,
  applyContentOverlay,
  contentOverlayDirectory,
  courseSlug,
  indexOverlayEntries,
  readContentOverlays,
} from '../scripts/lib/content-overlay.mjs';
import { createAjv } from '../scripts/validate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDirectory = join(root, 'tests/fixtures/content-overlay');
const readRecords = async (name) => JSON.parse(await readFile(join(root, 'data/kr/middle', name), 'utf8')).records;

let overlays;
let topicsById;
let standardsById;
let coursesById;

beforeAll(async () => {
  overlays = await readContentOverlays(fixtureDirectory);
  topicsById = new Map((await readRecords('topics.json')).map((topic) => [topic.id, topic]));
  standardsById = new Map((await readRecords('standards.json')).map((standard) => [standard.id, standard]));
  coursesById = new Map((await readRecords('courses.json')).map((course) => [course.id, course]));
});

const analyze = (overlay) => analyzeOverlay({ label: overlay.file, overlay, topicsById, standardsById, coursesById });
const clone = (overlay) => ({ ...overlay, document: JSON.parse(JSON.stringify(overlay.document)) });
const onlyEntry = (overlay) => Object.values(overlay.document.entries)[0];

describe('content overlay contract', () => {
  test('names files by the course slug', () => {
    expect(courseSlug('수학')).toBe('math');
    expect(courseSlug('국어')).toBe('korean');
    expect(courseSlug('기술·가정')).toBe('technology-home-economics');
    expect(courseSlug('알 수 없는 과목')).toMatch(/^course-[0-9a-f]{12}$/);
  });

  test('accepts the fixture overlay against the published schema', async () => {
    const ajv = await createAjv(root);
    const validate = ajv.getSchema(OVERLAY_SCHEMA_ID);
    expect(overlays.length).toBe(1);
    expect(validate(overlays[0].document)).toBe(true);
    const { entries, errors } = indexOverlayEntries(overlays);
    expect(errors).toEqual([]);
    expect(entries.size).toBe(1);
  });

  test('passes every content check on the fixture overlay', () => {
    const { errors, stats } = analyze(overlays[0]);
    expect(errors).toEqual([]);
    expect(stats).toMatchObject({ entries: 1, evidence: 2, assessmentPrompts: 1, misconceptions: 2, verbatim: 0, duplicates: 0 });
  });

  test('merges an overlay entry into the generated topic', () => {
    const { entries } = indexOverlayEntries(overlays);
    const [topicId, hit] = [...entries][0];
    const topic = { id: topicId, evidence: ['템플릿 증거'], assessmentPrompts: ['템플릿 프롬프트'], contentKind: 'mechanical-derivative' };
    expect(applyContentOverlay(topic, hit)).toBe(true);
    expect(topic.contentKind).toBe('source-grounded-draft');
    expect(topic.evidence).toEqual(hit.entry.evidence);
    expect(topic.assessmentPrompts).toEqual(hit.entry.assessmentPrompts);
    expect(topic.misconceptions).toEqual(hit.entry.misconceptions);
    expect(topic.contentSourceLocator).toEqual(hit.entry.sourceLocator);
  });

  test('leaves a topic mechanical when no overlay entry exists', () => {
    const topic = { id: 'kr.topic.2022.middle.example', evidence: ['템플릿 증거'], assessmentPrompts: ['템플릿 프롬프트'] };
    expect(applyContentOverlay(topic, undefined)).toBe(false);
    expect(topic.contentKind).toBe('mechanical-derivative');
    expect(topic.contentSourceLocator).toBeUndefined();
  });

  test('rejects dangling topic ids', () => {
    const overlay = clone(overlays[0]);
    overlay.document.entries['kr.topic.2022.middle.does-not-exist'] = onlyEntry(overlay);
    expect(analyze(overlay).errors.some((error) => error.includes('dangling topic id'))).toBe(true);
  });

  test('rejects a misfiled course slug', () => {
    const overlay = { ...clone(overlays[0]), slug: 'korean' };
    expect(analyze(overlay).errors.some((error) => error.includes('is filed under korean'))).toBe(true);
  });

  test('rejects verbatim copies of the official standard summary', () => {
    const overlay = clone(overlays[0]);
    const [topicId, entry] = Object.entries(overlay.document.entries)[0];
    const standardId = topicsById.get(topicId).standardAlignments[0].standardId;
    entry.evidence = [`학습자가 ${standardsById.get(standardId).summary} 활동을 수행한다.`];
    const { errors, stats } = analyze(overlay);
    expect(stats.verbatim).toBe(1);
    expect(errors.some((error) => error.includes('verbatim'))).toBe(true);
  });

  test('rejects strings below the authoring minimum length', () => {
    const overlay = clone(overlays[0]);
    onlyEntry(overlay).evidence = ['너무 짧은 증거'];
    onlyEntry(overlay).assessmentPrompts = ['너무 짧은 평가 프롬프트'];
    onlyEntry(overlay).misconceptions = ['짧은 오답'];
    const errors = analyze(overlay).errors;
    expect(errors.some((error) => error.includes('evidence shorter than 25'))).toBe(true);
    expect(errors.some((error) => error.includes('assessmentPrompts shorter than 40'))).toBe(true);
    expect(errors.some((error) => error.includes('misconceptions shorter than 15'))).toBe(true);
  });

  test('rejects exact duplicates inside one overlay file', () => {
    const overlay = clone(overlays[0]);
    const [topicId, entry] = Object.entries(overlay.document.entries)[0];
    const sibling = [...topicsById.values()].find((topic) => topic.id !== topicId && topic.courseIds[0] === topicsById.get(topicId).courseIds[0]);
    overlay.document.entries[sibling.id] = JSON.parse(JSON.stringify(entry));
    const { errors, stats } = analyze(overlay);
    expect(stats.duplicates).toBeGreaterThan(0);
    expect(errors.some((error) => error.includes('duplicates'))).toBe(true);
  });

  test('rejects the same topic authored in two files', () => {
    const duplicate = clone(overlays[0]);
    duplicate.file = 'math-2.json';
    const { errors } = indexOverlayEntries([overlays[0], duplicate]);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('already authored in');
  });
});

describe('built topics carry content provenance', () => {
  test('every middle and high topic declares a content kind', async () => {
    for (const profile of ['middle', 'high']) {
      const topics = JSON.parse(await readFile(join(root, 'data/kr', profile, 'topics.json'), 'utf8')).records;
      const unknown = topics.filter((topic) => !CONTENT_KINDS.includes(topic.contentKind));
      expect(unknown).toEqual([]);
      const drafts = topics.filter((topic) => topic.contentKind === 'source-grounded-draft');
      for (const topic of drafts) expect(topic.contentSourceLocator?.sourceId).toBeTruthy();
      const authored = (await readContentOverlays(contentOverlayDirectory(root, profile))).flatMap((overlay) => Object.keys(overlay.document.entries ?? {}));
      expect(drafts.length).toBe(authored.length);
    }
  }, 30000);
});
