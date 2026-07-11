import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profileNames = ['middle', 'high', 'bridges'];
const profileSchemaFiles = {
  middle: 'middle-profile.schema.json',
  high: 'high-profile.schema.json',
  bridges: 'bridge-profile.schema.json',
};

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b, 'en'))
      .map((key) => [key, sortValue(value[key])]),
  );
}

function renderJson(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fileEntry(root, absolutePath) {
  const bytes = await readFile(absolutePath);
  return {
    path: relative(root, absolutePath).split('\\').join('/'),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

export async function renderManifests(root = projectRoot) {
  const outputs = new Map();
  const profileMeta = [];
  const sharedPaths = [
    join(root, 'data/kr/shared/source-manifest.json'),
    join(root, 'data/kr/shared/controlled-vocabularies.json'),
    join(root, 'sources/official/source-catalog.json'),
    join(root, 'sources/official/source-receipts.json'),
  ];
  const sharedSchemaPaths = [
    join(root, 'schema/core.schema.json'),
    join(root, 'schema/source-manifest.schema.json'),
    join(root, 'schema/controlled-vocabularies.schema.json'),
    join(root, 'schema/official-source-catalog.schema.json'),
    join(root, 'schema/official-source-receipts.schema.json'),
  ];

  for (const profile of profileNames) {
    const directory = join(root, 'data/kr', profile);
    const releasePath = join(directory, 'release.json');
    const release = JSON.parse(await readFile(releasePath, 'utf8'));
    const inputPaths = [
      releasePath,
      ...Object.values(release.collections).map((file) => join(directory, file)),
      ...sharedPaths,
      ...sharedSchemaPaths,
      join(root, 'schema', profileSchemaFiles[profile]),
    ];
    const files = [];
    for (const path of inputPaths) files.push(await fileEntry(root, path));
    files.sort((a, b) => a.path.localeCompare(b.path, 'en'));

    const manifest = {
      formatVersion: '1',
      profile,
      releaseId: release.releaseId,
      curriculumVersion: release.curriculumVersion,
      status: release.status,
      rightsStatus: release.rightsStatus,
      counts: release.counts,
      files,
    };
    if (profile === 'bridges') {
      manifest.middleReleaseId = release.middleReleaseId;
      manifest.highReleaseId = release.highReleaseId;
    }
    const outputPath = join(root, 'dist', profile, 'manifest.json');
    const content = renderJson(manifest);
    outputs.set(outputPath, content);
    profileMeta.push({
      profile,
      releaseId: release.releaseId,
      path: relative(root, outputPath).split('\\').join('/'),
      bytes: Buffer.byteLength(content),
      sha256: sha256(content),
    });
  }

  profileMeta.sort((a, b) => a.profile.localeCompare(b.profile, 'en'));
  const componentPaths = [
    join(root, 'dist/ontology/manifest.json'),
    join(root, 'dist/ui/manifest.json'),
    join(root, 'data/kr/inventory-report.json'),
  ];
  const components = [];
  for (const path of componentPaths) components.push(await fileEntry(root, path));
  components.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const bundle = {
    formatVersion: '1',
    bundleId: 'kr-2022-secondary-bundle-v0.2.0-candidate',
    profiles: profileMeta,
    components,
  };
  outputs.set(join(root, 'dist/bundle/manifest.json'), renderJson(bundle));
  return outputs;
}

async function writeAtomic(path, content) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, path);
}

export async function buildManifests({ root = projectRoot, check = false } = {}) {
  const outputs = await renderManifests(root);
  const stale = [];
  for (const [path, expected] of outputs) {
    if (check) {
      let actual = null;
      try {
        actual = await readFile(path, 'utf8');
      } catch {
        stale.push(`${relative(root, path)} is missing`);
        continue;
      }
      if (actual !== expected) stale.push(`${relative(root, path)} is stale`);
    } else {
      await writeAtomic(path, expected);
    }
  }
  if (stale.length) throw new Error(stale.join('\n'));
  return outputs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  try {
    const outputs = await buildManifests({ check });
    console.log(`${check ? 'manifest check' : 'manifest build'} passed: ${outputs.size} artifacts`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
