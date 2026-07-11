import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(root, 'sources/official/source-catalog.json');
const receiptsPath = join(root, 'sources/official/source-receipts.json');
const filesDirectory = join(root, 'sources/official/files');
const textDirectory = join(root, 'sources/official/text');
const checkOnly = process.argv.includes('--check');
const refresh = process.argv.includes('--refresh');

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  const sort = (input) => {
    if (Array.isArray(input)) return input.map(sort);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(Object.keys(input).sort((a, b) => a.localeCompare(b, 'en')).map((key) => [key, sort(input[key])]));
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

async function atomicWrite(path, content) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

async function commandOutput(command, args) {
  const process = Bun.spawn([command, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) throw new Error(`${command} failed: ${stderr.trim()}`);
  return stdout;
}

async function pdfPages(path) {
  const output = await commandOutput('pdfinfo', [path]);
  const match = output.match(/^Pages:\s+(\d+)$/m);
  if (!match) throw new Error(`${path}: pdfinfo did not return a page count`);
  return Number(match[1]);
}

async function extractText(pdfPath, textPath) {
  const process = Bun.spawn(['pdftotext', '-layout', '-enc', 'UTF-8', pdfPath, textPath], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stderr = await new Response(process.stderr).text();
  const exitCode = await process.exited;
  if (exitCode !== 0) throw new Error(`pdftotext failed for ${pdfPath}: ${stderr.trim()}`);
}

async function openSession() {
  const response = await fetch(catalog.sessionPage, {
    headers: { 'User-Agent': 'korean-secondary-learning-map-source-audit/0.1' },
  });
  if (!response.ok) throw new Error(`NCIC session page failed: ${response.status}`);
  const html = await response.text();
  const csrf = html.match(/meta name="_csrf" content="([^"]+)"/)?.[1];
  const cookie = response.headers.get('set-cookie')
    ?.split(',')
    .map((part) => part.trim().split(';')[0])
    .join('; ');
  if (!csrf || !cookie) throw new Error('NCIC session did not provide CSRF token and cookies');
  return { csrf, cookie };
}

async function downloadSource(source, session, destination) {
  const body = new URLSearchParams({
    _csrf: session.csrf,
    filePath: source.filePath,
    fileName: source.storedName,
    fileOrg: source.originalName,
    fileIdx: source.attachmentNo,
    fileTbl: 'NCIS_ORG_ATTACH_TYPE',
  });
  const response = await fetch(catalog.downloadEndpoint, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      Cookie: session.cookie,
      Referer: catalog.sessionPage,
      'User-Agent': 'korean-secondary-learning-map-source-audit/0.1',
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': session.csrf,
    },
    body,
  });
  if (!response.ok) throw new Error(`${source.id}: NCIC download failed with ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    throw new Error(`${source.id}: response is not a PDF (${response.headers.get('content-type')})`);
  }
  await atomicWrite(destination, bytes);
}

async function inspectSource(source) {
  const pdfPath = join(filesDirectory, `${source.id}.pdf`);
  const textPath = join(textDirectory, `${source.id}.txt`);
  const bytes = await readFile(pdfPath);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error(`${source.id}: local file is not a PDF`);
  await extractText(pdfPath, textPath);
  return {
    id: source.id,
    annex: source.annex,
    attachmentNo: source.attachmentNo,
    originalName: source.originalName,
    localFile: relative(root, pdfPath).split('\\').join('/'),
    textFile: relative(root, textPath).split('\\').join('/'),
    bytes: bytes.length,
    sha256: sha256(bytes),
    pdfPages: await pdfPages(pdfPath),
  };
}

if (catalog.sourceCount !== catalog.sources.length) {
  throw new Error(`catalog sourceCount ${catalog.sourceCount} != ${catalog.sources.length}`);
}
const ids = new Set();
const annexes = new Set();
for (const source of catalog.sources) {
  if (ids.has(source.id)) throw new Error(`duplicate source id: ${source.id}`);
  if (annexes.has(source.annex)) throw new Error(`duplicate selected annex: ${source.annex}`);
  ids.add(source.id);
  annexes.add(source.annex);
}

await mkdir(filesDirectory, { recursive: true });
await mkdir(textDirectory, { recursive: true });

let session = null;
if (!checkOnly) session = await openSession();
const receipts = [];
for (const [index, source] of catalog.sources.entries()) {
  const pdfPath = join(filesDirectory, `${source.id}.pdf`);
  let exists = true;
  try {
    await stat(pdfPath);
  } catch {
    exists = false;
  }
  if (!checkOnly && (refresh || !exists)) {
    await downloadSource(source, session, pdfPath);
    if (index < catalog.sources.length - 1) await Bun.sleep(120);
  }
  if (!exists && checkOnly) throw new Error(`${source.id}: local PDF is missing; run bun run sources:download`);
  receipts.push(await inspectSource(source));
  console.log(`${String(index + 1).padStart(2, '0')}/${catalog.sources.length} annex ${source.annex}: ${source.id}`);
}

receipts.sort((a, b) => a.annex - b.annex);
const receiptDocument = {
  $schema: '../../schema/official-source-receipts.schema.json',
  catalogVersion: catalog.catalogVersion,
  sourceCount: receipts.length,
  totalBytes: receipts.reduce((sum, source) => sum + source.bytes, 0),
  sources: receipts,
};
const expected = stableJson(receiptDocument);
if (checkOnly) {
  const actual = await readFile(receiptsPath, 'utf8');
  if (actual !== expected) throw new Error('source-receipts.json is stale');
  console.log(`official source check passed: ${receipts.length} PDFs, ${receiptDocument.totalBytes} bytes`);
} else {
  await atomicWrite(receiptsPath, expected);
  console.log(`official source collection passed: ${receipts.length} PDFs, ${receiptDocument.totalBytes} bytes`);
}
