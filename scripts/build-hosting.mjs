#!/usr/bin/env bun
// Builds the static IRI hosting tree for the secondary ontology under dist/hosting/.
// Every https://dexa.art/learnmap/secondary/... and /learnmap/schema/secondary/... IRI resolves to
// a file in this tree; K-12 core and vocabulary documents are owned by the elementary repository and
// only the shared k12-core.ttl is emitted here (the site sync requires both copies to be identical).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  RDF,
  classifyTerm,
  collectSiteIris,
  escapeHtml,
  formatBytes,
  iriLink,
  iris,
  literal,
  renderArtifactTable,
  renderDocument,
  renderTermTable,
  resolveIriCoverage,
  scanTurtle,
  sha256,
  summariseCoverage,
  walkFiles,
  writeHostingTree,
} from './lib/iri-hosting.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(SCRIPT_DIR, '..');
export const DEFAULT_DIST = path.join(ROOT, 'dist', 'hosting');

const SERIES_IRI = 'https://dexa.art/learnmap/secondary/ontology';
const CORE_IRI = 'https://dexa.art/learnmap/ontology/k12-core';
const RESOURCE_IRI = 'https://dexa.art/learnmap/secondary/resource/';
const SCHEMA_IRI = 'https://dexa.art/learnmap/schema/secondary/';
const APP_PATH = 'learnmap/index.html';

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

export async function buildHosting({ root = ROOT, distDir = DEFAULT_DIST } = {}) {
  const ontologyDir = path.join(root, 'ontology');
  const releaseDir = path.join(root, 'dist', 'ontology');
  const [tboxText, coreText, contextText, metadataText, shapesText, manifest] = await Promise.all([
    readFile(path.join(ontologyDir, 'learning-map.ttl'), 'utf8'),
    readFile(path.join(ontologyDir, 'k12-core.ttl'), 'utf8'),
    readFile(path.join(ontologyDir, 'context.jsonld'), 'utf8'),
    readFile(path.join(ontologyDir, 'metadata.ttl'), 'utf8'),
    readFile(path.join(ontologyDir, 'shapes.ttl'), 'utf8'),
    readJson(path.join(releaseDir, 'manifest.json')),
  ]);
  if (manifest.includesVocational) throw new Error('dist/ontology holds the vocational graph; run bun run build:ontology before build:hosting');
  const tbox = scanTurtle(tboxText);
  const metadata = scanTurtle(metadataText);
  const core = scanTurtle(coreText);
  const seriesTerm = tbox.terms.find((term) => term.iri === SERIES_IRI);
  const metadataTerm = metadata.terms.find((term) => term.iri === SERIES_IRI);
  const coreTerm = core.terms.find((term) => term.iri === CORE_IRI);
  if (!seriesTerm || !metadataTerm || !coreTerm) throw new Error('ontology headers not found');
  const version = literal(seriesTerm, RDF.versionInfo);
  const versionIri = iris(seriesTerm, RDF.versionIRI)[0];
  const priorVersionIri = iris(seriesTerm, RDF.priorVersion)[0];
  const priorVersion = priorVersionIri?.split('/').pop();
  if (manifest.version !== version) throw new Error(`dist/ontology manifest ${manifest.version} != TBox ${version}`);
  const coreVersion = literal(coreTerm, RDF.versionInfo);

  const artifactEntry = (name) => {
    const entry = manifest.artifacts.find((artifact) => artifact.path === `dist/ontology/${name}`);
    if (!entry) throw new Error(`ontology manifest is missing ${name}`);
    return entry;
  };
  const abox = ['learning-map.ttl', 'learning-map.jsonld'].map((name) => ({ name, sourcePath: path.join(releaseDir, name), entry: artifactEntry(name) }));
  for (const artifact of abox) {
    if (sha256(await readFile(artifact.sourcePath)) !== artifact.entry.sha256) throw new Error(`${artifact.name} differs from dist/ontology/manifest.json; run bun run build:ontology`);
  }
  const schemaFiles = [];
  for (const file of (await walkFiles(path.join(root, 'schema'))).filter((file) => file.endsWith('.json'))) {
    const text = await readFile(file, 'utf8');
    const id = JSON.parse(text).$id;
    if (typeof id !== 'string' || !id.startsWith(SCHEMA_IRI)) throw new Error(`${file} has no $id under ${SCHEMA_IRI}`);
    schemaFiles.push({ name: id.slice(SCHEMA_IRI.length), id, text, title: JSON.parse(text).title ?? '' });
  }

  const groups = { class: [], objectProperty: [], datatypeProperty: [], annotationProperty: [], conceptScheme: [], concept: [] };
  for (const term of tbox.terms) {
    const kind = classifyTerm(term);
    if (groups[kind]) groups[kind].push(term);
  }
  const staticFiles = [
    { name: 'ontology.ttl', content: tboxText, note: '용어 정의(TBox)만 담은 온톨로지 문서' },
    { name: 'context.jsonld', content: contextText, note: 'JSON-LD context' },
    { name: 'shapes.ttl', content: shapesText, note: 'SHACL 제약' },
    { name: 'metadata.ttl', content: metadataText, note: '권리·라이선스 메타데이터' },
  ];
  const describe = (file) => ({ name: file.name, href: `./${file.name}`, mediaType: file.name.endsWith('.jsonld') ? 'application/ld+json' : 'text/turtle', bytes: Buffer.byteLength(file.content), sha256: sha256(file.content), note: file.note });
  const versionDir = `learnmap/secondary/ontology/${version}`;

  const files = [];
  const add = (hostedPath, content) => files.push({ path: hostedPath, content });

  add('learnmap/secondary/ontology/index.html', renderDocument({
    title: '중등 교육과정 학습지도 온톨로지',
    description: `대한민국 2022 개정 중등교육 학습지도 온톨로지 ${version}의 용어 정의와 배포 파일.`,
    canonicalPath: 'learnmap/secondary/ontology/index.html',
    eyebrow: 'Korean Secondary Curriculum Learning Ontology',
    heading: literal(metadataTerm, RDF.title, 'ko') ?? literal(seriesTerm, RDF.label, 'ko') ?? '중등 학습지도 온톨로지',
    lead: `이 문서는 <code>${escapeHtml(SERIES_IRI)}#</code> 이름공간의 모든 용어를 설명합니다. 용어 IRI의 fragment(<code>#LearningRelation</code>)가 아래 표의 해당 행으로 이동합니다. 중학교·고등학교(일반) 그래프는 ${escapeHtml(String(manifest.graphNodeCount))}개 노드이며, 고교 직업계 528과목 그래프는 별도 파일로 저장소에서 빌드합니다.`,
    crumbs: [{ href: '/learnmap/', label: 'learnmap' }, { href: '/learnmap/secondary/ontology/', label: 'secondary' }, { label: 'ontology' }],
    meta: [
      ['온톨로지 IRI', iriLink(SERIES_IRI)],
      ['현재 버전', `<a href="./${escapeHtml(version)}/"><b>${escapeHtml(version)}</b></a> · ${iriLink(versionIri)}`],
      ['이전 버전', priorVersion ? `<a href="./${escapeHtml(priorVersion)}/">${escapeHtml(priorVersion)}</a>` : '—'],
      ['imports', `<a href="/learnmap/ontology/k12-core/">K-12 코어 ${escapeHtml(coreVersion)}</a> · ${iriLink(CORE_IRI)}`],
      ['생성일', escapeHtml(literal(metadataTerm, RDF.created) ?? '')],
      ['라이선스', iris(metadataTerm, RDF.license).map((value) => iriLink(value)).join(', ')],
      ['권리', escapeHtml(literal(metadataTerm, RDF.rights, 'ko') ?? '')],
      ['용어 수', `클래스 ${groups.class.length} · 객체 속성 ${groups.objectProperty.length} · 데이터 속성 ${groups.datatypeProperty.length}`],
    ],
    notes: [
      `인스턴스 IRI는 <code>${escapeHtml(RESOURCE_IRI)}&lt;id&gt;</code> 형식입니다. 개별 자원 문서는 제공하지 않으며 <a href="./resource/">자원 IRI 안내</a>와 JSON-LD 배포 파일에서 찾습니다. 초등 주제와의 bridge는 <code>https://dexa.art/learnmap/#/topic/…</code> IRI를 그대로 참조합니다.`,
    ],
    sections: [
      { id: 'downloads', heading: '문서와 배포 파일', html: `${renderArtifactTable([
        ...staticFiles.map(describe),
        { name: 'k12-core.ttl', href: '/learnmap/ontology/k12-core.ttl', mediaType: 'text/turtle', bytes: Buffer.byteLength(coreText), sha256: sha256(coreText), note: '초·중등 공용 코어 TBox' },
        ...abox.map((artifact) => ({ name: `${version}/${artifact.name}`, href: `./${version}/${artifact.name}`, mediaType: artifact.entry.mediaType, bytes: artifact.entry.bytes, sha256: artifact.entry.sha256, note: `현재 릴리스 ABox (${version}, 직업계 제외)` })),
      ])}<p class="lh-note">고교 직업계 그래프(<code>high-vocational.ttl</code> 157 MB, <code>.jsonld</code> 188 MB)는 GitHub Pages 파일 한도를 넘어 호스팅하지 않습니다. 저장소에서 <code>bun run build:ontology:full</code>로 생성합니다.</p>` },
      { id: 'classes', heading: `클래스 (${groups.class.length})`, html: renderTermTable(groups.class) },
      { id: 'object-properties', heading: `객체 속성 (${groups.objectProperty.length})`, html: renderTermTable(groups.objectProperty) },
      { id: 'datatype-properties', heading: `데이터 속성 (${groups.datatypeProperty.length})`, html: renderTermTable(groups.datatypeProperty) },
      ...(groups.conceptScheme.length ? [{ id: 'concept-schemes', heading: `개념 스킴 (${groups.conceptScheme.length})`, html: renderTermTable(groups.conceptScheme, { anchorFor: (term) => term.qname ? term.iri.split('#').pop() : `scheme-${term.iri.replace(/\/$/, '').split('/').pop()}` }) }] : []),
      { id: 'schemas', heading: `JSON Schema (${schemaFiles.length})`, html: `<p>데이터 계약의 JSON Schema는 <code>$id</code> 그대로 호스팅됩니다.</p><div class="lh-cards">${schemaFiles.map((file) => `<a class="lh-card" href="/learnmap/schema/secondary/${escapeHtml(file.name)}"><b>${escapeHtml(file.name)}</b><small>${escapeHtml(file.id)}</small>${file.title ? `<p>${escapeHtml(file.title)}</p>` : ''}</a>`).join('')}</div>` },
    ],
    footer: [`저장소: <a href="https://github.com/DECK6/korean-secondary-learning-map">DECK6/korean-secondary-learning-map</a> · 생성: <code>bun run build:hosting</code>`],
  }));
  for (const file of staticFiles) add(`learnmap/secondary/ontology/${file.name}`, file.content);
  add('learnmap/ontology/k12-core.ttl', coreText);
  for (const file of schemaFiles) add(`learnmap/schema/secondary/${file.name}`, file.text);

  add(`${versionDir}/index.html`, renderDocument({
    title: `중등 온톨로지 ${version}`,
    description: `중등 학습지도 온톨로지 버전 ${version}의 배포 파일.`,
    canonicalPath: `${versionDir}/index.html`,
    eyebrow: 'Version IRI',
    heading: `중등 온톨로지 ${version}`,
    lead: `버전 IRI <code>${escapeHtml(versionIri)}</code>의 해석 결과입니다. 시리즈 IRI는 <a href="../">${escapeHtml(SERIES_IRI)}</a>입니다.`,
    crumbs: [{ href: '/learnmap/', label: 'learnmap' }, { href: '/learnmap/secondary/ontology/', label: 'secondary/ontology' }, { label: version }],
    meta: [
      ['버전 IRI', iriLink(versionIri)],
      ['이전 버전', priorVersionIri ? `<a href="../${escapeHtml(priorVersion)}/">${escapeHtml(priorVersion)}</a> · ${iriLink(priorVersionIri)}` : '—'],
      ['그래프 노드', escapeHtml(String(manifest.graphNodeCount))],
      ['직업계 포함', escapeHtml(String(manifest.includesVocational))],
    ],
    sections: [
      { id: 'artifacts', heading: '배포 파일', html: renderArtifactTable([
        ...abox.map((artifact) => ({ name: artifact.name, href: `./${artifact.name}`, mediaType: artifact.entry.mediaType, bytes: artifact.entry.bytes, sha256: artifact.entry.sha256, note: 'ABox (중학교·고등학교 일반)' })),
        { name: 'manifest.json', href: './manifest.json', mediaType: 'application/json', bytes: Buffer.byteLength(`${JSON.stringify(manifest, null, 2)}\n`), sha256: sha256(`${JSON.stringify(manifest, null, 2)}\n`), note: '온톨로지 아티팩트 매니페스트' },
      ]) },
      { id: 'status', heading: '상태', html: '<p class="lh-note">후보(candidate) 릴리스입니다. 형식 게이트(SHACL·SPARQL·동형성) 통과는 내용 전문가 승인이나 권리 해제를 뜻하지 않습니다.</p>' },
    ],
  }));
  for (const artifact of abox) files.push({ path: `${versionDir}/${artifact.name}`, sourcePath: artifact.sourcePath });
  add(`${versionDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  if (priorVersion) {
    add(`learnmap/secondary/ontology/${priorVersion}/index.html`, renderDocument({
      title: `중등 온톨로지 ${priorVersion}`,
      description: `중등 학습지도 온톨로지 이전 버전 ${priorVersion}.`,
      canonicalPath: `learnmap/secondary/ontology/${priorVersion}/index.html`,
      eyebrow: 'Version IRI (superseded)',
      heading: `중등 온톨로지 ${priorVersion}`,
      lead: `이 버전은 <a href="../${escapeHtml(version)}/">${escapeHtml(version)}</a>으로 대체되었습니다. 배포 파일은 더 이상 호스팅하지 않으며 저장소 git 이력에서 확인할 수 있습니다.`,
      crumbs: [{ href: '/learnmap/', label: 'learnmap' }, { href: '/learnmap/secondary/ontology/', label: 'secondary/ontology' }, { label: priorVersion }],
      meta: [['버전 IRI', iriLink(priorVersionIri)], ['대체 버전', `<a href="../${escapeHtml(version)}/">${escapeHtml(version)}</a>`]],
      sections: [],
    }));
  }

  // Resource IRI landing: the ABox mints one IRI per record; examples come from the graph itself.
  const aboxText = await readFile(path.join(releaseDir, 'learning-map.ttl'), 'utf8');
  const resourceExamples = [];
  for (const match of aboxText.matchAll(/^<(https:\/\/dexa\.art\/learnmap\/secondary\/resource\/[^>]+)> a ((?:slm|core):[A-Za-z]+)/gm)) {
    const family = match[2];
    if (!resourceExamples.some((entry) => entry.family === family)) resourceExamples.push({ family, iri: match[1] });
  }
  resourceExamples.sort((a, b) => a.family.localeCompare(b.family, 'en'));
  add('learnmap/secondary/resource/index.html', renderDocument({
    title: '중등 학습지도 자원 IRI',
    description: '중등 학습지도 온톨로지 인스턴스(자원) IRI의 형식과 조회 방법.',
    canonicalPath: 'learnmap/secondary/resource/index.html',
    eyebrow: 'Resource IRIs',
    heading: '중등 학습지도 자원 IRI',
    lead: `과목·성취기준·주제·관계 같은 인스턴스는 <code>${escapeHtml(RESOURCE_IRI)}&lt;percent-encoded id&gt;</code> IRI를 가집니다. 정적 호스팅이라 자원마다 문서를 두지 않으며, 이 이름공간의 IRI는 식별자로만 쓰고 정의는 <a href="../ontology/${escapeHtml(version)}/">배포 파일</a>의 <code>@id</code>로 찾습니다.`,
    crumbs: [{ href: '/learnmap/', label: 'learnmap' }, { href: '/learnmap/secondary/ontology/', label: 'secondary' }, { label: 'resource' }],
    meta: [
      ['이름공간', iriLink(RESOURCE_IRI)],
      ['정의 위치', `<a href="../ontology/${escapeHtml(version)}/learning-map.jsonld"><code>learning-map.jsonld</code></a> · <a href="../ontology/${escapeHtml(version)}/learning-map.ttl"><code>learning-map.ttl</code></a>`],
      ['안정성', '식별자는 원본 데이터 ID에서 결정적으로 만들며 레이블 변경으로 바뀌지 않습니다.'],
    ],
    sections: [
      { id: 'examples', heading: '예시', html: `<div class="lh-table-wrap"><table><thead><tr><th>클래스</th><th>IRI (그래프의 첫 인스턴스)</th></tr></thead><tbody>${resourceExamples.map((entry) => `<tr><td class="term"><code>${escapeHtml(entry.family)}</code></td><td class="mono" style="font-size:12px;overflow-wrap:anywhere">${escapeHtml(entry.iri)}</td></tr>`).join('')}</tbody></table></div>` },
      { id: 'lookup', heading: '조회 방법', html: `<pre class="mono" style="background:var(--panel);padding:12px 14px;border-radius:8px;overflow-x:auto">curl -sL ${escapeHtml(SERIES_IRI)}/${escapeHtml(version)}/learning-map.jsonld | jq '.["@graph"][] | select(.id == "${escapeHtml(resourceExamples[0]?.iri ?? RESOURCE_IRI)}")'</pre>` },
    ],
  }));

  // --- IRI coverage ---
  const iriSet = new Set();
  const sourceFiles = [
    // Test fixtures mint throw-away IRIs under secondary/fixture/ and are not part of the release.
    ...(await walkFiles(ontologyDir)).filter((file) => /\.(ttl|jsonld|json|rq)$/.test(file) && !file.includes(`${path.sep}fixtures${path.sep}`)),
    ...(await walkFiles(path.join(root, 'schema'))).filter((file) => file.endsWith('.json')),
  ];
  for (const file of sourceFiles) for (const iri of collectSiteIris(await readFile(file, 'utf8'))) iriSet.add(iri);
  for (const iri of collectSiteIris(aboxText)) iriSet.add(iri);
  const hostedPaths = files.map((file) => file.path);
  const coverage = resolveIriCoverage(iriSet, {
    hostedPaths,
    assumedPaths: [APP_PATH],
    assumedPrefixes: ['learnmap/ontology/', 'learnmap/vocab/'],
    prefixLandings: [{ iriPrefix: RESOURCE_IRI, path: 'learnmap/secondary/resource/index.html' }],
  });
  if (coverage.uncovered.length) {
    throw new Error(`unhosted IRIs: ${coverage.uncovered.slice(0, 5).map((entry) => `${entry.iri} -> ${entry.path}`).join(' | ')}`);
  }

  return writeHostingTree(distDir, files, {
    formatVersion: 1,
    repository: 'korean-secondary-learning-map',
    ontologyIri: SERIES_IRI,
    ontologyVersion: version,
    coreVersion,
    ownedPrefixes: ['learnmap/secondary/', 'learnmap/schema/secondary/'],
    sharedPaths: ['learnmap/ontology/k12-core.ttl'],
    pinnedPaths: [],
    assumedPaths: [APP_PATH, 'learnmap/ontology/index.html', 'learnmap/ontology/k12-core/index.html', 'learnmap/vocab/facet/index.html'],
    prefixLandings: [{ iriPrefix: RESOURCE_IRI, path: 'learnmap/secondary/resource/index.html' }],
    iriCount: iriSet.size,
    iriCoverage: summariseCoverage(coverage.covered),
  });
}

async function main() {
  const manifest = await buildHosting();
  const bytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
  console.log(`hosting build passed: ${manifest.files.length} files (${formatBytes(bytes)}), ${manifest.iriCount} site IRIs resolved to ${manifest.iriCoverage.length} documents`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}
