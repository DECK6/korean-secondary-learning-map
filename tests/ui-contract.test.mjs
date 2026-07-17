import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

import { officialRelationSpecs } from '../scripts/lib/official-relation-specs/index.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const registeredHighRequired = officialRelationSpecs.reduce(
  (total, spec) => total + (spec.highRequired ?? []).length + (spec.highCommentaryRequired ?? []).length,
  0,
);

test('has a keyboard-addressable tab and form structure', async () => {
  const html = await read('../ui/index.html');
  const { document } = parseHTML(html);
  expect(document.documentElement.lang).toBe('ko');
  expect(document.querySelectorAll('h1').length).toBe(1);
  expect(document.querySelector('.skip-link')?.getAttribute('href')).toBe('#main');
  const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
  expect(new Set(ids).size).toBe(ids.length);
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  expect(tabs.length).toBe(5);
  for (const tab of tabs) {
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    expect(panel?.getAttribute('role')).toBe('tabpanel');
    expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
  }
  for (const label of document.querySelectorAll('label')) expect(label.querySelector('input,select')).not.toBeNull();
  expect(html).not.toContain('관계와 경로는 전문가 검토 전 후보');
});

test('defines responsive, focus and reduced-motion fallbacks', async () => {
  const css = await read('../ui/styles.css');
  expect(css).toContain(':focus-visible');
  expect(css).toContain('@media (max-width:1050px)');
  expect(css).toContain('@media (max-width:700px)');
  expect(css).toContain('prefers-reduced-motion');
  expect(css).not.toMatch(/@import\s+url\(['"]?https?:\/\//);
});

test('publishes one lazy detail payload per course', async () => {
  const index = JSON.parse(await read('../ui/data/map-index.json'));
  const manifest = JSON.parse(await read('../dist/ui/manifest.json'));
  expect(index.courses.length).toBe(783);
  expect(new Set(index.courses.map((course) => course.detailFile)).size).toBe(783);
  expect(manifest.courseDetailCount).toBe(783);
  expect(index.statistics.middleTopics).toBe(2160);
  expect(index.statistics.highAcademicStandards).toBe(3124);
  expect(index.statistics.highVocationalStandards).toBe(47625);
  expect(index.statistics.highAcademicStandards + index.statistics.highVocationalStandards).toBe(index.statistics.highStandards);
  expect(index.statistics.middleOfficialRelations).toBe(56);
  expect(index.statistics.highOfficialRelations).toBe(39 + registeredHighRequired);
  expect(index.statistics.highOfficialCourseRelations).toBe(39);
  expect(index.statistics.officialTransitions).toBe(175);
  expect(index.comparisonBaselines.elementary.topics).toBe(1956);
  expect(index.boundaries.some((text) => text.includes('공식 문서 근거가 있는 항목만 제공'))).toBe(true);
  expect(index.transitions.every((transition) => transition.basis && transition.sourceRefs.length > 0)).toBe(true);

  const relatedCourse = index.courses.find((course) => course.label === '공통국어2');
  expect(relatedCourse.relationCount).toBeGreaterThan(0);
  const relatedDetail = JSON.parse(await read(`../ui/${relatedCourse.detailFile}`));
  expect(relatedDetail.relations.length + relatedDetail.courseRelations.length).toBe(relatedCourse.relationCount);

  const emptyCourse = index.courses.find((course) => course.relationCount === 0);
  const emptyDetail = JSON.parse(await read(`../ui/${emptyCourse.detailFile}`));
  expect(emptyDetail.relations).toEqual([]);
  expect(emptyDetail.courseRelations).toEqual([]);
});

test('labels relations as official evidence and explains the sparse state', async () => {
  const app = await read('../ui/app.js');
  expect(app).toContain('공식 문서가 명시한 선수학습 관계 없음');
  expect(app).toContain('공식 문서 근거');
  expect(app).not.toContain('관계 후보');
});
