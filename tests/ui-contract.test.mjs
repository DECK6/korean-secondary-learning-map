import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('has a keyboard-addressable tab and form structure', async () => {
  const { document } = parseHTML(await read('../ui/index.html'));
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
  expect(index.comparisonBaselines.elementary.topics).toBe(1956);
  expect(index.boundaries.some((text) => text.includes('공식 필수 요건이 아닙니다'))).toBe(true);
});
