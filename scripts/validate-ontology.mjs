import { createReadStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataFactory, Parser as N3Parser, Store, StreamParser } from 'n3';
import { Parser as SparqlParser } from 'sparqljs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLM = 'https://dexa.art/learnmap/secondary/ontology#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const errors = [];
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const named = (value) => ({ termType: 'NamedNode', value });

function parseTurtle(path) {
  try {
    return new N3Parser().parse(path);
  } catch (error) {
    errors.push(`Turtle parse failed: ${error.message}`);
    return [];
  }
}

const staticQuads = [];
for (const file of ['learning-map.ttl', 'shapes.ttl', 'metadata.ttl']) {
  staticQuads.push(...parseTurtle(await readFile(join(root, 'ontology', file), 'utf8')));
}
parseTurtle(await readFile(join(root, 'ontology/fixtures/canonical-positive.ttl'), 'utf8'));

const reasoningQuads = parseTurtle(await readFile(join(root, 'ontology/fixtures/reasoning.ttl'), 'utf8'));
const reasoningStore = new Store([...staticQuads, ...reasoningQuads]);
const RDFS_DOMAIN = 'http://www.w3.org/2000/01/rdf-schema#domain';
const inferredTypes = new Set();
for (const domainQuad of reasoningStore.getQuads(null, named(RDFS_DOMAIN), null, null)) {
  for (const usage of reasoningStore.getQuads(null, domainQuad.subject, null, null)) inferredTypes.add(`${usage.subject.value}|${domainQuad.object.value}`);
}
if (!inferredTypes.has('https://dexa.art/learnmap/secondary/fixture/reasoning/standard|https://dexa.art/learnmap/secondary/ontology#AchievementStandard')) errors.push('bounded RDFS/OWL-RL domain inference failed for AchievementStandard');
if (!inferredTypes.has('https://dexa.art/learnmap/secondary/fixture/reasoning/course|https://dexa.art/learnmap/secondary/ontology#Course')) errors.push('bounded RDFS/OWL-RL domain inference failed for Course');
if (inferredTypes.has('https://dexa.art/learnmap/secondary/fixture/reasoning/course-relation|https://dexa.art/learnmap/secondary/ontology#TransitionAlignment')) errors.push('CourseRelation was incorrectly inferred as TransitionAlignment');

const queryFiles = (await readdir(join(root, 'ontology/queries'))).filter((name) => name.endsWith('.rq')).sort();
if (queryFiles.length !== 20) errors.push(`expected 20 competency queries, found ${queryFiles.length}`);
const sparqlParser = new SparqlParser();
for (const file of queryFiles) {
  try {
    sparqlParser.parse(await readFile(join(root, 'ontology/queries', file), 'utf8'));
  } catch (error) {
    errors.push(`${file}: SPARQL parse failed: ${error.message}`);
  }
}

const adversarialText = await readFile(join(root, 'ontology/fixtures/adversarial/all.ttl'), 'utf8');
const adversarial = new Store(parseTurtle(adversarialText));
const objects = (subject, predicate) => adversarial.getObjects(named(subject), named(`${SLM}${predicate}`), null);
const subjects = (predicate, object) => adversarial.getSubjects(named(`${SLM}${predicate}`), object ? named(object) : null, null);
const types = (className) => new Set(adversarial.getSubjects(named(RDF_TYPE), named(`${SLM}${className}`), null).map((term) => term.value));
const violations = new Set();
const courses = types('Course');
const offerings = types('CourseOffering');
for (const course of courses) {
  if (objects(course, 'schoolLevel').some((term) => term.value === 'high') && objects(course, 'grade').length) violations.add('HIGH_GRADE_FORCED');
  if (offerings.has(course)) violations.add('COURSE_OFFERING_CONFLATION');
  if (!objects(course, 'courseCategory').length) violations.add('COURSE_CATEGORY_MISSING');
}
for (const relation of types('LearningRelation')) {
  const kind = objects(relation, 'relationKind')[0]?.value;
  const status = objects(relation, 'reviewStatus')[0]?.value;
  if (kind === 'official-prerequisite' && status === 'candidate') violations.add('CANDIDATE_OFFICIALIZED');
  const before = objects(relation, 'prerequisiteTopic')[0]?.value;
  const after = objects(relation, 'dependentTopic')[0]?.value;
  if (before && before === after) violations.add('LEARNING_RELATION_CYCLE');
}
for (const standard of types('AchievementStandard')) {
  if (objects(standard, 'verificationStatus').some((term) => term.value === 'official-source-checked') && !objects(standard, 'hasLocator').length) violations.add('OFFICIAL_LOCATOR_MISSING');
}
const relationKeys = new Set();
for (const relation of types('LearningRelation')) {
  const key = ['prerequisiteTopic', 'dependentTopic', 'relationKind'].map((predicate) => objects(relation, predicate)[0]?.value ?? '').join('|');
  if (relationKeys.has(key)) violations.add('DUPLICATE_RELATION_ASSERTION');
  relationKeys.add(key);
}
for (const pathway of types('IllustrativePathway')) if (!objects(pathway, 'notOfficialRequirement').some((term) => term.value === 'true')) violations.add('PATHWAY_BOUNDARY_MISSING');
if (subjects('replaces').some((term) => term.value.includes('reminted-elementary'))) violations.add('ELEMENTARY_IRI_REMINTED');
for (const release of types('CurriculumRelease')) {
  if (objects(release, 'rightsStatus').some((term) => term.value === 'released') && objects(release, 'verificationStatus').some((term) => term.value === 'formal-validation-passed')) violations.add('RIGHTS_HOLD_BYPASSED');
}
const expectedViolations = (await readJson(join(root, 'ontology/fixtures/adversarial/expected.json'))).expectedViolationCodes;
for (const code of expectedViolations) if (!violations.has(code)) errors.push(`adversarial fixture did not trigger ${code}`);
for (const code of violations) if (!expectedViolations.includes(code)) errors.push(`unexpected adversarial violation ${code}`);

const manifest = await readJson(join(root, 'dist/ontology/manifest.json'));
let tripleCount = 0;
function termKey(term) {
  if (term.termType === 'NamedNode') return `<${term.value}>`;
  if (term.termType === 'BlankNode') return `_:${term.value}`;
  if (term.termType === 'DefaultGraph') return '';
  return `${JSON.stringify(term.value)}${term.language ? `@${term.language}` : `^^<${term.datatype.value}>`}`;
}
function quadKey(quad) { return [quad.subject, quad.predicate, quad.object, quad.graph].map(termKey).join(' '); }
function signatureState() { return { count: 0, typeCount: 0, subjects: new Set(), sumA: 0, sumB: 0, xorA: 0, xorB: 0 }; }
function addQuad(state, quad) {
  state.count += 1;
  state.subjects.add(termKey(quad.subject));
  if (quad.predicate.value === RDF_TYPE) state.typeCount += 1;
  const key = quadKey(quad);
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 0x01000193);
    hashB = Math.imul(hashB ^ (code + index), 0x5bd1e995);
  }
  state.sumA = (state.sumA + hashA) >>> 0;
  state.sumB = (state.sumB + hashB) >>> 0;
  state.xorA ^= hashA;
  state.xorB ^= hashB;
}
function finishSignature(state) {
  const signature = [state.sumA, state.sumB, state.xorA >>> 0, state.xorB >>> 0].map((value) => value.toString(16).padStart(8, '0')).join('');
  return { count: state.count, typeCount: state.typeCount, subjectCount: state.subjects.size, signature };
}
async function turtleGraphSignature(path) {
  const state = signatureState();
  await new Promise((resolvePromise, rejectPromise) => {
    createReadStream(path).pipe(new StreamParser())
      .on('data', (quad) => addQuad(state, quad))
      .on('error', rejectPromise)
      .on('end', resolvePromise);
  });
  return finishSignature(state);
}
function expandCompactIri(value, context) {
  if (!value.includes(':')) return value;
  const [prefix, local] = value.split(':', 2);
  return typeof context[prefix] === 'string' ? `${context[prefix]}${local}` : value;
}
function jsonLdGraphSignature(document) {
  const context = document['@context'];
  const state = signatureState();
  const { namedNode, literal, quad } = DataFactory;
  const defaultGraph = DataFactory.defaultGraph();
  for (const node of document['@graph']) {
    const subject = namedNode(node['@id']);
    for (const [property, rawValues] of Object.entries(node)) {
      if (property === '@id') continue;
      const values = Array.isArray(rawValues) ? rawValues : [rawValues];
      if (property === '@type') {
        for (const value of values) addQuad(state, quad(subject, namedNode(RDF_TYPE), namedNode(expandCompactIri(value, context)), defaultGraph));
        continue;
      }
      const mapping = context[property];
      const predicateIri = expandCompactIri(typeof mapping === 'string' ? mapping : mapping['@id'], context);
      for (const value of values) {
        let object;
        if (value && typeof value === 'object' && value['@id']) object = namedNode(value['@id']);
        else if (mapping?.['@type'] === '@id') object = namedNode(value);
        else if (mapping?.['@language']) object = literal(String(value), mapping['@language']);
        else if (mapping?.['@type']) object = literal(String(value), namedNode(expandCompactIri(mapping['@type'], context)));
        else if (typeof value === 'boolean') object = literal(String(value), namedNode('http://www.w3.org/2001/XMLSchema#boolean'));
        else if (typeof value === 'number') object = literal(String(value), namedNode(Number.isInteger(value) ? 'http://www.w3.org/2001/XMLSchema#integer' : 'http://www.w3.org/2001/XMLSchema#double'));
        else object = literal(String(value));
        addQuad(state, quad(subject, namedNode(predicateIri), object, defaultGraph));
      }
    }
  }
  return finishSignature(state);
}
const turtleSignature = await turtleGraphSignature(join(root, 'dist/ontology/learning-map.ttl')).catch((error) => { errors.push(`generated Turtle stream parse failed: ${error.message}`); return { count: 0, typeCount: 0, signature: '' }; });
tripleCount = turtleSignature.count;
const jsonldDocument = await readJson(join(root, 'dist/ontology/learning-map.jsonld'));
const jsonldSignature = jsonLdGraphSignature(jsonldDocument);
if (turtleSignature.count !== jsonldSignature.count || turtleSignature.signature !== jsonldSignature.signature) errors.push(`RDF isomorphism failed: Turtle ${turtleSignature.count}/${turtleSignature.signature.slice(0, 12)} != JSON-LD ${jsonldSignature.count}/${jsonldSignature.signature.slice(0, 12)}`);
if (turtleSignature.subjectCount !== manifest.graphNodeCount || jsonldSignature.subjectCount !== manifest.graphNodeCount) errors.push(`ontology graph node count mismatch: manifest ${manifest.graphNodeCount}, Turtle ${turtleSignature.subjectCount}, JSON-LD ${jsonldSignature.subjectCount}`);
if (tripleCount < manifest.graphNodeCount) errors.push(`generated Turtle has too few triples: ${tripleCount}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`ontology validation passed: ${manifest.graphNodeCount} nodes, ${tripleCount} triples, ${queryFiles.length} queries, ${violations.size} adversarial detections`);
