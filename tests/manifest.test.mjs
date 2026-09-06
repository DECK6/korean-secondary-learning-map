import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { renderManifests } from '../scripts/build-manifests.mjs';

test('renders deterministic profile and bundle manifests', async () => {
  const first = await renderManifests();
  const second = await renderManifests();
  expect([...first.entries()]).toEqual([...second.entries()]);
  // middle, high, high-vocational, bridges plus the bundle manifest.
  expect(first.size).toBe(5);
  expect([...first.keys()].some((path) => path.includes('/dist/high-vocational/'))).toBe(true);
});

test('tracked manifests match deterministic rendering', async () => {
  const expected = await renderManifests();
  for (const [path, content] of expected) {
    expect(await readFile(path, 'utf8')).toBe(content);
  }
});
