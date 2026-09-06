import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { OVERLAY_SCHEMA_ID, analyzeOverlay, contentOverlayDirectory, indexOverlayEntries, readContentOverlays } from './lib/content-overlay.mjs';
import { collectionFiles } from './lib/profile-collections.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const schemaFiles = [
  'core.schema.json',
  'source-manifest.schema.json',
  'controlled-vocabularies.schema.json',
  'official-source-catalog.schema.json',
  'official-source-receipts.schema.json',
  'middle-profile.schema.json',
  'high-profile.schema.json',
  'high-vocational-profile.schema.json',
  'bridge-profile.schema.json',
  'content-overlay.schema.json',
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
      candidateLearningRelations: 'candidateLearningRelationCollection',
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
      candidateLearningRelations: 'candidateLearningRelationCollection',
      courseRelations: 'courseRelationCollection',
      creditRules: 'creditRuleCollection',
      choiceSets: 'choiceSetCollection',
      pathways: 'pathwayCollection',
      reviewRecords: 'reviewRecordCollection',
      coverageGaps: 'coverageGapCollection',
    },
  },
  'high-vocational': {
    schemaId: 'https://dexa.art/learnmap/schema/secondary/high-vocational-profile.schema.json',
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
  bridges: {
    schemaId: 'https://dexa.art/learnmap/schema/secondary/bridge-profile.schema.json',
    collectionDefs: {
      transitionAlignments: 'transitionAlignmentCollection',
      elementaryTransitions: 'elementaryTransitionCollection',
      candidateElementaryTransitions: 'candidateElementaryTransitionCollection',
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

const candidateBasisKinds = new Set(['official-code-order', 'decomposition-order', 'repository-authored']);

function findCycle(edges) {
  const outgoing = new Map();
  const indegree = new Map();
  for (const edge of edges) {
    const { prerequisiteTopicId: before, dependentTopicId: after } = edge;
    if (!outgoing.has(before)) outgoing.set(before, []);
    outgoing.get(before).push(after);
    indegree.set(before, indegree.get(before) ?? 0);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
  }
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  for (let index = 0; index < queue.length; index += 1) {
    visited += 1;
    for (const next of outgoing.get(queue[index]) ?? []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  return indegree.size - visited;
}

// K-12 공통 계약 v1 7절 1·2: 층 불변식, 층별 DAG, 합집합 DAG, dangling 참조, 층 간 중복.
function validateRelationLayers(profile, collections, errors) {
  const official = collections.learningRelations?.records ?? [];
  const candidate = collections.candidateLearningRelations?.records ?? [];
  const topicIds = new Set((collections.topics?.records ?? []).map((topic) => topic.id));
  for (const relation of official) {
    const label = `${profile}/learningRelations/${relation.id}`;
    if (relation.layer !== 'official') errors.push(`${label}: official file must carry layer=official`);
    if (relation.basisKind !== 'official-source') errors.push(`${label}: official layer allows only official-source evidence`);
    if (relation.relationKind !== 'required-prerequisite') errors.push(`${label}: official layer allows only required-prerequisite`);
    if (!/ p\.\d+/.test(relation.basis)) errors.push(`${label}: official basis must cite a printed page`);
  }
  const officialPairs = new Set(official.map((relation) => `${relation.prerequisiteTopicId}|${relation.dependentTopicId}`));
  for (const relation of candidate) {
    const label = `${profile}/candidateLearningRelations/${relation.id}`;
    if (relation.layer !== 'pedagogical-candidate') errors.push(`${label}: candidate file must carry layer=pedagogical-candidate`);
    if (relation.relationKind !== 'recommended-before') errors.push(`${label}: candidate layer allows only recommended-before`);
    if (relation.strength !== 'recommended') errors.push(`${label}: candidate layer allows only recommended strength`);
    if (relation.reviewStatus !== 'candidate') errors.push(`${label}: candidate layer must stay under review`);
    if (!candidateBasisKinds.has(relation.basisKind)) errors.push(`${label}: candidate basisKind ${relation.basisKind} is not a candidate evidence kind`);
    if (officialPairs.has(`${relation.prerequisiteTopicId}|${relation.dependentTopicId}`)) errors.push(`${label}: duplicates an official relation`);
    for (const topicId of [relation.prerequisiteTopicId, relation.dependentTopicId]) {
      if (!topicIds.has(topicId)) errors.push(`${label}: unresolved reference ${topicId}`);
    }
  }
  for (const [label, edges] of [
    [`${profile}/candidateLearningRelations`, candidate],
    [`${profile} official+candidate union`, [...official, ...candidate]],
  ]) {
    const cyclic = findCycle(edges);
    if (cyclic) errors.push(`${label}: cycle detected (${cyclic} nodes)`);
  }
}

// K-12 공통 계약 v1 7절 1·2를 초→중 bridge에 적용한다. 두 층은 파일이 다르고, 후보 층은 official 쌍을
// 반복하지 않으며, 두 층의 합집합도 DAG여야 한다.
function validateBridgeLayers(collections, elementaryTopicIds, representativeById, middleTopicIds, errors) {
  const official = collections.elementaryTransitions?.records ?? [];
  const candidate = collections.candidateElementaryTransitions?.records ?? [];
  const officialPairs = new Set(official.map((relation) => `${relation.prerequisiteTopicId}|${relation.dependentTopicId}`));
  for (const relation of candidate) {
    const label = `bridges/candidateElementaryTransitions/${relation.id}`;
    if (relation.layer !== 'pedagogical-candidate') errors.push(`${label}: candidate file must carry layer=pedagogical-candidate`);
    if (relation.relationKind !== 'recommended-before') errors.push(`${label}: candidate layer allows only recommended-before`);
    if (relation.strength !== 'recommended') errors.push(`${label}: candidate layer allows only recommended strength`);
    if (relation.reviewStatus !== 'candidate') errors.push(`${label}: candidate layer must stay under review`);
    if (!candidateBasisKinds.has(relation.basisKind)) errors.push(`${label}: candidate basisKind ${relation.basisKind} is not a candidate evidence kind`);
    if (officialPairs.has(`${relation.prerequisiteTopicId}|${relation.dependentTopicId}`)) errors.push(`${label}: duplicates an official bridge`);
    requireRefs([relation.prerequisiteTopicId], elementaryTopicIds, label, errors);
    requireRefs([relation.dependentTopicId], middleTopicIds, label, errors);
    if (!representativeById.has(relation.prerequisiteTopicId)) {
      errors.push(`${label}: prerequisite is not the pinned representative topic of its elementary standard`);
    }
  }
  for (const [label, edges] of [
    ['bridges/candidateElementaryTransitions', candidate],
    ['bridges official+candidate union', [...official, ...candidate]],
  ]) {
    const cyclic = findCycle(edges);
    if (cyclic) errors.push(`${label}: cycle detected (${cyclic} nodes)`);
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

function validateProfileReferences(profile, collections, indexes, errors, siblingTopics = new Set()) {
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
  const prerequisiteTopics = siblingTopics.size ? new Set([...topics, ...siblingTopics]) : topics;
  for (const relation of collections.learningRelations?.records ?? []) {
    requireRefs([relation.dependentTopicId], topics, `${profile}/learningRelations/${relation.id}`, errors);
    requireRefs([relation.prerequisiteTopicId], prerequisiteTopics, `${profile}/learningRelations/${relation.id}`, errors);
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

// 주제 콘텐츠 오버레이(P3-2): 스키마·dangling·원문 복사·중복·빌드 반영 여부를 함께 본다.
async function validateContentOverlays(root, profile, collections, sourceIds, ajv, errors) {
  const overlays = await readContentOverlays(contentOverlayDirectory(root, profile));
  const validate = ajv.getSchema(OVERLAY_SCHEMA_ID);
  const topicsById = new Map((collections.topics?.records ?? []).map((topic) => [topic.id, topic]));
  const standardsById = new Map((collections.standards?.records ?? []).map((standard) => [standard.id, standard]));
  const coursesById = new Map((collections.courses?.records ?? []).map((course) => [course.id, course]));

  for (const overlay of overlays) {
    const label = `${profile}/content/${overlay.file}`;
    assertSchema(validate, overlay.document, label, errors);
    requireRefs(overlay.document.sourceRefs, sourceIds, label, errors);
    for (const entry of Object.values(overlay.document.entries ?? {})) {
      requireRefs([entry.sourceLocator?.sourceId], sourceIds, label, errors);
    }
    errors.push(...analyzeOverlay({ label, overlay, topicsById, standardsById, coursesById }).errors);
  }
  const { entries, errors: indexErrors } = indexOverlayEntries(overlays);
  for (const message of indexErrors) errors.push(`${profile}/content: ${message}`);

  // The built topics must already carry the overlay: run `bun run build:data` after authoring.
  for (const [topicId, hit] of entries) {
    const topic = topicsById.get(topicId);
    if (!topic) continue;
    const same = topic.contentKind === 'source-grounded-draft'
      && JSON.stringify(topic.evidence) === JSON.stringify(hit.entry.evidence)
      && JSON.stringify(topic.assessmentPrompts) === JSON.stringify(hit.entry.assessmentPrompts);
    if (!same) errors.push(`${profile}/topics/${topicId}: content overlay ${hit.file} is not merged into the build output`);
  }
  for (const topic of topicsById.values()) {
    if (topic.contentKind === 'source-grounded-draft' && !entries.has(topic.id)) errors.push(`${profile}/topics/${topic.id}: source-grounded-draft without a content overlay entry`);
  }
  return overlays.length;
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

// Every published data file must stay well under GitHub's 100 MB hard limit, so a collection that
// would grow past this is sharded (see data/kr/high-vocational). Keep in sync with docs/data-contract.md 1절.
export const MAX_DATA_FILE_BYTES = 25 * 1024 * 1024;

async function validateDataFileSizes(root, errors) {
  const queue = [join(root, 'data/kr')];
  let checked = 0;
  while (queue.length) {
    const directory = queue.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        queue.push(path);
        continue;
      }
      if (!entry.name.endsWith('.json')) continue;
      checked += 1;
      const { size } = await stat(path);
      if (size > MAX_DATA_FILE_BYTES) {
        errors.push(`${path.slice(root.length + 1)}: ${(size / 1048576).toFixed(1)} MB exceeds the ${MAX_DATA_FILE_BYTES / 1048576} MB publish limit; shard the collection`);
      }
    }
  }
  return checked;
}

export async function validateRepository(root = projectRoot) {
  const errors = [];
  const ajv = await createAjv(root);
  const dataFileCount = await validateDataFileSizes(root, errors);

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
    for (const [collectionName, entry] of Object.entries(release.collections)) {
      const definition = config.collectionDefs[collectionName];
      if (!definition) {
        errors.push(`${profile}/release.json: no schema mapping for collection ${collectionName}`);
        continue;
      }
      // A collection is one file, or an ordered list of `<dir>/<slug>.json` shards when a single
      // document would pass the 25 MB publish limit.
      const files = collectionFiles(entry);
      let merged = null;
      const records = [];
      for (const file of files) {
        if (!/^(?:[a-z][a-z0-9-]*\/)?[a-z][a-z0-9.-]*\.json$/.test(file)) {
          errors.push(`${profile}/release.json: collection path must be a local file: ${file}`);
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
        walkSourceRefs(collection.records, (sourceRef) => {
          if (!sourceIds.has(sourceRef)) errors.push(`${profile}/${file}: unresolved sourceRef ${sourceRef}`);
        });
        records.push(...collection.records);
        merged = collection;
      }
      if (!merged) continue;
      if (release.counts[collectionName] !== records.length) {
        errors.push(`${profile}/release.json: count ${collectionName}=${release.counts[collectionName]} != ${records.length}`);
      }
      collections[collectionName] = { ...merged, recordCount: records.length, records };
      indexes[collectionName] = uniqueIds(records, `${profile}/${collectionName}`, errors);
    }
    loaded[profile] = { release, collections, indexes };
    validateOfficialRelations(profile, collections, errors);
    validateReviewTargets(profile, collections, indexes, errors);
    if (profile !== 'bridges') {
      // Both high-school releases share one id namespace: a vocational relation may name an
      // academic prerequisite (별책26 미용전문교과 cites 미술 전공 실기), never the other way round.
      const siblingTopics = profile === 'high-vocational' ? loaded.high?.indexes.topics ?? new Set() : new Set();
      validateProfileReferences(profile, collections, indexes, errors, siblingTopics);
      validateLearningGraph(profile, collections, errors);
      validateRelationLayers(profile, collections, errors);
      await validateContentOverlays(root, profile, collections, sourceIds, ajv, errors);
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
    const representativeById = new Map((inventory.standards ?? []).map((standard) => [standard.representativeTopicId, standard]));
    const collection = bridge.collections.elementaryTransitions;
    if (collection.elementaryReleaseVersion !== inventory.elementaryReleaseVersion) {
      errors.push('bridges/elementary-transitions.json: elementaryReleaseVersion does not pin the inventory version');
    }
    for (const record of collection.records) {
      if (record.layer !== 'official') errors.push(`bridges/elementaryTransitions/${record.id}: bridge file must carry layer=official`);
      requireRefs([record.prerequisiteTopicId], elementaryTopicIds, `bridges/elementaryTransitions/${record.id}`, errors);
      requireRefs([record.dependentTopicId], loaded.middle.indexes.topics, `bridges/elementaryTransitions/${record.id}`, errors);
      // Contract v1 section 3: every bridge starts from the pinned representative topic of an
      // elementary standard, so one subject cannot pick a different facet than another.
      if (!representativeById.has(record.prerequisiteTopicId)) {
        errors.push(`bridges/elementaryTransitions/${record.id}: prerequisite is not the pinned representative topic of its elementary standard`);
      }
    }
    validateBridgeLayers(bridge.collections, elementaryTopicIds, representativeById, loaded.middle.indexes.topics, errors);
  }
  if (bridge.release.rightsStatus !== 'cleared') errors.push('bridges/release.json: rights status must be cleared (public official documents)');
  if (inventoryReport.diagnosticCount !== 0) errors.push(`data/kr/inventory-report.json: ${inventoryReport.diagnosticCount} unresolved diagnostics`);
  for (const profile of Object.keys(profileConfig)) {
    for (const [name, count] of Object.entries(inventoryReport[profile])) {
      if (loaded[profile].release.counts[name] !== count) errors.push(`data/kr/inventory-report.json: ${profile}.${name} count mismatch`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    dataFileCount,
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
  console.log(`validation passed: ${result.dataFileCount} data files under ${MAX_DATA_FILE_BYTES / 1048576} MB, ${JSON.stringify(summary)}`);
}
