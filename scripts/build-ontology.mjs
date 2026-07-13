import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist/ontology');
const checkOnly = process.argv.includes('--check');
const base = 'https://dexa.art/learnmap/secondary/resource/';
const elementaryTopicBase = 'https://dexa.art/learnmap/#/topic/';
const slm = 'https://dexa.art/learnmap/secondary/ontology#';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const iri = (id) => `<${base}${encodeURIComponent(id)}>`;
const jsonIri = (id) => `${base}${encodeURIComponent(id)}`;
const elementaryIri = (id) => `<${elementaryTopicBase}${encodeURIComponent(id)}>`;
const elementaryJsonIri = (id) => `${elementaryTopicBase}${encodeURIComponent(id)}`;
const literal = (value) => JSON.stringify(String(value));
const ko = (value) => `${literal(value)}@ko`;

async function atomicWrite(path, contents) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents, 'utf8');
  await rename(temporary, path);
}

const collectionNames = {
  middle: ['subject-groups', 'courses', 'domains', 'standards', 'topics', 'clusters', 'learning-relations', 'coverage-gaps'],
  high: ['subject-groups', 'courses', 'domains', 'standards', 'topics', 'clusters', 'learning-relations', 'course-relations', 'credit-rules', 'choice-sets', 'pathways', 'coverage-gaps'],
  bridges: ['transition-alignments', 'elementary-transitions', 'coverage-gaps'],
};

async function loadCollections() {
  const loaded = {};
  for (const [profile, names] of Object.entries(collectionNames)) {
    loaded[profile] = {};
    for (const name of names) loaded[profile][name] = (await readJson(join(root, 'data/kr', profile, `${name}.json`))).records;
  }
  return loaded;
}

function pushNode(graph, ttl, node) {
  graph.push(node.json);
  ttl.push(`${iri(node.id)} ${node.triples.join(' ;\n  ')} .`);
}

function refs(records, property) {
  return records.map((value) => ({ '@id': jsonIri(value[property] ?? value) }));
}

async function build() {
  const data = await loadCollections();
  const sources = (await readJson(join(root, 'data/kr/shared/source-manifest.json'))).sources;
  const releases = await Promise.all(['middle', 'high', 'bridges'].map((profile) => readJson(join(root, 'data/kr', profile, 'release.json'))));
  const context = (await readJson(join(root, 'ontology/context.jsonld')))['@context'];
  const graph = [];
  const ttl = ['@prefix slm: <https://dexa.art/learnmap/secondary/ontology#> .', '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .', '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .'];

  for (const release of releases) pushNode(graph, ttl, {
    id: release.releaseId,
    json: { '@id': jsonIri(release.releaseId), '@type': 'slm:CurriculumRelease', label: release.releaseId, schoolLevel: release.profile, curriculumVersion: release.curriculumVersion, status: release.status, rightsStatus: release.rightsStatus },
    triples: [`a slm:CurriculumRelease`, `rdfs:label ${ko(release.releaseId)}`, `slm:schoolLevel ${literal(release.profile)}`, `slm:curriculumVersion ${literal(release.curriculumVersion)}`, `slm:status ${literal(release.status)}`, `slm:rightsStatus ${literal(release.rightsStatus)}`],
  });

  for (const source of sources) pushNode(graph, ttl, {
    id: source.id,
    json: { '@id': jsonIri(source.id), '@type': 'slm:SourceDocument', label: source.name, publisher: source.publisher, sourceUrl: source.url, attachmentNumber: source.attachmentNo, fileSha256: source.sha256, verificationStatus: source.verificationStatus, rightsStatus: source.rightsStatus },
    triples: [`a slm:SourceDocument`, `rdfs:label ${ko(source.name)}`, `slm:publisher ${literal(source.publisher)}`, `slm:sourceUrl ${literal(source.url)}^^xsd:anyURI`, `slm:attachmentNumber ${literal(source.attachmentNo)}`, `slm:fileSha256 ${literal(source.sha256)}`, `slm:verificationStatus ${literal(source.verificationStatus)}`, `slm:rightsStatus ${literal(source.rightsStatus)}`],
  });

  for (const profile of ['middle', 'high']) {
    for (const record of data[profile]['subject-groups']) pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': 'slm:SubjectGroup', label: record.labelKorean, schoolLevel: profile, hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, reviewStatus: record.reviewStatus },
      triples: [`a slm:SubjectGroup`, `rdfs:label ${ko(record.labelKorean)}`, `slm:schoolLevel ${literal(profile)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:reviewStatus ${literal(record.reviewStatus)}`],
    });
    for (const record of data[profile].courses) pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': 'slm:Course', label: record.labelKorean, schoolLevel: profile, courseCategory: record.courseCategory, programScope: record.programScopes ?? [], gradeScope: record.gradeScope ?? [], creditRule: refs(record.creditRuleRefs ?? []), inSubjectGroup: { '@id': jsonIri(record.subjectGroupId) }, hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, reviewStatus: record.reviewStatus },
      triples: [`a slm:Course`, `rdfs:label ${ko(record.labelKorean)}`, `slm:schoolLevel ${literal(profile)}`, `slm:courseCategory ${literal(record.courseCategory)}`, ...((record.programScopes ?? []).map((value) => `slm:programScope ${literal(value)}`)), ...((record.gradeScope ?? []).map((value) => `slm:gradeScope ${literal(value)}`)), ...((record.creditRuleRefs ?? []).map((id) => `slm:creditRule ${iri(id)}`)), `slm:inSubjectGroup ${iri(record.subjectGroupId)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:reviewStatus ${literal(record.reviewStatus)}`],
    });
    for (const record of data[profile].domains) pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': 'slm:Domain', label: record.labelKorean, schoolLevel: profile, domainOfCourse: { '@id': jsonIri(record.courseId) }, hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, reviewStatus: record.reviewStatus },
      triples: [`a slm:Domain`, `rdfs:label ${ko(record.labelKorean)}`, `slm:schoolLevel ${literal(profile)}`, `slm:domainOfCourse ${iri(record.courseId)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:reviewStatus ${literal(record.reviewStatus)}`],
    });
    for (const record of data[profile].standards) {
      const locatorId = `${record.id}.locator`;
      pushNode(graph, ttl, {
        id: locatorId,
        json: { '@id': jsonIri(locatorId), '@type': 'slm:SourceLocator', officialCode: record.code, sourcePage: record.sourceLocator.pdfPage, attachmentNumber: record.sourceLocator.attachmentNo, fileSha256: record.sourceLocator.sha256, sourceSection: record.sourceLocator.section, hasSource: { '@id': jsonIri(record.sourceLocator.sourceId) } },
        triples: [`a slm:SourceLocator`, `slm:officialCode ${literal(record.code)}`, `slm:sourcePage ${literal(record.sourceLocator.pdfPage)}^^xsd:integer`, `slm:attachmentNumber ${literal(record.sourceLocator.attachmentNo)}`, `slm:fileSha256 ${literal(record.sourceLocator.sha256)}`, `slm:sourceSection ${literal(record.sourceLocator.section)}`, `slm:hasSource ${iri(record.sourceLocator.sourceId)}`],
      });
      pushNode(graph, ttl, {
        id: record.id,
        json: { '@id': jsonIri(record.id), '@type': 'slm:AchievementStandard', label: record.labelKorean, officialCode: record.code, summary: record.summary, summaryKind: record.summaryKind, inCourse: { '@id': jsonIri(record.courseId) }, inDomain: { '@id': jsonIri(record.domainId) }, hasLocator: { '@id': jsonIri(locatorId) }, hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, reviewStatus: record.reviewStatus },
        triples: [`a slm:AchievementStandard`, `rdfs:label ${ko(record.labelKorean)}`, `slm:officialCode ${literal(record.code)}`, `slm:summary ${ko(record.summary)}`, `slm:summaryKind ${literal(record.summaryKind)}`, `slm:inCourse ${iri(record.courseId)}`, `slm:inDomain ${iri(record.domainId)}`, `slm:hasLocator ${iri(locatorId)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:reviewStatus ${literal(record.reviewStatus)}`],
      });
    }
    for (const record of data[profile].topics) pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': profile === 'middle' ? ['slm:LearningTopic', 'slm:MiddleLearningTopic'] : 'slm:LearningTopic', label: record.labelKorean, schoolLevel: profile, description: record.description, topicInCourse: refs(record.courseIds), inDomain: { '@id': jsonIri(record.domainId) }, alignsToStandard: refs(record.standardAlignments, 'standardId'), alignmentKind: record.standardAlignments.map((a) => a.alignmentKind), basis: record.standardAlignments.map((a) => a.basis), topicType: record.types, ...(record.decompositionKind ? { decompositionKind: record.decompositionKind, facetKey: record.facetKey } : {}), evidence: record.evidence, assessmentPrompt: record.assessmentPrompts, hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, reviewStatus: record.reviewStatus },
      triples: [`a slm:LearningTopic${profile === 'middle' ? ', slm:MiddleLearningTopic' : ''}`, `rdfs:label ${ko(record.labelKorean)}`, `slm:schoolLevel ${literal(profile)}`, `slm:description ${ko(record.description)}`, ...record.courseIds.map((id) => `slm:topicInCourse ${iri(id)}`), `slm:inDomain ${iri(record.domainId)}`, ...record.standardAlignments.map((a) => `slm:alignsToStandard ${iri(a.standardId)}`), ...record.standardAlignments.map((a) => `slm:alignmentKind ${literal(a.alignmentKind)}`), ...record.standardAlignments.map((a) => `slm:basis ${literal(a.basis)}`), ...record.types.map((value) => `slm:topicType ${literal(value)}`), ...(record.decompositionKind ? [`slm:decompositionKind ${literal(record.decompositionKind)}`, `slm:facetKey ${literal(record.facetKey)}`] : []), ...record.evidence.map((value) => `slm:evidence ${ko(value)}`), ...record.assessmentPrompts.map((value) => `slm:assessmentPrompt ${ko(value)}`), ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:reviewStatus ${literal(record.reviewStatus)}`],
    });
    for (const record of data[profile].clusters) pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': 'slm:LearningCluster', label: record.labelKorean, summary: record.summary, clusterInCourse: { '@id': jsonIri(record.courseId) }, inDomain: { '@id': jsonIri(record.domainId) }, hasTopic: refs(record.topicIds), hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, reviewStatus: record.reviewStatus },
      triples: [`a slm:LearningCluster`, `rdfs:label ${ko(record.labelKorean)}`, `slm:summary ${ko(record.summary)}`, `slm:clusterInCourse ${iri(record.courseId)}`, `slm:inDomain ${iri(record.domainId)}`, ...record.topicIds.map((id) => `slm:hasTopic ${iri(id)}`), ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:reviewStatus ${literal(record.reviewStatus)}`],
    });
    for (const record of data[profile]['learning-relations']) pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': 'slm:LearningRelation', prerequisiteTopic: { '@id': jsonIri(record.prerequisiteTopicId) }, dependentTopic: { '@id': jsonIri(record.dependentTopicId) }, relationKind: record.relationKind, scope: record.scope, strength: record.strength, reason: record.reason, basisKind: record.basisKind, basis: record.basis, hasSource: refs(record.sourceRefs), reviewStatus: record.reviewStatus },
      triples: [`a slm:LearningRelation`, `slm:prerequisiteTopic ${iri(record.prerequisiteTopicId)}`, `slm:dependentTopic ${iri(record.dependentTopicId)}`, `slm:relationKind ${literal(record.relationKind)}`, `slm:scope ${literal(record.scope)}`, `slm:strength ${literal(record.strength)}`, `slm:reason ${ko(record.reason)}`, `slm:basisKind ${literal(record.basisKind)}`, `slm:basis ${literal(record.basis)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:reviewStatus ${literal(record.reviewStatus)}`],
    });
  }

  for (const record of data.bridges['transition-alignments']) pushNode(graph, ttl, {
    id: record.id,
    json: { '@id': jsonIri(record.id), '@type': 'slm:TransitionAlignment', transitionFromCourse: refs(record.fromCourseIds), transitionToCourse: refs(record.toCourseIds), fromTopic: refs(record.fromTopicIds), toTopic: refs(record.toTopicIds), relationKind: record.transitionKind, reason: record.reason, basisKind: record.basisKind, basis: record.basis, hasSource: refs(record.sourceRefs), reviewStatus: record.reviewStatus },
    triples: [`a slm:TransitionAlignment`, ...record.fromCourseIds.map((id) => `slm:transitionFromCourse ${iri(id)}`), ...record.toCourseIds.map((id) => `slm:transitionToCourse ${iri(id)}`), ...record.fromTopicIds.map((id) => `slm:fromTopic ${iri(id)}`), ...record.toTopicIds.map((id) => `slm:toTopic ${iri(id)}`), `slm:relationKind ${literal(record.transitionKind)}`, `slm:reason ${ko(record.reason)}`, `slm:basisKind ${literal(record.basisKind)}`, `slm:basis ${literal(record.basis)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:reviewStatus ${literal(record.reviewStatus)}`],
  });
  for (const record of data.bridges['elementary-transitions']) pushNode(graph, ttl, {
    id: record.id,
    json: { '@id': jsonIri(record.id), '@type': 'slm:TransitionAlignment', fromTopic: { '@id': elementaryJsonIri(record.prerequisiteTopicId) }, toTopic: { '@id': jsonIri(record.dependentTopicId) }, relationKind: record.relationKind, reason: record.reason, basisKind: record.basisKind, basis: record.basis, hasSource: refs(record.sourceRefs), reviewStatus: record.reviewStatus },
    triples: [`a slm:TransitionAlignment`, `slm:fromTopic ${elementaryIri(record.prerequisiteTopicId)}`, `slm:toTopic ${iri(record.dependentTopicId)}`, `slm:relationKind ${literal(record.relationKind)}`, `slm:reason ${ko(record.reason)}`, `slm:basisKind ${literal(record.basisKind)}`, `slm:basis ${literal(record.basis)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:reviewStatus ${literal(record.reviewStatus)}`],
  });
  for (const record of data.high['course-relations']) pushNode(graph, ttl, {
    id: record.id,
    json: { '@id': jsonIri(record.id), '@type': 'slm:CourseRelation', courseRelationFrom: { '@id': jsonIri(record.fromCourseId) }, courseRelationTo: { '@id': jsonIri(record.toCourseId) }, relationKind: record.relationKind, claimStatus: record.claimStatus, reason: record.reason, basisKind: record.basisKind, basis: record.basis, hasSource: refs(record.sourceRefs), reviewStatus: record.reviewStatus },
    triples: [`a slm:CourseRelation`, `slm:courseRelationFrom ${iri(record.fromCourseId)}`, `slm:courseRelationTo ${iri(record.toCourseId)}`, `slm:relationKind ${literal(record.relationKind)}`, `slm:claimStatus ${literal(record.claimStatus)}`, `slm:reason ${ko(record.reason)}`, `slm:basisKind ${literal(record.basisKind)}`, `slm:basis ${literal(record.basis)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:reviewStatus ${literal(record.reviewStatus)}`],
  });
  for (const record of data.high['credit-rules']) pushNode(graph, ttl, {
    id: record.id,
    json: { '@id': jsonIri(record.id), '@type': 'slm:CreditRule', label: record.labelKorean, effectiveFrom: record.effectiveFrom, ...(record.effectiveTo ? { effectiveTo: record.effectiveTo } : {}), ruleKind: record.ruleKind, value: record.value, unit: record.unit, hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, rightsStatus: record.rightsStatus },
    triples: [`a slm:CreditRule`, `rdfs:label ${ko(record.labelKorean)}`, `slm:effectiveFrom ${literal(record.effectiveFrom)}^^xsd:date`, ...(record.effectiveTo ? [`slm:effectiveTo ${literal(record.effectiveTo)}^^xsd:date`] : []), `slm:ruleKind ${literal(record.ruleKind)}`, `slm:value ${literal(record.value)}^^xsd:integer`, `slm:unit ${literal(record.unit)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:rightsStatus ${literal(record.rightsStatus)}`],
  });
  for (const record of data.high['choice-sets']) pushNode(graph, ttl, {
    id: record.id,
    json: { '@id': jsonIri(record.id), '@type': 'slm:ChoiceSet', label: record.labelKorean, choiceKind: record.choiceKind, minimumSelections: record.minimumSelections, ...(record.maximumSelections === null ? {} : { maximumSelections: record.maximumSelections }), hasCourse: refs(record.courseIds), ruleBasis: record.ruleBasis, hasSource: refs(record.sourceRefs), reviewStatus: record.reviewStatus },
    triples: [`a slm:ChoiceSet`, `rdfs:label ${ko(record.labelKorean)}`, `slm:choiceKind ${literal(record.choiceKind)}`, `slm:minimumSelections ${literal(record.minimumSelections)}^^xsd:integer`, ...(record.maximumSelections === null ? [] : [`slm:maximumSelections ${literal(record.maximumSelections)}^^xsd:integer`]), ...record.courseIds.map((id) => `slm:hasCourse ${iri(id)}`), `slm:ruleBasis ${literal(record.ruleBasis)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:reviewStatus ${literal(record.reviewStatus)}`],
  });
  for (const record of data.high.pathways) {
    const stepIds = record.steps.map((step) => `${record.id}.step.${step.order}`);
    for (const [index, step] of record.steps.entries()) pushNode(graph, ttl, {
      id: stepIds[index],
      json: { '@id': jsonIri(stepIds[index]), '@type': 'slm:PathwayStep', stepOrder: step.order, stepKind: step.stepKind, reason: step.reason, stepCourse: refs(step.courseIds), ...(step.choiceSetId ? { stepChoiceSet: { '@id': jsonIri(step.choiceSetId) } } : {}) },
      triples: [`a slm:PathwayStep`, `slm:stepOrder ${literal(step.order)}^^xsd:integer`, `slm:stepKind ${literal(step.stepKind)}`, `slm:reason ${ko(step.reason)}`, ...step.courseIds.map((id) => `slm:stepCourse ${iri(id)}`), ...(step.choiceSetId ? [`slm:stepChoiceSet ${iri(step.choiceSetId)}`] : [])],
    });
    pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': 'slm:IllustrativePathway', label: record.labelKorean, pathwayKind: record.pathwayKind, audience: record.audience, hasStep: refs(stepIds), notOfficialRequirement: record.notOfficialRequirement, reviewStatus: record.reviewStatus },
      triples: [`a slm:IllustrativePathway`, `rdfs:label ${ko(record.labelKorean)}`, `slm:pathwayKind ${literal(record.pathwayKind)}`, `slm:audience ${literal(record.audience)}`, ...stepIds.map((id) => `slm:hasStep ${iri(id)}`), `slm:notOfficialRequirement ${literal(record.notOfficialRequirement)}^^xsd:boolean`, `slm:reviewStatus ${literal(record.reviewStatus)}`],
    });
  }
  for (const profile of ['middle', 'high', 'bridges']) {
    for (const record of data[profile]['coverage-gaps']) pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': 'slm:CoverageGap', label: record.description, description: record.description, severity: record.severity, status: record.status, hasSource: refs(record.sourceRefs) },
      triples: [`a slm:CoverageGap`, `rdfs:label ${ko(record.description)}`, `slm:description ${ko(record.description)}`, `slm:severity ${literal(record.severity)}`, `slm:status ${literal(record.status)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`)],
    });
  }

  graph.sort((a, b) => a['@id'].localeCompare(b['@id'], 'en'));
  const turtle = `${ttl.join('\n\n')}\n`;
  const jsonld = `${JSON.stringify({ '@context': context, '@graph': graph }, null, 2)}\n`;
  return { turtle, jsonld, graphCount: graph.length };
}

await mkdir(outDir, { recursive: true });
if (checkOnly) {
  const manifest = await readJson(join(outDir, 'manifest.json'));
  for (const artifact of manifest.artifacts) {
    const contents = await readFile(join(root, artifact.path));
    if (sha256(contents) !== artifact.sha256 || contents.byteLength !== artifact.bytes) throw new Error(`ontology artifact mismatch: ${artifact.path}`);
  }
  console.log(`ontology artifact check passed: ${manifest.artifacts.length} files`);
} else {
  const built = await build();
  await atomicWrite(join(outDir, 'learning-map.ttl'), built.turtle);
  await atomicWrite(join(outDir, 'learning-map.jsonld'), built.jsonld);
  const artifactDefinitions = [
    ['dist/ontology/learning-map.ttl', 'text/turtle'],
    ['dist/ontology/learning-map.jsonld', 'application/ld+json'],
    ['ontology/learning-map.ttl', 'text/turtle'],
    ['ontology/shapes.ttl', 'text/turtle'],
    ['ontology/metadata.ttl', 'text/turtle'],
    ['ontology/context.jsonld', 'application/ld+json'],
    ['ontology/queries/expected.json', 'application/json'],
    ['ontology/fixtures/canonical-positive.ttl', 'text/turtle'],
    ['ontology/fixtures/reasoning.ttl', 'text/turtle'],
    ['ontology/fixtures/adversarial/all.ttl', 'text/turtle'],
    ['ontology/fixtures/adversarial/expected.json', 'application/json'],
  ];
  for (const name of (await readdir(join(root, 'ontology/queries'))).filter((value) => value.endsWith('.rq')).sort()) {
    artifactDefinitions.push([`ontology/queries/${name}`, 'application/sparql-query']);
  }
  const artifacts = [];
  for (const [path, mediaType] of artifactDefinitions) {
    const contents = await readFile(join(root, path));
    artifacts.push({ path, mediaType, bytes: contents.byteLength, sha256: sha256(contents) });
  }
  await atomicWrite(join(outDir, 'manifest.json'), `${JSON.stringify({ version: '0.4.0-candidate', graphNodeCount: built.graphCount, artifacts }, null, 2)}\n`);
  console.log(`ontology build passed: ${built.graphCount} graph nodes`);
}
