import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

// 주제 콘텐츠 오버레이(개선계획 P3-2). 빌더·검증기·워커 게이트가 같은 규칙을 쓰도록 한 곳에 모은다.
export const CONTENT_KINDS = ['mechanical-derivative', 'source-grounded-draft'];
export const OVERLAY_MIN_LENGTHS = { evidence: 20, assessmentPrompt: 40, misconception: 15 };
export const OVERLAY_SCHEMA_ID = 'https://dexa.art/learnmap/schema/secondary/content-overlay.schema.json';

// 오버레이 파일 이름 규칙: 과목 라벨의 안전한 슬러그. 중학교 24과목과 자주 쓰는 고등학교 과목은
// 아래 표를 쓰고, 표에 없는 라벨은 `course-<sha256 앞 12자리>`로 결정적으로 만든다.
const courseSlugOverrides = {
  '과학': 'science',
  '국어': 'korean',
  '기술·가정': 'technology-home-economics',
  '도덕': 'moral',
  '미술': 'art',
  '보건': 'health',
  '사회': 'social-studies',
  '생활 독일어': 'german',
  '생활 러시아어': 'russian',
  '생활 베트남어': 'vietnamese',
  '생활 스페인어': 'spanish',
  '생활 아랍어': 'arabic',
  '생활 일본어': 'japanese',
  '생활 중국어': 'chinese',
  '생활 프랑스어': 'french',
  '수학': 'math',
  '역사': 'history',
  '영어': 'english',
  '음악': 'music',
  '정보': 'information',
  '진로와 직업': 'career-and-vocation',
  '체육': 'physical-education',
  '한문': 'classical-chinese',
  '환경': 'environment',
  '공통국어1': 'common-korean-1',
  '공통국어2': 'common-korean-2',
  '공통수학1': 'common-math-1',
  '공통수학2': 'common-math-2',
  '공통영어1': 'common-english-1',
  '공통영어2': 'common-english-2',
  '통합사회1': 'integrated-social-studies-1',
  '통합사회2': 'integrated-social-studies-2',
  '통합과학1': 'integrated-science-1',
  '통합과학2': 'integrated-science-2',
  '한국사1': 'korean-history-1',
  '한국사2': 'korean-history-2',
};

export function courseSlug(labelKorean) {
  const label = (labelKorean ?? '').trim();
  if (courseSlugOverrides[label]) return courseSlugOverrides[label];
  const ascii = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (ascii.length >= 2) return ascii;
  return `course-${createHash('sha256').update(label).digest('hex').slice(0, 12)}`;
}

export const contentOverlayDirectory = (root, profile) => join(root, 'data/kr', profile, 'content');

export function normalizeText(value) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function overlayEntryStrings(entry) {
  return [
    ...(entry.evidence ?? []).map((text) => ({ field: 'evidence', text })),
    ...(entry.assessmentPrompts ?? []).map((text) => ({ field: 'assessmentPrompts', text })),
    ...(entry.misconceptions ?? []).map((text) => ({ field: 'misconceptions', text })),
  ];
}

const minLengthFor = { evidence: OVERLAY_MIN_LENGTHS.evidence, assessmentPrompts: OVERLAY_MIN_LENGTHS.assessmentPrompt, misconceptions: OVERLAY_MIN_LENGTHS.misconception };

/** Reads every overlay document under data/kr/<profile>/content. A missing directory means zero overlays. */
export async function readContentOverlays(directory) {
  let names = [];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const documents = [];
  for (const name of names.filter((item) => extname(item) === '.json').sort((a, b) => a.localeCompare(b, 'en'))) {
    const path = join(directory, name);
    documents.push({ file: name, slug: basename(name, '.json'), path, document: JSON.parse(await readFile(path, 'utf8')) });
  }
  return documents;
}

/** Flattens overlay documents into one topicId -> entry index; a topic may be authored only once per profile. */
export function indexOverlayEntries(overlays) {
  const entries = new Map();
  const errors = [];
  for (const overlay of overlays) {
    for (const [topicId, entry] of Object.entries(overlay.document.entries ?? {})) {
      if (entries.has(topicId)) {
        errors.push(`${overlay.file}: topic ${topicId} is already authored in ${entries.get(topicId).file}`);
        continue;
      }
      entries.set(topicId, { topicId, entry, file: overlay.file, slug: overlay.slug, document: overlay.document });
    }
  }
  return { entries, errors };
}

/** Merge point: an overlay replaces the mechanical evidence/prompts and records its provenance. */
export function applyContentOverlay(topic, hit) {
  if (!hit) {
    topic.contentKind = 'mechanical-derivative';
    return false;
  }
  topic.evidence = [...hit.entry.evidence];
  topic.assessmentPrompts = [...hit.entry.assessmentPrompts];
  topic.contentKind = 'source-grounded-draft';
  if (hit.entry.misconceptions?.length) topic.misconceptions = [...hit.entry.misconceptions];
  topic.contentSourceLocator = { ...hit.entry.sourceLocator };
  return true;
}

/**
 * Content checks shared by validate.mjs and scripts/dev/check-content-overlay.mjs:
 * dangling ids, misfiled course, minimum lengths, verbatim standard copies, exact duplicates.
 */
export function analyzeOverlay({ label, overlay, topicsById, standardsById, coursesById }) {
  const errors = [];
  const document = overlay.document;
  const entries = Object.entries(document.entries ?? {});
  const seen = { evidence: new Map(), assessmentPrompts: new Map() };
  const stats = { entries: entries.length, evidence: 0, assessmentPrompts: 0, misconceptions: 0, verbatim: 0, duplicates: 0 };

  for (const [topicId, entry] of entries) {
    const where = `${label}/${topicId}`;
    const topic = topicsById.get(topicId);
    if (!topic) {
      errors.push(`${where}: dangling topic id`);
      continue;
    }
    if (coursesById) {
      const slugs = topic.courseIds.map((courseId) => courseSlug(coursesById.get(courseId)?.labelKorean ?? ''));
      if (!slugs.includes(overlay.slug)) errors.push(`${where}: topic belongs to ${slugs.join(', ')} but is filed under ${overlay.slug}`);
    }
    const summaries = (topic.standardAlignments ?? [])
      .map((alignment) => normalizeText(standardsById.get(alignment.standardId)?.summary))
      .filter((summary) => summary.length >= 12);

    for (const { field, text } of overlayEntryStrings(entry)) {
      stats[field] += 1;
      const normalized = normalizeText(text);
      if (normalized.length < minLengthFor[field]) errors.push(`${where}: ${field} shorter than ${minLengthFor[field]} characters`);
      if (summaries.some((summary) => normalized.includes(summary))) {
        stats.verbatim += 1;
        errors.push(`${where}: ${field} reproduces the official standard summary verbatim`);
      }
      if (field === 'misconceptions') continue;
      const previous = seen[field].get(normalized);
      if (previous) {
        stats.duplicates += 1;
        errors.push(`${where}: ${field} duplicates ${previous} exactly`);
      } else seen[field].set(normalized, topicId);
    }
  }
  return { errors, stats };
}
