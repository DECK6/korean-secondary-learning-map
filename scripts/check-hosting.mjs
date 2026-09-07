#!/usr/bin/env node
// Verifies the IRI hosting tree. Default: dist/hosting is a deterministic, up-to-date build whose
// IRI coverage is complete. --deploy [root]: the dexa.art site checkout carries the same bytes.
// --live: https://dexa.art serves the same bytes and every IRI family dereferences.

import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { buildHosting, DEFAULT_DIST, ROOT } from './build-hosting.mjs';
import { compareLive, compareWithDeploy, formatBytes, pathExists, sha256File } from './lib/iri-hosting.mjs';

const args = process.argv.slice(2);
const deployIndex = args.indexOf('--deploy');
const wantsDeploy = deployIndex !== -1;
const deployRoot = path.resolve(
  (wantsDeploy && args[deployIndex + 1] && !args[deployIndex + 1].startsWith('--') ? args[deployIndex + 1] : null)
    ?? process.env.LEARNMAP_SITE_ROOT
    ?? path.join(ROOT, '..', 'adxdeck-blog-main'),
);
const wantsLive = args.includes('--live');

async function checkBuild() {
  const manifestPath = path.join(DEFAULT_DIST, 'manifest.json');
  if (!(await pathExists(manifestPath))) throw new Error('dist/hosting/manifest.json missing; run bun run build:hosting');
  const committed = JSON.parse(await readFile(manifestPath, 'utf8'));
  const scratch = path.join(ROOT, 'dist', 'hosting-check');
  const rebuilt = await buildHosting({ distDir: scratch });
  await rm(scratch, { recursive: true, force: true });
  const committedByPath = new Map(committed.files.map((file) => [file.path, file.sha256]));
  const drift = rebuilt.files.filter((file) => committedByPath.get(file.path) !== file.sha256).map((file) => file.path);
  const stale = committed.files.filter((file) => !rebuilt.files.some((entry) => entry.path === file.path)).map((file) => file.path);
  if (drift.length || stale.length) throw new Error(`dist/hosting is stale or non-deterministic: drift ${drift.slice(0, 5).join(', ')}${stale.length ? `; stale ${stale.slice(0, 5).join(', ')}` : ''}`);
  for (const file of committed.files) {
    const digest = await sha256File(path.join(DEFAULT_DIST, file.path));
    if (digest !== file.sha256) throw new Error(`dist/hosting/${file.path} does not match its manifest entry`);
  }
  const bytes = committed.files.reduce((sum, file) => sum + file.bytes, 0);
  console.log(`hosting check passed: ${committed.files.length} files (${formatBytes(bytes)}) deterministic, ${committed.iriCount} IRIs covered by ${committed.iriCoverage.length} documents`);
  return committed;
}

async function main() {
  const manifest = await checkBuild();
  if (wantsDeploy) {
    const result = await compareWithDeploy(manifest, deployRoot);
    const problems = [...result.missing.map((file) => `missing ${file}`), ...result.drift.map((entry) => `drift ${entry.path}`), ...result.assumedMissing.map((file) => `missing app file ${file}`)];
    if (problems.length) throw new Error(`deploy checkout ${deployRoot} is out of sync (${problems.length}): ${problems.slice(0, 8).join(' | ')}`);
    console.log(`hosting deploy check passed: ${result.ok} files identical in ${deployRoot}`);
  }
  if (wantsLive) {
    let done = 0;
    const result = await compareLive(manifest, { onProgress: () => { done += 1; } });
    const problems = [...result.failures.map((entry) => `${entry.path}: ${entry.reason}`), ...result.iriFailures.map((entry) => `${entry.iri}: ${entry.reason}`)];
    if (problems.length) throw new Error(`live site out of sync (${problems.length}/${done}): ${problems.slice(0, 8).join(' | ')}`);
    console.log(`hosting live check passed: ${result.ok} files byte-identical on dexa.art, ${manifest.iriCoverage.length} IRI documents dereference`);
  }
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exitCode = 1;
});
