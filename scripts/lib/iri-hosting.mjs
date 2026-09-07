// Shared IRI hosting toolkit for the learning-map repositories.
//
// Both korean-elementary-learning-map and korean-secondary-learning-map keep a byte-identical
// copy of this module (tests/iri-hosting.test.mjs checks the sibling copy when present). It turns
// the ontology sources of a repository into a static tree under dist/hosting/ that GitHub Pages can
// serve at https://dexa.art/learnmap/..., so every ontology, vocabulary, version and schema IRI
// dereferences to a real document. No runtime dependencies: the Turtle scanner only needs to read
// the hand-authored TBox files of this project, not arbitrary RDF.

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SITE_ORIGIN = 'https://dexa.art';
export const SITE_PREFIX = `${SITE_ORIGIN}/learnmap`;

const HOSTED_EXTENSIONS = new Set(['ttl', 'jsonld', 'json', 'html', 'css', 'js', 'svg', 'png', 'md', 'txt', 'xml', 'rq']);
const MEDIA_TYPES = Object.freeze({
  ttl: 'text/turtle',
  jsonld: 'application/ld+json',
  json: 'application/json',
  html: 'text/html',
  md: 'text/markdown',
  txt: 'text/plain',
  rq: 'application/sparql-query',
});
const WELL_KNOWN_PREFIXES = Object.freeze({
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  dcterms: 'http://purl.org/dc/terms/',
  dct: 'http://purl.org/dc/terms/',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
});
export const RDF = Object.freeze({
  type: `${WELL_KNOWN_PREFIXES.rdf}type`,
  label: `${WELL_KNOWN_PREFIXES.rdfs}label`,
  comment: `${WELL_KNOWN_PREFIXES.rdfs}comment`,
  subClassOf: `${WELL_KNOWN_PREFIXES.rdfs}subClassOf`,
  subPropertyOf: `${WELL_KNOWN_PREFIXES.rdfs}subPropertyOf`,
  domain: `${WELL_KNOWN_PREFIXES.rdfs}domain`,
  range: `${WELL_KNOWN_PREFIXES.rdfs}range`,
  seeAlso: `${WELL_KNOWN_PREFIXES.rdfs}seeAlso`,
  Class: `${WELL_KNOWN_PREFIXES.owl}Class`,
  ObjectProperty: `${WELL_KNOWN_PREFIXES.owl}ObjectProperty`,
  DatatypeProperty: `${WELL_KNOWN_PREFIXES.owl}DatatypeProperty`,
  AnnotationProperty: `${WELL_KNOWN_PREFIXES.owl}AnnotationProperty`,
  Ontology: `${WELL_KNOWN_PREFIXES.owl}Ontology`,
  NamedIndividual: `${WELL_KNOWN_PREFIXES.owl}NamedIndividual`,
  equivalentClass: `${WELL_KNOWN_PREFIXES.owl}equivalentClass`,
  equivalentProperty: `${WELL_KNOWN_PREFIXES.owl}equivalentProperty`,
  imports: `${WELL_KNOWN_PREFIXES.owl}imports`,
  versionIRI: `${WELL_KNOWN_PREFIXES.owl}versionIRI`,
  versionInfo: `${WELL_KNOWN_PREFIXES.owl}versionInfo`,
  priorVersion: `${WELL_KNOWN_PREFIXES.owl}priorVersion`,
  Concept: `${WELL_KNOWN_PREFIXES.skos}Concept`,
  ConceptScheme: `${WELL_KNOWN_PREFIXES.skos}ConceptScheme`,
  inScheme: `${WELL_KNOWN_PREFIXES.skos}inScheme`,
  prefLabel: `${WELL_KNOWN_PREFIXES.skos}prefLabel`,
  definition: `${WELL_KNOWN_PREFIXES.skos}definition`,
  notation: `${WELL_KNOWN_PREFIXES.skos}notation`,
  exactMatch: `${WELL_KNOWN_PREFIXES.skos}exactMatch`,
  hasTopConcept: `${WELL_KNOWN_PREFIXES.skos}hasTopConcept`,
  title: `${WELL_KNOWN_PREFIXES.dcterms}title`,
  description: `${WELL_KNOWN_PREFIXES.dcterms}description`,
  created: `${WELL_KNOWN_PREFIXES.dcterms}created`,
  license: `${WELL_KNOWN_PREFIXES.dcterms}license`,
  rights: `${WELL_KNOWN_PREFIXES.dcterms}rights`,
  source: `${WELL_KNOWN_PREFIXES.dcterms}source`,
});

// ---------------------------------------------------------------------------
// Hashing and file helpers
// ---------------------------------------------------------------------------

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function sha256File(filePath) {
  return sha256(await readFile(filePath));
}

export async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function atomicWrite(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, contents);
  await rename(temporary, filePath);
}

export async function walkFiles(root) {
  const out = [];
  async function visit(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  await visit(root);
  return out.sort((a, b) => a.localeCompare(b, 'en'));
}

export function mediaTypeFor(filePath) {
  const extension = filePath.split('.').pop().toLowerCase();
  return MEDIA_TYPES[extension] ?? 'application/octet-stream';
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// IRI <-> hosted path mapping
// ---------------------------------------------------------------------------

// A dexa.art IRI resolves on GitHub Pages to: the file itself when the last segment carries a
// hosted extension, `<dir>/index.html` when the path ends with `/`, and `<path>/index.html` for
// extensionless paths (Pages answers `/x` with a 301 to `/x/`). Fragments never reach the server,
// so `ontology#Term` and `vocab/#/Scheme/term` both land on the namespace document.
export function iriToHostedPath(iri) {
  let url;
  try {
    url = new URL(iri);
  } catch {
    return null;
  }
  if (url.origin !== SITE_ORIGIN) return null;
  const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (pathname === '') return 'index.html';
  if (pathname.endsWith('/')) return `${pathname}index.html`;
  const last = pathname.split('/').pop();
  const extension = last.includes('.') ? last.split('.').pop().toLowerCase() : '';
  if (HOSTED_EXTENSIONS.has(extension)) return pathname;
  return `${pathname}/index.html`;
}

export function hostedPathToUrl(hostedPath) {
  const clean = hostedPath.replace(/index\.html$/, '');
  return `${SITE_ORIGIN}/${clean.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`;
}

// Collects every https://dexa.art/learnmap IRI mentioned in a text blob (Turtle, JSON-LD, JSON).
export function collectSiteIris(text) {
  const found = new Set();
  const pattern = /https:\/\/dexa\.art\/learnmap[^\s"'<>)\]}]*/g;
  for (const match of text.matchAll(pattern)) {
    let iri = match[0].replace(/[.,;]+$/, '');
    found.add(iri);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Minimal Turtle statement scanner for the project's hand-authored TBox files
// ---------------------------------------------------------------------------

function tokenizeObjects(text) {
  // Splits a predicate-object list on top-level `;` and each object list on top-level `,`.
  const statements = [];
  let depth = 0;
  let quote = null;
  let current = '';
  const flush = () => {
    if (current.trim()) statements.push(current.trim());
    current = '';
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      current += char;
      if (char === '\\') {
        current += text[index + 1] ?? '';
        index += 1;
      } else if (text.startsWith(quote, index)) {
        current += quote.slice(1);
        index += quote.length - 1;
        quote = null;
      }
      continue;
    }
    if (text.startsWith('"""', index)) {
      quote = '"""';
      current += '"""';
      index += 2;
      continue;
    }
    if (char === '"') {
      quote = '"';
      current += char;
      continue;
    }
    if (char === '<') depth += 1;
    if (char === '>') depth -= 1;
    if (char === '[' || char === '(') depth += 1;
    if (char === ']' || char === ')') depth -= 1;
    if (char === ';' && depth === 0) {
      flush();
      continue;
    }
    current += char;
  }
  flush();
  return statements;
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      current += char;
      if (char === '\\') {
        current += text[index + 1] ?? '';
        index += 1;
      } else if (text.startsWith(quote, index)) {
        current += quote.slice(1);
        index += quote.length - 1;
        quote = null;
      }
      continue;
    }
    if (text.startsWith('"""', index)) {
      quote = '"""';
      current += '"""';
      index += 2;
      continue;
    }
    if (char === '"') {
      quote = '"';
      current += char;
      continue;
    }
    if (char === '<' || char === '[' || char === '(') depth += 1;
    if (char === '>' || char === ']' || char === ')') depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function expandTerm(token, prefixes) {
  if (token.startsWith('<') && token.endsWith('>')) return token.slice(1, -1);
  if (token === 'a') return RDF.type;
  const colon = token.indexOf(':');
  if (colon === -1) return null;
  const prefix = token.slice(0, colon);
  const local = token.slice(colon + 1);
  const base = prefixes[prefix] ?? WELL_KNOWN_PREFIXES[prefix];
  if (!base) return null;
  return `${base}${local}`;
}

function parseObject(token, prefixes) {
  const trimmed = token.trim();
  if (trimmed.startsWith('"')) {
    const match = trimmed.match(/^("""[\s\S]*?"""|"(?:[^"\\]|\\.)*")(?:@([A-Za-z-]+)|\^\^(\S+))?$/);
    if (!match) return { kind: 'literal', value: trimmed };
    const raw = match[1].startsWith('"""') ? match[1].slice(3, -3) : match[1].slice(1, -1);
    const value = raw.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    return { kind: 'literal', value, lang: match[2] ?? null, datatype: match[3] ? expandTerm(match[3], prefixes) : null };
  }
  if (trimmed.startsWith('[') || trimmed.startsWith('(')) return { kind: 'blank', value: trimmed };
  if (trimmed === 'true' || trimmed === 'false') return { kind: 'literal', value: trimmed, datatype: `${WELL_KNOWN_PREFIXES.xsd}boolean` };
  if (/^[-+]?\d/.test(trimmed)) return { kind: 'literal', value: trimmed };
  const iri = expandTerm(trimmed, prefixes);
  return iri ? { kind: 'iri', value: iri, qname: trimmed } : { kind: 'unknown', value: trimmed };
}

export function scanTurtle(text) {
  const prefixes = {};
  const statements = [];
  let buffer = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();
    if (trimmed === '' && buffer.length === 0) continue;
    if (trimmed.startsWith('#') && buffer.length === 0) continue;
    const prefixMatch = trimmed.match(/^@prefix\s+([A-Za-z0-9_-]*):\s+<([^>]*)>\s*\.$/);
    if (prefixMatch && buffer.length === 0) {
      prefixes[prefixMatch[1]] = prefixMatch[2];
      continue;
    }
    if (trimmed.startsWith('#')) continue;
    buffer.push(line);
    if (trimmed === '.' || trimmed.endsWith(' .')) {
      const statement = buffer.join('\n').trim().replace(/\s*\.$/, '');
      buffer = [];
      if (statement) statements.push(statement);
    }
  }
  const terms = new Map();
  for (const statement of statements) {
    const subjectMatch = statement.match(/^(<[^>]+>|[A-Za-z0-9_-]*:[^\s;]+)\s+([\s\S]*)$/);
    if (!subjectMatch) continue;
    const subjectIri = expandTerm(subjectMatch[1], prefixes);
    if (!subjectIri) continue;
    const term = terms.get(subjectIri) ?? { iri: subjectIri, qname: subjectMatch[1].startsWith('<') ? null : subjectMatch[1], types: [], props: new Map() };
    for (const predicateObjects of tokenizeObjects(subjectMatch[2])) {
      const match = predicateObjects.match(/^(<[^>]+>|a|[A-Za-z0-9_-]*:[^\s]+)\s+([\s\S]*)$/);
      if (!match) continue;
      const predicate = expandTerm(match[1], prefixes);
      if (!predicate) continue;
      const objects = splitTopLevel(match[2], ',').map((token) => parseObject(token, prefixes));
      if (predicate === RDF.type) {
        for (const object of objects) if (object.kind === 'iri' && !term.types.includes(object.value)) term.types.push(object.value);
        continue;
      }
      const list = term.props.get(predicate) ?? [];
      list.push(...objects);
      term.props.set(predicate, list);
    }
    terms.set(subjectIri, term);
  }
  return { prefixes, terms: [...terms.values()] };
}

export function localName(iri) {
  const hash = iri.lastIndexOf('#');
  if (hash !== -1) return iri.slice(hash + 1);
  return iri.slice(iri.lastIndexOf('/') + 1);
}

export function literal(term, predicate, lang = null) {
  const values = term.props.get(predicate) ?? [];
  const literals = values.filter((value) => value.kind === 'literal');
  if (lang) {
    const exact = literals.find((value) => value.lang === lang);
    if (exact) return exact.value;
  }
  const untagged = literals.find((value) => !value.lang);
  return (untagged ?? literals[0])?.value ?? null;
}

export function iris(term, predicate) {
  return (term.props.get(predicate) ?? []).filter((value) => value.kind === 'iri').map((value) => value.value);
}

export function classifyTerm(term) {
  if (term.types.includes(RDF.Ontology)) return 'ontology';
  if (term.types.includes(RDF.Class)) return 'class';
  if (term.types.includes(RDF.ObjectProperty)) return 'objectProperty';
  if (term.types.includes(RDF.DatatypeProperty)) return 'datatypeProperty';
  if (term.types.includes(RDF.AnnotationProperty)) return 'annotationProperty';
  if (term.types.includes(RDF.ConceptScheme)) return 'conceptScheme';
  if (term.types.includes(RDF.Concept)) return 'concept';
  if (term.types.includes(RDF.NamedIndividual)) return 'individual';
  return 'other';
}

// ---------------------------------------------------------------------------
// HTML rendering (DEXA light chrome: Paper + Signal Orange, mono metadata)
// ---------------------------------------------------------------------------

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PAGE_CSS = `
:root{--paper:#F5F1E6;--panel:#EBE4D3;--panel2:#E3DBC6;--ink:#17181B;--line:#D9D0BB;--muted:#6A644F;--orange:#FF5A1F;--orange-hover:#E64D14;--cyan:#5EE7F3;--ink-display:#0D0E10;--font-sans:'Space Grotesk','Pretendard Variable',Pretendard,'Noto Sans KR',sans-serif;--font-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;}
*{box-sizing:border-box;}
html{scroll-behavior:smooth;scroll-padding-top:24px;}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--font-sans);line-height:1.55;-webkit-font-smoothing:antialiased;}
a{color:inherit;text-decoration:none;}
a:hover{color:var(--orange);}
code,pre,.mono{font-family:var(--font-mono);font-size:0.86em;}
.lh-nav{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:12px 32px;min-height:60px;border-bottom:1px solid var(--line);background:rgba(245,241,230,0.92);position:sticky;top:0;z-index:5;backdrop-filter:blur(6px);}
.lh-brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-0.02em;}
.lh-brand .dot{color:var(--orange);}
.lh-brand .tag{font-family:var(--font-mono);font-size:11px;color:var(--muted);letter-spacing:0.04em;padding-left:10px;border-left:1px solid var(--line);font-weight:500;}
.lh-links{display:flex;gap:20px;flex-wrap:wrap;font-family:var(--font-mono);font-size:11px;letter-spacing:0.04em;}
.lh-shell{width:min(100% - 2rem,1040px);margin:0 auto;padding:36px 0 72px;}
.lh-crumbs{font-family:var(--font-mono);font-size:11px;color:var(--muted);letter-spacing:0.03em;display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;}
.lh-crumbs span{color:var(--line);}
.lh-eyebrow{font-family:var(--font-mono);font-size:11px;color:var(--orange);letter-spacing:0.12em;text-transform:uppercase;margin:0 0 8px;}
h1{font-size:clamp(26px,4vw,38px);line-height:1.15;letter-spacing:-0.02em;margin:0 0 12px;}
h2{font-size:20px;letter-spacing:-0.01em;margin:44px 0 12px;padding-top:12px;border-top:1px solid var(--line);}
h3{font-size:16px;margin:28px 0 8px;}
.lh-lead{font-size:16px;color:var(--muted);max-width:72ch;margin:0 0 24px;}
.lh-meta{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;padding:16px 18px;background:var(--panel);border:1px solid var(--line);border-radius:10px;font-size:13px;margin:0 0 8px;}
.lh-meta dt{font-family:var(--font-mono);font-size:11px;color:var(--muted);letter-spacing:0.04em;text-transform:uppercase;padding-top:2px;}
.lh-meta dd{margin:0;overflow-wrap:anywhere;}
.lh-note{font-size:13px;color:var(--muted);border-left:3px solid var(--orange);padding:6px 12px;margin:16px 0;background:rgba(255,90,31,0.06);border-radius:0 8px 8px 0;}
.lh-table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:#fff;}
table{border-collapse:collapse;width:100%;font-size:13px;}
th,td{text-align:left;vertical-align:top;padding:9px 12px;border-bottom:1px solid var(--line);}
th{font-family:var(--font-mono);font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:var(--muted);background:var(--panel);font-weight:600;}
tbody tr:last-child td{border-bottom:none;}
tbody tr:target{background:rgba(94,231,243,0.22);}
tbody tr:target td:first-child{box-shadow:inset 3px 0 0 var(--orange);}
td.term{white-space:nowrap;}
td.term code{font-weight:600;}
.lh-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin:12px 0;}
.lh-card{display:block;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:#fff;}
.lh-card:hover{border-color:var(--orange);color:inherit;}
.lh-card b{display:block;margin-bottom:4px;}
.lh-card small{display:block;color:var(--muted);font-family:var(--font-mono);font-size:11px;overflow-wrap:anywhere;}
.lh-card p{margin:6px 0 0;font-size:13px;color:var(--muted);}
.lh-anchor{color:var(--muted);font-family:var(--font-mono);font-size:11px;margin-left:6px;}
.lh-anchor:hover{color:var(--orange);}
footer{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);}
footer p{margin:4px 0;}
@media (max-width:640px){.lh-nav{padding:10px 16px;}.lh-meta{grid-template-columns:1fr;}}
`;

export function renderDocument({
  title,
  description,
  canonicalPath,
  eyebrow,
  heading,
  lead,
  crumbs = [],
  meta = [],
  notes = [],
  sections = [],
  footer = [],
  lang = 'ko',
}) {
  const canonical = hostedPathToUrl(canonicalPath);
  const crumbHtml = crumbs.length
    ? `<nav class="lh-crumbs" aria-label="경로">${crumbs
        .map((crumb, index) => `${index ? '<span>/</span>' : ''}${crumb.href ? `<a href="${escapeHtml(crumb.href)}">${escapeHtml(crumb.label)}</a>` : `<b>${escapeHtml(crumb.label)}</b>`}`)
        .join('')}</nav>`
    : '';
  const metaHtml = meta.length
    ? `<dl class="lh-meta">${meta.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${value}</dd>`).join('')}</dl>`
    : '';
  const notesHtml = notes.map((note) => `<p class="lh-note">${note}</p>`).join('');
  const sectionsHtml = sections
    .map((section) => `<section${section.id ? ` id="${escapeHtml(section.id)}"` : ''}>${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''}${section.html}</section>`)
    .join('\n');
  const footerHtml = footer.map((line) => `<p>${line}</p>`).join('');
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — DEXA Learnmap</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta name="robots" content="index,follow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>${PAGE_CSS}</style>
</head>
<body>
<header class="lh-nav">
  <a class="lh-brand" href="/"><span>DEXA<span class="dot">.</span></span><span class="tag">LEARNMAP / ONTOLOGY</span></a>
  <nav class="lh-links" aria-label="학습지도 문서">
    <a href="/learnmap/ontology/">초등 온톨로지</a>
    <a href="/learnmap/secondary/ontology/">중등 온톨로지</a>
    <a href="/learnmap/ontology/k12-core/">K-12 코어</a>
    <a href="/learnmap/vocab/">통제 어휘</a>
    <a href="/learnmap/">배움 지도</a>
  </nav>
</header>
<main class="lh-shell">
${crumbHtml}
${eyebrow ? `<p class="lh-eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
<h1>${escapeHtml(heading ?? title)}</h1>
${lead ? `<p class="lh-lead">${lead}</p>` : ''}
${metaHtml}
${notesHtml}
${sectionsHtml}
<footer>
${footerHtml}
<p>이 온톨로지는 독립적으로 구축한 비공식 자료이며 교육부·국가교육위원회·NCIC의 공식 온톨로지가 아닙니다. 교육과정 원문의 권리는 원 출처의 고지를 따릅니다.</p>
</footer>
</main>
</body>
</html>
`;
}

export function iriLink(iri, label = null) {
  return `<a class="mono" href="${escapeHtml(iri)}">${escapeHtml(label ?? iri)}</a>`;
}

export function renderTermTable(terms, { anchorFor = (term) => localName(term.iri), relationColumns = true } = {}) {
  if (terms.length === 0) return '<p class="lh-note">항목 없음</p>';
  const rows = terms
    .map((term) => {
      const anchor = anchorFor(term);
      const labelKo = literal(term, RDF.label, 'ko') ?? literal(term, RDF.prefLabel, 'ko');
      const labelEn = literal(term, RDF.label, 'en') ?? literal(term, RDF.prefLabel, 'en');
      const definition = literal(term, RDF.comment, 'ko') ?? literal(term, RDF.definition, 'ko') ?? literal(term, RDF.comment, 'en') ?? literal(term, RDF.definition, 'en') ?? literal(term, RDF.comment) ?? literal(term, RDF.definition) ?? '';
      const relations = [];
      if (relationColumns) {
        for (const [key, predicate] of [['subClassOf', RDF.subClassOf], ['subPropertyOf', RDF.subPropertyOf], ['domain', RDF.domain], ['range', RDF.range], ['equivalentClass', RDF.equivalentClass], ['equivalentProperty', RDF.equivalentProperty], ['exactMatch', RDF.exactMatch], ['inScheme', RDF.inScheme]]) {
          const values = iris(term, predicate);
          if (values.length) relations.push(`<b>${key}</b> ${values.map((value) => iriLink(value, compactName(value, term))).join(', ')}`);
        }
      }
      const labels = [labelKo, labelEn].filter(Boolean).map(escapeHtml).join('<br>');
      return `<tr id="${escapeHtml(anchor)}"><td class="term"><code>${escapeHtml(term.qname ?? localName(term.iri))}</code><a class="lh-anchor" href="#${escapeHtml(anchor)}" aria-label="링크">#</a></td><td>${labels}</td><td>${escapeHtml(definition)}</td>${relationColumns ? `<td class="mono" style="font-size:12px">${relations.join('<br>')}</td>` : ''}</tr>`;
    })
    .join('\n');
  return `<div class="lh-table-wrap"><table><thead><tr><th>용어</th><th>레이블</th><th>정의</th>${relationColumns ? '<th>관계</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function compactName(iri, term) {
  if (term?.qname) {
    const prefix = term.qname.split(':')[0];
    const base = term.iri.slice(0, term.iri.length - localName(term.iri).length);
    if (iri.startsWith(base)) return `${prefix}:${iri.slice(base.length)}`;
  }
  if (iri.startsWith('https://dexa.art/learnmap/ontology/k12-core#')) return `core:${localName(iri)}`;
  if (iri.startsWith('https://dexa.art/learnmap/ontology#')) return `lm:${localName(iri)}`;
  if (iri.startsWith('https://dexa.art/learnmap/secondary/ontology#')) return `slm:${localName(iri)}`;
  if (iri.startsWith('https://dexa.art/learnmap/vocab/#/')) return iri.slice('https://dexa.art/learnmap/vocab/#/'.length);
  if (iri.startsWith('https://dexa.art/learnmap/vocab/facet/')) return `facet/${localName(iri)}`;
  for (const [prefix, base] of Object.entries(WELL_KNOWN_PREFIXES)) if (iri.startsWith(base)) return `${prefix}:${iri.slice(base.length)}`;
  return iri;
}

export function renderArtifactTable(artifacts) {
  const rows = artifacts
    .map((artifact) => `<tr><td class="term"><a href="${escapeHtml(artifact.href)}"><code>${escapeHtml(artifact.name)}</code></a></td><td>${escapeHtml(artifact.mediaType)}</td><td class="mono">${escapeHtml(formatBytes(artifact.bytes))}</td><td class="mono" style="font-size:11px;overflow-wrap:anywhere">${escapeHtml(artifact.sha256)}</td><td>${escapeHtml(artifact.note ?? '')}</td></tr>`)
    .join('');
  return `<div class="lh-table-wrap"><table><thead><tr><th>파일</th><th>미디어 타입</th><th>크기</th><th>SHA-256</th><th>비고</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// Hosting tree assembly
// ---------------------------------------------------------------------------

// files: [{ path: 'learnmap/...', content?: string|Buffer, sourcePath?: string }]
export async function writeHostingTree(distDir, files, manifestExtras) {
  await rm(distDir, { recursive: true, force: true });
  const seen = new Set();
  const entries = [];
  for (const file of files) {
    if (seen.has(file.path)) throw new Error(`duplicate hosted path ${file.path}`);
    seen.add(file.path);
    const buffer = file.content !== undefined ? Buffer.from(file.content) : await readFile(file.sourcePath);
    await atomicWrite(path.join(distDir, file.path), buffer);
    entries.push({ path: file.path, bytes: buffer.length, sha256: sha256(buffer), mediaType: mediaTypeFor(file.path) });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = { ...manifestExtras, files: entries };
  await atomicWrite(path.join(distDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// Maps every site IRI found in `texts` to the hosted path that must exist. Returns the sorted list
// of { iri, path, coveredBy } plus the list of IRIs that nothing hosts.
export function resolveIriCoverage(iriSet, { hostedPaths, assumedPaths = [], assumedPrefixes = [], prefixLandings = [], ignoredPrefixes = [] }) {
  const hosted = new Set(hostedPaths);
  const assumed = new Set(assumedPaths);
  const covered = [];
  const uncovered = [];
  for (const iri of [...iriSet].sort()) {
    if (ignoredPrefixes.some((prefix) => iri.startsWith(prefix))) continue;
    const hostedPath = iriToHostedPath(iri);
    if (!hostedPath) continue;
    if (hosted.has(hostedPath)) covered.push({ iri, path: hostedPath, coveredBy: 'hosted' });
    else if (assumed.has(hostedPath) || assumedPrefixes.some((prefix) => hostedPath.startsWith(prefix))) covered.push({ iri, path: hostedPath, coveredBy: 'assumed' });
    else {
      const landing = prefixLandings.find((entry) => iri.startsWith(entry.iriPrefix));
      if (landing) covered.push({ iri, path: landing.path, coveredBy: 'prefix-landing' });
      else uncovered.push({ iri, path: hostedPath });
    }
  }
  return { covered, uncovered };
}

// Summarises IRI coverage per resolved path so the manifest stays small even when the ABox mints
// hundreds of thousands of instance IRIs under one landing document.
export function summariseCoverage(covered) {
  const byPath = new Map();
  for (const entry of covered) {
    const bucket = byPath.get(entry.path) ?? { path: entry.path, coveredBy: entry.coveredBy, iriCount: 0, examples: [] };
    bucket.iriCount += 1;
    if (bucket.examples.length < 3) bucket.examples.push(entry.iri);
    byPath.set(entry.path, bucket);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

// ---------------------------------------------------------------------------
// Deployment and live checks
// ---------------------------------------------------------------------------

export async function compareWithDeploy(manifest, deployRoot) {
  const missing = [];
  const drift = [];
  let ok = 0;
  for (const file of manifest.files) {
    const target = path.join(deployRoot, file.path);
    if (!(await pathExists(target))) {
      missing.push(file.path);
      continue;
    }
    const digest = await sha256File(target);
    if (digest !== file.sha256) drift.push({ path: file.path, expected: file.sha256, actual: digest });
    else ok += 1;
  }
  const assumedMissing = [];
  for (const assumedPath of manifest.assumedPaths ?? []) {
    if (!(await pathExists(path.join(deployRoot, assumedPath)))) assumedMissing.push(assumedPath);
  }
  return { ok, missing, drift, assumedMissing };
}

export async function compareLive(manifest, { origin = SITE_ORIGIN, fetchImpl = globalThis.fetch, onProgress = () => {} } = {}) {
  const failures = [];
  let ok = 0;
  for (const file of manifest.files) {
    const url = `${origin}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
    try {
      const response = await fetchImpl(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
      if (!response.ok) {
        failures.push({ path: file.path, reason: `HTTP ${response.status}` });
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const digest = sha256(buffer);
      if (digest !== file.sha256) failures.push({ path: file.path, reason: `sha256 ${digest.slice(0, 12)} != ${file.sha256.slice(0, 12)} (${buffer.length} bytes)` });
      else ok += 1;
    } catch (error) {
      failures.push({ path: file.path, reason: error.message });
    }
    onProgress(file.path);
  }
  const iriFailures = [];
  for (const entry of manifest.iriCoverage ?? []) {
    const expectedUrl = hostedPathToUrl(entry.path);
    const probe = entry.examples[0];
    try {
      const response = await fetchImpl(probe, { redirect: 'follow', method: 'GET', headers: { 'cache-control': 'no-cache' } });
      if (!response.ok) iriFailures.push({ iri: probe, reason: `HTTP ${response.status}` });
      else if (response.url.split('#')[0] !== expectedUrl && response.url.split('#')[0] !== `${expectedUrl}index.html`) {
        iriFailures.push({ iri: probe, reason: `resolved to ${response.url}, expected ${expectedUrl}` });
      }
    } catch (error) {
      iriFailures.push({ iri: probe, reason: error.message });
    }
  }
  return { ok, failures, iriFailures };
}
