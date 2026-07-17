import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const schemaFiles = [
  'core.schema.json',
  'source-manifest.schema.json',
  'controlled-vocabularies.schema.json',
  'official-source-catalog.schema.json',
  'official-source-receipts.schema.json',
  'middle-profile.schema.json',
  'high-profile.schema.json',
  'bridge-profile.schema.json',
];

const profileConfig = {
  middle: {
    schemaId: 'https://dexa.art/learnmap/schema/secondary/middle-profile.schema.json',
    collectionDefs: {
      subjectGroups: 'subjectGroupCollection',
      courses: 'courseCollection',
      domains: 'domainCollection',
      standards: 'standardCollection',
      topics: 'topicCollection',
      clusters: 'clusterCollection',
      learningRelations: 'learningRelationCollection',
      reviewRecords: 'reviewRecordCollection',
      coverageGaps: 'coverageGapCollection',
    },
  },
  high: {
    schemaId: 'https://dexa.art/learnmap/schema/secondary/high-profile.schema.json',
    collectionDefs: {
      subjectGroups: 'subjectGroupCollection',
      courses: 'courseCollection',
      domains: 'domainCollection',
      standards: 'standardCollection',
      topics: 'topicCollection',
      clusters: 'clusterCollection',
      learningRelations: 'learningRelationCollection',
      courseRelations: 'courseRelationCollection',
      creditRules: 'creditRuleCollection',
      choiceSets: 'choiceSetCollection',
      pathways: 'pathwayCollection',
      reviewRecords: 'reviewRecordCollection',
      coverageGaps: 'coverageGapCollection',
    },
  },
  bridges: {
    schemaId: 'https://dexa.art/learnmap/schema/secondary/bridge-profile.schema.json',
    collectionDefs: {
      transitionAlignments: 'transitionAlignmentCollection',
      elementaryTransitions: 'elementaryTransitionCollection',
      reviewRecords: 'reviewRecordCollection',
      coverageGaps: 'coverageGapCollection',
    },
  },
};

async function readJson(path) {
  const text = await readFile(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path}: invalid JSON: ${error.message}`);
  }
}

function errorText(validate) {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message}`)
    .join('; ');
}

function assertSchema(validate, data, label, errors) {
  if (!validate(data)) errors.push(`${label}: ${errorText(validate)}`);
}

function uniqueIds(records, label, errors) {
  const seen = new Set();
  for (const record of records) {
    if (!record?.id) continue;
    if (seen.has(record.id)) errors.push(`${label}: duplicate id ${record.id}`);
    seen.add(record.id);
  }
  return seen;
}

function walkSourceRefs(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walkSourceRefs(item, visit);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.sourceRefs)) {
    for (const sourceRef of value.sourceRefs) visit(sourceRef);
  }
  for (const child of Object.values(value)) walkSourceRefs(child, visit);
}

function requireRefs(refs, allowed, label, errors) {
  for (const ref of refs ?? []) {
    if (!allowed.has(ref)) errors.push(`${label}: unresolved reference ${ref}`);
  }
}

function validateOfficialRelations(profile, collections, errors) {
  for (const collectionName of ['learningRelations', 'courseRelations', 'transitionAlignments', 'elementaryTransitions']) {
    for (const relation of collections[collectionName]?.records ?? []) {
      if (relation.basisKind !== 'official-source') errors.push(`${profile}/${collectionName}/${relation.id}: relation must use official-source evidence`);
    }
  }
}

function validateReviewTargets(profile, collections, indexes, errors) {
  const allowed = new Set(
    Object.entries(indexes)
      .filter(([collectionName]) => collectionName !== 'reviewRecords')
      .flatMap(([, ids]) => [...ids]),
  );
  for (const review of collections.reviewRecords?.records ?? []) {
    requireRefs(review.targetIds, allowed, `${profile}/reviewRecords/${review.id}`, errors);
  }
}

function validateProfileReferences(profile, collections, indexes, errors) {
  const courses = indexes.courses ?? new Set();
  const domains = indexes.domains ?? new Set();
  const subjectGroups = indexes.subjectGroups ?? new Set();
  const standards = indexes.standards ?? new Set();
  const topics = indexes.topics ?? new Set();
  const creditRules = indexes.creditRules ?? new Set();
  const choiceSets = indexes.choiceSets ?? new Set();

  for (const course of collections.courses?.records ?? []) {
    requireRefs([course.subjectGroupId], subjectGroups, `${profile}/courses/${course.id}`, errors);
    if (profile === 'high') {
      requireRefs(course.creditRuleRefs, creditRules, `${profile}/courses/${course.id}`, errors);
    }
  }
  for (const domain of collections.domains?.records ?? []) {
    requireRefs([domain.courseId], courses, `${profile}/domains/${domain.id}`, errors);
  }
  for (const standard of collections.standards?.records ?? []) {
    requireRefs([standard.courseId], courses, `${profile}/standards/${standard.id}`, errors);
    requireRefs([standard.domainId], domains, `${profile}/standards/${standard.id}`, errors);
  }
  for (const topic of collections.topics?.records ?? []) {
    requireRefs(topic.courseIds, courses, `${profile}/topics/${topic.id}`, errors);
    requireRefs([topic.domainId], domains, `${profile}/topics/${topic.id}`, errors);
    requireRefs(topic.standardAlignments?.map((item) => item.standardId), standards, `${profile}/topics/${topic.id}`, errors);
  }
  for (const cluster of collections.clusters?.records ?? []) {
    requireRefs([cluster.courseId], courses, `${profile}/clusters/${cluster.id}`, errors);
    requireRefs([cluster.domainId], domains, `${profile}/clusters/${cluster.id}`, errors);
    requireRefs(cluster.topicIds, topics, `${profile}/clusters/${cluster.id}`, errors);
  }
  for (const relation of collections.learningRelations?.records ?? []) {
    requireRefs([relation.dependentTopicId, relation.prerequisiteTopicId], topics, `${profile}/learningRelations/${relation.id}`, errors);
  }
  for (const relation of collections.courseRelations?.records ?? []) {
    requireRefs([relation.fromCourseId, relation.toCourseId], courses, `${profile}/courseRelations/${relation.id}`, errors);
  }
  for (const choiceSet of collections.choiceSets?.records ?? []) {
    requireRefs(choiceSet.courseIds, courses, `${profile}/choiceSets/${choiceSet.id}`, errors);
  }
  for (const pathway of collections.pathways?.records ?? []) {
    for (const step of pathway.steps ?? []) {
      requireRefs(step.courseIds, courses, `${profile}/pathways/${pathway.id}`, errors);
      if (step.choiceSetId) requireRefs([step.choiceSetId], choiceSets, `${profile}/pathways/${pathway.id}`, errors);
    }
  }
}

function validateLearningGraph(profile, collections, errors) {
  const relations = collections.learningRelations?.records ?? [];
  const outgoing = new Map();
  const indegree = new Map();
  const assertions = new Set();
  for (const relation of relations) {
    const before = relation.prerequisiteTopicId;
    const after = relation.dependentTopicId;
    if (before === after) errors.push(`${profile}/learningRelations/${relation.id}: self cycle`);
    const key = `${before}|${after}|${relation.relationKind}|${relation.scope}`;
    if (assertions.has(key)) errors.push(`${profile}/learningRelations: duplicate assertion ${key}`);
    assertions.add(key);
    if (!outgoing.has(before)) outgoing.set(before, []);
    outgoing.get(before).push(after);
    indegree.set(before, indegree.get(before) ?? 0);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
  }
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index];
    visited += 1;
    for (const next of outgoing.get(node) ?? []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (visited !== indegree.size) errors.push(`${profile}/learningRelations: cycle detected (${indegree.size - visited} nodes)`);

  const alignmentCounts = new Map();
  const facetKeysByStandard = new Map();
  for (const topic of collections.topics?.records ?? []) {
    for (const alignment of topic.standardAlignments ?? []) {
      alignmentCounts.set(alignment.standardId, (alignmentCounts.get(alignment.standardId) ?? 0) + 1);
      if (profile === 'middle') {
        if (!facetKeysByStandard.has(alignment.standardId)) facetKeysByStandard.set(alignment.standardId, new Set());
        const keys = facetKeysByStandard.get(alignment.standardId);
        if (keys.has(topic.facetKey)) errors.push(`${profile}/standards/${alignment.standardId}: duplicate topic facet ${topic.facetKey}`);
        keys.add(topic.facetKey);
      }
    }
  }
  for (const standard of collections.standards?.records ?? []) {
    const alignmentCount = alignmentCounts.get(standard.id) ?? 0;
    if (profile === 'middle') {
      if (alignmentCount < 2 || alignmentCount > 5) errors.push(`${profile}/standards/${standard.id}: expected 2-5 generated topic alignments`);
      if (!facetKeysByStandard.get(standard.id)?.has('core')) errors.push(`${profile}/standards/${standard.id}: missing stable core topic`);
    } else if (alignmentCount !== 1) errors.push(`${profile}/standards/${standard.id}: expected exactly one generated topic alignment`);
    if (!standard.sourceLocator?.pdfPage || !standard.sourceLocator?.sha256) errors.push(`${profile}/standards/${standard.id}: incomplete official source locator`);
  }
}

export async function createAjv(root = projectRoot) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTypes: false,
    allowUnionTypes: true,
  });
  addFormats(ajv);
  for (const file of schemaFiles) {
    ajv.addSchema(await readJson(join(root, 'schema', file)));
  }
  return ajv;
}

export async function validateRepository(root = projectRoot) {
  const errors = [];
  const ajv = await createAjv(root);

  const sourceManifest = await readJson(join(root, 'data/kr/shared/source-manifest.json'));
  const vocabularies = await readJson(join(root, 'data/kr/shared/controlled-vocabularies.json'));
  const officialSourceCatalog = await readJson(join(root, 'sources/official/source-catalog.json'));
  const officialSourceReceipts = await readJson(join(root, 'sources/official/source-receipts.json'));
  const inventoryReport = await readJson(join(root, 'data/kr/inventory-report.json'));
  assertSchema(
    ajv.getSchema('https://dexa.art/learnmap/schema/secondary/source-manifest.schema.json'),
    sourceManifest,
    'shared/source-manifest.json',
    errors,
  );
  assertSchema(
    ajv.getSchema('https://dexa.art/learnmap/schema/secondary/official-source-catalog.schema.json'),
    officialSourceCatalog,
    'sources/official/source-catalog.json',
    errors,
  );
  assertSchema(
    ajv.getSchema('https://dexa.art/learnmap/schema/secondary/official-source-receipts.schema.json'),
    officialSourceReceipts,
    'sources/official/source-receipts.json',
    errors,
  );
  assertSchema(
    ajv.getSchema('https://dexa.art/learnmap/schema/secondary/controlled-vocabularies.schema.json'),
    vocabularies,
    'shared/controlled-vocabularies.json',
    errors,
  );

  if (sourceManifest.sourceCount !== sourceManifest.sources.length) {
    errors.push(`shared/source-manifest.json: sourceCount ${sourceManifest.sourceCount} != ${sourceManifest.sources.length}`);
  }
  const sourceIds = uniqueIds(sourceManifest.sources, 'shared/source-manifest.json', errors);
  if (officialSourceCatalog.sourceCount !== officialSourceCatalog.sources.length) {
    errors.push('sources/official/source-catalog.json: sourceCount mismatch');
  }
  if (officialSourceReceipts.sourceCount !== officialSourceReceipts.sources.length) {
    errors.push('sources/official/source-receipts.json: sourceCount mismatch');
  }
  const catalogIds = uniqueIds(officialSourceCatalog.sources, 'sources/official/source-catalog.json', errors);
  const receiptIds = uniqueIds(officialSourceReceipts.sources, 'sources/official/source-receipts.json', errors);
  for (const id of catalogIds) {
    if (!receiptIds.has(id)) errors.push(`sources/official/source-receipts.json: missing receipt ${id}`);
  }
  if (officialSourceReceipts.totalBytes !== officialSourceReceipts.sources.reduce((sum, source) => sum + source.bytes, 0)) {
    errors.push('sources/official/source-receipts.json: totalBytes mismatch');
  }
  for (const [name, terms] of Object.entries(vocabularies)) {
    if (Array.isArray(terms)) uniqueIds(terms, `shared/controlled-vocabularies.json/${name}`, errors);
  }

  const loaded = {};
  for (const [profile, config] of Object.entries(profileConfig)) {
    const directory = join(root, 'data/kr', profile);
    const release = await readJson(join(directory, 'release.json'));
    assertSchema(ajv.getSchema(config.schemaId), release, `${profile}/release.json`, errors);

    const collections = {};
    const indexes = {};
    for (const [collectionName, file] of Object.entries(release.collections)) {
      const definition = config.collectionDefs[collectionName];
      if (!definition) {
        errors.push(`${profile}/release.json: no schema mapping for collection ${collectionName}`);
        continue;
      }
      if (file.includes('/') || file.includes('..')) {
        errors.push(`${profile}/release.json: collection path must be a local filename: ${file}`);
        continue;
      }
      const collection = await readJson(join(directory, file));
      assertSchema(ajv.getSchema(`${config.schemaId}#/$defs/${definition}`), collection, `${profile}/${file}`, errors);
      if (collection.profile !== profile) errors.push(`${profile}/${file}: profile mismatch`);
      if (collection.releaseId !== release.releaseId) errors.push(`${profile}/${file}: releaseId mismatch`);
      if (collection.recordType !== collectionName) errors.push(`${profile}/${file}: recordType mismatch`);
      if (collection.recordCount !== collection.records.length) {
        errors.push(`${profile}/${file}: recordCount ${collection.recordCount} != ${collection.records.length}`);
      }
      if (release.counts[collectionName] !== collection.recordCount) {
        errors.push(`${profile}/release.json: count ${collectionName}=${release.counts[collectionName]} != ${collection.recordCount}`);
      }
      walkSourceRefs(collection.records, (sourceRef) => {
        if (!sourceIds.has(sourceRef)) errors.push(`${profile}/${file}: unresolved sourceRef ${sourceRef}`);
      });
      collections[collectionName] = collection;
      indexes[collectionName] = uniqueIds(collection.records, `${profile}/${file}`, errors);
    }
    loaded[profile] = { release, collections, indexes };
    validateOfficialRelations(profile, collections, errors);
    validateReviewTargets(profile, collections, indexes, errors);
    if (profile !== 'bridges') {
      validateProfileReferences(profile, collections, indexes, errors);
      validateLearningGraph(profile, collections, errors);
      if (release.rightsStatus !== 'cleared') errors.push(`${profile}/release.json: rights status must be cleared (public official documents)`);
    }
  }

  const bridge = loaded.bridges;
  if (bridge.release.middleReleaseId !== loaded.middle.release.releaseId) {
    errors.push('bridges/release.json: middleReleaseId does not pin the current middle release');
  }
  if (bridge.release.highReleaseId !== loaded.high.release.releaseId) {
    errors.push('bridges/release.json: highReleaseId does not pin the current high release');
  }
  for (const alignment of bridge.collections.transitionAlignments.records) {
    requireRefs(alignment.fromCourseIds, loaded.middle.indexes.courses, `bridges/transitionAlignments/${alignment.id}`, errors);
    requireRefs(alignment.fromTopicIds, loaded.middle.indexes.topics, `bridges/transitionAlignments/${alignment.id}`, errors);
    requireRefs(alignment.toCourseIds, loaded.high.indexes.courses, `bridges/transitionAlignments/${alignment.id}`, errors);
    requireRefs(alignment.toTopicIds, loaded.high.indexes.topics, `bridges/transitionAlignments/${alignment.id}`, errors);
  }
  if (bridge.collections.elementaryTransitions) {
    const inventory = await readJson(join(root, 'data/kr/bridges/elementary-topic-inventory.json'));
    const elementaryTopicIds = new Set(inventory.topicIds ?? []);
    if (inventory.topicCount !== elementaryTopicIds.size) {
      errors.push('bridges/elementary-topic-inventory.json: topicCount mismatch');
    }
    const collection = bridge.collections.elementaryTransitions;
    if (collection.elementaryReleaseVersion !== inventory.elementaryReleaseVersion) {
      errors.push('bridges/elementary-transitions.json: elementaryReleaseVersion does not pin the inventory version');
    }
    for (const record of collection.records) {
      requireRefs([record.prerequisiteTopicId], elementaryTopicIds, `bridges/elementaryTransitions/${record.id}`, errors);
      requireRefs([record.dependentTopicId], loaded.middle.indexes.topics, `bridges/elementaryTransitions/${record.id}`, errors);
    }
  }
  if (bridge.release.rightsStatus !== 'cleared') errors.push('bridges/release.json: rights status must be cleared (public official documents)');
  if (inventoryReport.diagnosticCount !== 0) errors.push(`data/kr/inventory-report.json: ${inventoryReport.diagnosticCount} unresolved diagnostics`);
  for (const profile of ['middle', 'high', 'bridges']) {
    for (const [name, count] of Object.entries(inventoryReport[profile])) {
      if (loaded[profile].release.counts[name] !== count) errors.push(`data/kr/inventory-report.json: ${profile}.${name} count mismatch`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    loaded,
    sourceManifest,
    vocabularies,
    officialSourceCatalog,
    officialSourceReceipts,
    inventoryReport,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateRepository();
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
  const summary = Object.fromEntries(
    Object.entries(result.loaded).map(([profile, value]) => [profile, value.release.counts]),
  );
  console.log(`validation passed: ${JSON.stringify(summary)}`);
}
