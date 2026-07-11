import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { renderManifests } from '../scripts/build-manifests.mjs';

test('renders deterministic profile and bundle manifests', async () => {
  const first = await renderManifests();
  const second = await renderManifests();
  expect([...first.entries()]).toEqual([...second.entries()]);
  expect(first.size).toBe(4);
});

test('tracked manifests match deterministic rendering', async () => {
  const expected = await renderManifests();
  for (const [path, content] of expected) {
    expect(await readFile(path, 'utf8')).toBe(content);
  }
});
