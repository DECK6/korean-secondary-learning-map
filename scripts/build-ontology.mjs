import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCollectionRecords, readRelease } from './lib/profile-collections.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist/ontology');
const checkOnly = process.argv.includes('--check');
// The 528 specialised vocational subjects are 93.8% of the high-school records. They ship as their
// own ABox file so the default graph stays small enough to load, validate and query quickly.
const includeVocational = process.argv.includes('--include-vocational');
const academicProfiles = ['middle', 'high', 'bridges'];
const vocationalProfiles = ['high-vocational'];
const base = 'https://dexa.art/learnmap/secondary/resource/';
const elementaryTopicBase = 'https://dexa.art/learnmap/#/topic/';
const slm = 'https://dexa.art/learnmap/secondary/ontology#';
const core = 'https://dexa.art/learnmap/ontology/k12-core#';
// K-12 core concepts are emitted alongside the slm: shape so the same query text runs against the
// elementary repository. The core module is imported by ontology/learning-map.ttl.
const coreIri = (localName) => `<${core}${localName}>`;
const coreJsonIri = (localName) => `${core}${localName}`;

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
  middle: ['subject-groups', 'courses', 'domains', 'standards', 'topics', 'clusters', 'learning-relations', 'learning-relations.candidate', 'coverage-gaps'],
  high: ['subject-groups', 'courses', 'domains', 'standards', 'topics', 'clusters', 'learning-relations', 'learning-relations.candidate', 'course-relations', 'credit-rules', 'choice-sets', 'pathways', 'coverage-gaps'],
  'high-vocational': ['subject-groups', 'courses', 'domains', 'standards', 'topics', 'clusters', 'learning-relations', 'coverage-gaps'],
  bridges: ['transition-alignments', 'elementary-transitions', 'elementary-transitions.candidate', 'coverage-gaps'],
};
// Collections are resolved through the release so a sharded file list stays an implementation
// detail of data/kr/high-vocational.
const releaseCollectionKeys = {
  'subject-groups': 'subjectGroups',
  courses: 'courses',
  domains: 'domains',
  standards: 'standards',
  topics: 'topics',
  clusters: 'clusters',
  'learning-relations': 'learningRelations',
  'learning-relations.candidate': 'candidateLearningRelations',
  'course-relations': 'courseRelations',
  'credit-rules': 'creditRules',
  'choice-sets': 'choiceSets',
  pathways: 'pathways',
  'transition-alignments': 'transitionAlignments',
  'elementary-transitions': 'elementaryTransitions',
  'elementary-transitions.candidate': 'candidateElementaryTransitions',
  'coverage-gaps': 'coverageGaps',
};
// A vocational course is still a high-school course; only the release it ships in differs.
const schoolLevelOf = { middle: 'middle', high: 'high', 'high-vocational': 'high' };
const officialRelationCollections = new Set(['learning-relations', 'course-relations', 'transition-alignments', 'elementary-transitions']);

function officialRecords(records, label) {
  const unsupported = records.find((record) => record.basisKind !== 'official-source');
  if (unsupported) throw new Error(`${label} contains non-official relation ${unsupported.id}`);
  return records;
}

async function loadCollections(profiles) {
  const loaded = {};
  const releases = {};
  for (const profile of profiles) {
    const release = await readRelease(root, profile);
    releases[profile] = release;
    loaded[profile] = {};
    for (const name of collectionNames[profile]) {
      const records = await readCollectionRecords(root, profile, release.collections[releaseCollectionKeys[name]]);
      loaded[profile][name] = officialRelationCollections.has(name) ? officialRecords(records, `${profile}/${name}`) : records;
    }
  }
  return { loaded, releases };
}

function pushNode(graph, ttl, node) {
  graph.push(node.json);
  ttl.push(`${iri(node.id)} ${node.triples.join(' ;\n  ')} .`);
}

function refs(records, property) {
  return records.map((value) => ({ '@id': jsonIri(value[property] ?? value) }));
}

async function build(profiles) {
  const { loaded: data, releases: releaseByProfile } = await loadCollections(profiles);
  const emitShared = profiles.includes('middle');
  const sources = emitShared ? (await readJson(join(root, 'data/kr/shared/source-manifest.json'))).sources : [];
  const releases = profiles.map((profile) => releaseByProfile[profile]);
  const context = (await readJson(join(root, 'ontology/context.jsonld')))['@context'];
  const graph = [];
  const ttl = ['@prefix slm: <https://dexa.art/learnmap/secondary/ontology#> .', '@prefix core: <https://dexa.art/learnmap/ontology/k12-core#> .', '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .', '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .'];

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

  for (const profile of profiles.filter((name) => name !== 'bridges')) {
    const level = schoolLevelOf[profile];
    for (const record of data[profile]['subject-groups']) pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': 'slm:SubjectGroup', label: record.labelKorean, schoolLevel: level, hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, reviewStatus: record.reviewStatus },
      triples: [`a slm:SubjectGroup`, `rdfs:label ${ko(record.labelKorean)}`, `slm:schoolLevel ${literal(level)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:reviewStatus ${literal(record.reviewStatus)}`],
    });
    for (const record of data[profile].courses) pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': 'slm:Course', label: record.labelKorean, schoolLevel: level, courseCategory: record.courseCategory, programScope: record.programScopes ?? [], gradeScope: record.gradeScope ?? [], creditRule: refs(record.creditRuleRefs ?? []), inSubjectGroup: { '@id': jsonIri(record.subjectGroupId) }, hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, reviewStatus: record.reviewStatus },
      triples: [`a slm:Course`, `rdfs:label ${ko(record.labelKorean)}`, `slm:schoolLevel ${literal(level)}`, `slm:courseCategory ${literal(record.courseCategory)}`, ...((record.programScopes ?? []).map((value) => `slm:programScope ${literal(value)}`)), ...((record.gradeScope ?? []).map((value) => `slm:gradeScope ${literal(value)}`)), ...((record.creditRuleRefs ?? []).map((id) => `slm:creditRule ${iri(id)}`)), `slm:inSubjectGroup ${iri(record.subjectGroupId)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:reviewStatus ${literal(record.reviewStatus)}`],
    });
    for (const record of data[profile].domains) pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': 'slm:Domain', label: record.labelKorean, schoolLevel: level, domainOfCourse: { '@id': jsonIri(record.courseId) }, hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, reviewStatus: record.reviewStatus },
      triples: [`a slm:Domain`, `rdfs:label ${ko(record.labelKorean)}`, `slm:schoolLevel ${literal(level)}`, `slm:domainOfCourse ${iri(record.courseId)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:reviewStatus ${literal(record.reviewStatus)}`],
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
    for (const record of data[profile].topics) {
      // Authored drafts must name the passage they were written from; the locator is a core-only
      // node because it carries a printed page and section rather than a full standard locator.
      let contentLocatorId = null;
      if (record.contentSourceLocator) {
        contentLocatorId = `${record.id}.content-locator`;
        const locator = record.contentSourceLocator;
        pushNode(graph, ttl, {
          id: contentLocatorId,
          json: { '@id': jsonIri(contentLocatorId), '@type': 'core:SourceLocator', 'core:locatorKind': { '@id': coreJsonIri('locator-printed-page') }, 'core:standardCode': locator.code, 'core:printedPage': locator.printedPage, 'core:sourceSection': locator.section, hasSource: { '@id': jsonIri(locator.sourceId) } },
          triples: [`a core:SourceLocator`, `core:locatorKind ${coreIri('locator-printed-page')}`, `core:standardCode ${literal(locator.code)}`, `core:printedPage ${literal(locator.printedPage)}^^xsd:integer`, `core:sourceSection ${literal(locator.section)}`, `slm:hasSource ${iri(locator.sourceId)}`],
        });
      }
      pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': profile === 'middle' ? ['slm:LearningTopic', 'slm:MiddleLearningTopic'] : 'slm:LearningTopic', label: record.labelKorean, schoolLevel: level, description: record.description, topicInCourse: refs(record.courseIds), inDomain: { '@id': jsonIri(record.domainId) }, alignsToStandard: refs(record.standardAlignments, 'standardId'), alignmentKind: record.standardAlignments.map((a) => a.alignmentKind), basis: record.standardAlignments.map((a) => a.basis), topicType: record.types, ...(record.decompositionKind ? { decompositionKind: record.decompositionKind } : {}), ...(record.facetKey ? { facetKey: record.facetKey, 'core:facetKey': { '@id': coreJsonIri(`facet-${record.facetKey}`) } } : {}), ...(record.facetKeyDetail ? { facetKeyDetail: record.facetKeyDetail } : {}), 'core:contentKind': { '@id': coreJsonIri(`content-${record.contentKind}`) }, ...(record.misconceptions?.length ? { 'core:misconception': [...record.misconceptions] } : {}), ...(contentLocatorId ? { 'core:contentSourceLocator': { '@id': jsonIri(contentLocatorId) } } : {}), evidence: record.evidence, assessmentPrompt: record.assessmentPrompts, hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, reviewStatus: record.reviewStatus },
      triples: [`a slm:LearningTopic${profile === 'middle' ? ', slm:MiddleLearningTopic' : ''}`, `rdfs:label ${ko(record.labelKorean)}`, `slm:schoolLevel ${literal(level)}`, `slm:description ${ko(record.description)}`, ...record.courseIds.map((id) => `slm:topicInCourse ${iri(id)}`), `slm:inDomain ${iri(record.domainId)}`, ...record.standardAlignments.map((a) => `slm:alignsToStandard ${iri(a.standardId)}`), ...record.standardAlignments.map((a) => `slm:alignmentKind ${literal(a.alignmentKind)}`), ...record.standardAlignments.map((a) => `slm:basis ${literal(a.basis)}`), ...record.types.map((value) => `slm:topicType ${literal(value)}`), ...(record.decompositionKind ? [`slm:decompositionKind ${literal(record.decompositionKind)}`] : []), ...(record.facetKey ? [`slm:facetKey ${literal(record.facetKey)}`, `core:facetKey ${coreIri(`facet-${record.facetKey}`)}`] : []), ...(record.facetKeyDetail ? [`slm:facetKeyDetail ${literal(record.facetKeyDetail)}`] : []), `core:contentKind ${coreIri(`content-${record.contentKind}`)}`, ...((record.misconceptions ?? []).map((value) => `core:misconception ${ko(value)}`)), ...(contentLocatorId ? [`core:contentSourceLocator ${iri(contentLocatorId)}`] : []), ...record.evidence.map((value) => `slm:evidence ${ko(value)}`), ...record.assessmentPrompts.map((value) => `slm:assessmentPrompt ${ko(value)}`), ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:reviewStatus ${literal(record.reviewStatus)}`],
      });
    }
    for (const record of data[profile].clusters) pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': 'slm:LearningCluster', label: record.labelKorean, summary: record.summary, clusterInCourse: { '@id': jsonIri(record.courseId) }, inDomain: { '@id': jsonIri(record.domainId) }, hasTopic: refs(record.topicIds), hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, reviewStatus: record.reviewStatus },
      triples: [`a slm:LearningCluster`, `rdfs:label ${ko(record.labelKorean)}`, `slm:summary ${ko(record.summary)}`, `slm:clusterInCourse ${iri(record.courseId)}`, `slm:inDomain ${iri(record.domainId)}`, ...record.topicIds.map((id) => `slm:hasTopic ${iri(id)}`), ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:reviewStatus ${literal(record.reviewStatus)}`],
    });
    // Both layers are LearningRelations, separated by a subclass and the slm:layer qualifier so
    // SHACL can reject a candidate assertion that leaks into the official layer.
    for (const collectionName of collectionNames[profile].filter((name) => name.startsWith('learning-relations'))) {
      const layerClass = collectionName === 'learning-relations' ? 'slm:OfficialLearningRelation' : 'slm:CandidateLearningRelation';
      for (const record of data[profile][collectionName]) pushNode(graph, ttl, {
        id: record.id,
        json: { '@id': jsonIri(record.id), '@type': ['slm:LearningRelation', layerClass], layer: record.layer, 'core:layerConcept': { '@id': coreJsonIri(`layer-${record.layer}`) }, prerequisiteTopic: { '@id': jsonIri(record.prerequisiteTopicId) }, dependentTopic: { '@id': jsonIri(record.dependentTopicId) }, relationKind: record.relationKind, scope: record.scope, strength: record.strength, reason: record.reason, basisKind: record.basisKind, basis: record.basis, hasSource: refs(record.sourceRefs), reviewStatus: record.reviewStatus },
        triples: [`a slm:LearningRelation, ${layerClass}`, `slm:layer ${literal(record.layer)}`, `core:layerConcept ${coreIri(`layer-${record.layer}`)}`, `slm:prerequisiteTopic ${iri(record.prerequisiteTopicId)}`, `slm:dependentTopic ${iri(record.dependentTopicId)}`, `slm:relationKind ${literal(record.relationKind)}`, `slm:scope ${literal(record.scope)}`, `slm:strength ${literal(record.strength)}`, `slm:reason ${ko(record.reason)}`, `slm:basisKind ${literal(record.basisKind)}`, `slm:basis ${literal(record.basis)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:reviewStatus ${literal(record.reviewStatus)}`],
      });
    }
  }

  for (const record of profiles.includes('bridges') ? data.bridges['transition-alignments'] : []) pushNode(graph, ttl, {
    id: record.id,
    json: { '@id': jsonIri(record.id), '@type': 'slm:TransitionAlignment', transitionFromCourse: refs(record.fromCourseIds), transitionToCourse: refs(record.toCourseIds), fromTopic: refs(record.fromTopicIds), toTopic: refs(record.toTopicIds), relationKind: record.transitionKind, reason: record.reason, basisKind: record.basisKind, basis: record.basis, hasSource: refs(record.sourceRefs), reviewStatus: record.reviewStatus },
    triples: [`a slm:TransitionAlignment`, ...record.fromCourseIds.map((id) => `slm:transitionFromCourse ${iri(id)}`), ...record.toCourseIds.map((id) => `slm:transitionToCourse ${iri(id)}`), ...record.fromTopicIds.map((id) => `slm:fromTopic ${iri(id)}`), ...record.toTopicIds.map((id) => `slm:toTopic ${iri(id)}`), `slm:relationKind ${literal(record.transitionKind)}`, `slm:reason ${ko(record.reason)}`, `slm:basisKind ${literal(record.basisKind)}`, `slm:basis ${literal(record.basis)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:reviewStatus ${literal(record.reviewStatus)}`],
  });
  // The candidate bridge layer is materialized with the slm:layer qualifier and its own subclass so
  // SHACL can reject a candidate bridge that claims official evidence. Derived prerequisite views
  // stay on the official layer only.
  for (const collectionName of profiles.includes('bridges') ? ['elementary-transitions', 'elementary-transitions.candidate'] : []) {
    const isCandidate = collectionName.endsWith('.candidate');
    const types = isCandidate ? ['slm:TransitionAlignment', 'slm:CandidateTransitionAlignment'] : 'slm:TransitionAlignment';
    for (const record of data.bridges[collectionName]) pushNode(graph, ttl, {
      id: record.id,
      json: { '@id': jsonIri(record.id), '@type': types, layer: record.layer, 'core:layerConcept': { '@id': coreJsonIri(`layer-${record.layer}`) }, fromTopic: { '@id': elementaryJsonIri(record.prerequisiteTopicId) }, toTopic: { '@id': jsonIri(record.dependentTopicId) }, relationKind: record.relationKind, reason: record.reason, basisKind: record.basisKind, basis: record.basis, hasSource: refs(record.sourceRefs), reviewStatus: record.reviewStatus },
      triples: [`a slm:TransitionAlignment${isCandidate ? ', slm:CandidateTransitionAlignment' : ''}`, `slm:layer ${literal(record.layer)}`, `core:layerConcept ${coreIri(`layer-${record.layer}`)}`, `slm:fromTopic ${elementaryIri(record.prerequisiteTopicId)}`, `slm:toTopic ${iri(record.dependentTopicId)}`, `slm:relationKind ${literal(record.relationKind)}`, `slm:reason ${ko(record.reason)}`, `slm:basisKind ${literal(record.basisKind)}`, `slm:basis ${literal(record.basis)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:reviewStatus ${literal(record.reviewStatus)}`],
    });
  }
  const highExtras = profiles.includes('high') ? data.high : { 'course-relations': [], 'credit-rules': [], 'choice-sets': [], pathways: [] };
  for (const record of highExtras['course-relations']) pushNode(graph, ttl, {
    id: record.id,
    json: { '@id': jsonIri(record.id), '@type': 'slm:CourseRelation', courseRelationFrom: { '@id': jsonIri(record.fromCourseId) }, courseRelationTo: { '@id': jsonIri(record.toCourseId) }, relationKind: record.relationKind, claimStatus: record.claimStatus, reason: record.reason, basisKind: record.basisKind, basis: record.basis, hasSource: refs(record.sourceRefs), reviewStatus: record.reviewStatus },
    triples: [`a slm:CourseRelation`, `slm:courseRelationFrom ${iri(record.fromCourseId)}`, `slm:courseRelationTo ${iri(record.toCourseId)}`, `slm:relationKind ${literal(record.relationKind)}`, `slm:claimStatus ${literal(record.claimStatus)}`, `slm:reason ${ko(record.reason)}`, `slm:basisKind ${literal(record.basisKind)}`, `slm:basis ${literal(record.basis)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:reviewStatus ${literal(record.reviewStatus)}`],
  });
  for (const record of highExtras['credit-rules']) pushNode(graph, ttl, {
    id: record.id,
    json: { '@id': jsonIri(record.id), '@type': 'slm:CreditRule', label: record.labelKorean, effectiveFrom: record.effectiveFrom, ...(record.effectiveTo ? { effectiveTo: record.effectiveTo } : {}), ruleKind: record.ruleKind, value: record.value, unit: record.unit, hasSource: refs(record.sourceRefs), verificationStatus: record.verificationStatus, rightsStatus: record.rightsStatus },
    triples: [`a slm:CreditRule`, `rdfs:label ${ko(record.labelKorean)}`, `slm:effectiveFrom ${literal(record.effectiveFrom)}^^xsd:date`, ...(record.effectiveTo ? [`slm:effectiveTo ${literal(record.effectiveTo)}^^xsd:date`] : []), `slm:ruleKind ${literal(record.ruleKind)}`, `slm:value ${literal(record.value)}^^xsd:integer`, `slm:unit ${literal(record.unit)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:verificationStatus ${literal(record.verificationStatus)}`, `slm:rightsStatus ${literal(record.rightsStatus)}`],
  });
  for (const record of highExtras['choice-sets']) pushNode(graph, ttl, {
    id: record.id,
    json: { '@id': jsonIri(record.id), '@type': 'slm:ChoiceSet', label: record.labelKorean, choiceKind: record.choiceKind, minimumSelections: record.minimumSelections, ...(record.maximumSelections === null ? {} : { maximumSelections: record.maximumSelections }), hasCourse: refs(record.courseIds), ruleBasis: record.ruleBasis, hasSource: refs(record.sourceRefs), reviewStatus: record.reviewStatus },
    triples: [`a slm:ChoiceSet`, `rdfs:label ${ko(record.labelKorean)}`, `slm:choiceKind ${literal(record.choiceKind)}`, `slm:minimumSelections ${literal(record.minimumSelections)}^^xsd:integer`, ...(record.maximumSelections === null ? [] : [`slm:maximumSelections ${literal(record.maximumSelections)}^^xsd:integer`]), ...record.courseIds.map((id) => `slm:hasCourse ${iri(id)}`), `slm:ruleBasis ${literal(record.ruleBasis)}`, ...record.sourceRefs.map((id) => `slm:hasSource ${iri(id)}`), `slm:reviewStatus ${literal(record.reviewStatus)}`],
  });
  for (const record of highExtras.pathways) {
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
  for (const profile of profiles) {
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
  const built = await build(academicProfiles);
  await atomicWrite(join(outDir, 'learning-map.ttl'), built.turtle);
  await atomicWrite(join(outDir, 'learning-map.jsonld'), built.jsonld);
  let vocational = null;
  if (includeVocational) {
    vocational = await build(vocationalProfiles);
    await atomicWrite(join(outDir, 'high-vocational.ttl'), vocational.turtle);
    await atomicWrite(join(outDir, 'high-vocational.jsonld'), vocational.jsonld);
  }
  const artifactDefinitions = [
    ['dist/ontology/learning-map.ttl', 'text/turtle'],
    ['dist/ontology/learning-map.jsonld', 'application/ld+json'],
    ...(includeVocational ? [
      ['dist/ontology/high-vocational.ttl', 'text/turtle'],
      ['dist/ontology/high-vocational.jsonld', 'application/ld+json'],
    ] : []),
    ['ontology/learning-map.ttl', 'text/turtle'],
    ['ontology/k12-core.ttl', 'text/turtle'],
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
  const manifest = {
    version: '0.6.0-candidate',
    includesVocational: includeVocational,
    graphNodeCount: built.graphCount,
    ...(includeVocational ? { vocationalGraphNodeCount: vocational.graphCount } : {}),
    artifacts,
  };
  await atomicWrite(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`ontology build passed: ${built.graphCount} graph nodes${includeVocational ? ` + ${vocational.graphCount} vocational nodes` : ''}`);
}
