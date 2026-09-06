import { describe, expect, test } from 'bun:test';
import { readdir, stat } from 'node:fs/promises';
import { MAX_DATA_FILE_BYTES, createAjv, validateRepository } from '../scripts/validate.mjs';
import { officialRelationSpecs } from '../scripts/lib/official-relation-specs/index.mjs';

const highRequiredIn = (specs) => specs.reduce(
  (total, spec) => total + (spec.highRequired ?? []).length + (spec.highCommentaryRequired ?? []).length,
  0,
);
// R5-A publishes the specialised vocational subjects as their own release; every voc-* spec module
// lands there, and the academic release keeps the rest. Ids never moved.
const registeredHighRequired = highRequiredIn(officialRelationSpecs.filter((spec) => !spec.subject.startsWith('voc-')));
const registeredVocationalRequired = highRequiredIn(officialRelationSpecs.filter((spec) => spec.subject.startsWith('voc-')));

describe('repository schema contract', () => {
  test('validates the complete candidate repository', async () => {
    const result = await validateRepository();
    expect(result.errors).toEqual([]);
    expect(result.loaded.middle.release.counts.coverageGaps).toBe(2);
    expect(result.loaded.high.release.counts.coverageGaps).toBe(2);
    expect(result.loaded['high-vocational'].release.counts.coverageGaps).toBe(2);
    expect(result.loaded.bridges.release.counts.coverageGaps).toBe(1);
    expect(result.loaded.middle.release.counts.standards).toBe(714);
    expect(result.loaded.middle.release.counts.topics).toBe(2160);
    expect(result.loaded.high.release.counts.standards).toBe(3124);
    expect(result.loaded['high-vocational'].release.counts.standards).toBe(47625);
    expect(result.loaded.high.release.counts.standards + result.loaded['high-vocational'].release.counts.standards).toBe(50749);
    expect(result.loaded.high.release.counts.courses).toBe(231);
    expect(result.loaded['high-vocational'].release.counts.courses).toBe(528);
    expect(result.loaded.middle.release.counts.domains).toBe(149);
    expect(result.loaded.high.release.counts.domains).toBe(689);
    expect(result.loaded['high-vocational'].release.counts.domains).toBe(4480);
    expect(result.loaded.middle.release.counts.learningRelations).toBe(56);
    expect(result.loaded.high.release.counts.learningRelations).toBe(registeredHighRequired);
    expect(result.loaded['high-vocational'].release.counts.learningRelations).toBe(registeredVocationalRequired);
    expect(result.loaded.middle.release.counts.candidateLearningRelations).toBeGreaterThan(0);
    expect(result.loaded.high.release.counts.candidateLearningRelations).toBeGreaterThan(0);
    expect(result.loaded['high-vocational'].release.collections.candidateLearningRelations).toBeUndefined();
    expect(result.loaded.high.release.counts.courseRelations).toBe(39);
    expect(result.loaded.bridges.release.counts.transitionAlignments).toBe(175);
    expect(result.loaded.bridges.release.counts.elementaryTransitions).toBe(290);
    expect(result.loaded.bridges.release.counts.candidateElementaryTransitions).toBeGreaterThan(0);
    expect(result.inventoryReport.diagnosticCount).toBe(0);
    expect(result.inventoryReport.middleTopicDecomposition.topicsPerStandard.distribution).toEqual({ '2': 77, '3': 564, '4': 51, '5': 22 });
    expect(result.inventoryReport.comparisonBaselines.elementary.dataRelease).toBe('kr-full-depth-v0.5');
    // Every published data file stays under the 25 MB limit; standards and topics are sharded.
    expect(result.dataFileCount).toBeGreaterThan(0);
    expect(result.loaded['high-vocational'].release.collections.standards).toHaveLength(18);
    expect(result.loaded['high-vocational'].release.collections.topics).toHaveLength(18);
  }, 60000);

  test('keeps every published data file under the 25 MB publish limit', async () => {
    const files = [];
    const queue = ['data/kr'];
    while (queue.length) {
      const directory = queue.pop();
      for (const entry of await readdir(new URL(`../${directory}`, import.meta.url), { withFileTypes: true })) {
        if (entry.isDirectory()) queue.push(`${directory}/${entry.name}`);
        else if (entry.name.endsWith('.json')) files.push(`${directory}/${entry.name}`);
      }
    }
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      const { size } = await stat(new URL(`../${file}`, import.meta.url));
      expect([file, size <= MAX_DATA_FILE_BYTES]).toEqual([file, true]);
    }
  });

  test('rejects a vocational course that does not declare the specialised program scope', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema('https://dexa.art/learnmap/schema/secondary/high-vocational-profile.schema.json#/$defs/course');
    const candidate = {
      id: 'kr.course.2022.high.example',
      labelKorean: '예시 전공 실무',
      labelEnglish: null,
      sourceRefs: [],
      verificationStatus: 'official-source-checked',
      reviewStatus: 'candidate',
      sourceTextIncluded: false,
      schoolLevel: 'high',
      subjectGroupId: 'kr.subject-group.example',
      courseCategory: 'major-practical',
      programScopes: ['all-high-schools'],
      gradeScope: null,
      creditRuleRefs: [],
    };
    expect(validate(candidate)).toBe(false);
    expect(validate({ ...candidate, programScopes: ['specialized-vocational'] })).toBe(true);
  });

  test('requires high-school course category and program scope', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema('https://dexa.art/learnmap/schema/secondary/high-profile.schema.json#/$defs/course');
    const candidate = {
      id: 'kr.course.2022.high.example',
      labelKorean: '예시 과목',
      sourceRefs: [],
      verificationStatus: 'needs-official-code-check',
      reviewStatus: 'candidate',
      sourceTextIncluded: false,
      schoolLevel: 'high',
      subjectGroupId: 'kr.subject-group.example',
      gradeScope: null,
      creditRuleRefs: [],
    };
    expect(validate(candidate)).toBe(false);
  });

  test('rejects high-school credit fields from a middle-school course', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema('https://dexa.art/learnmap/schema/secondary/middle-profile.schema.json#/$defs/course');
    const candidate = {
      id: 'kr.course.2022.middle.example',
      labelKorean: '예시 교과',
      sourceRefs: [],
      verificationStatus: 'needs-official-code-check',
      reviewStatus: 'candidate',
      sourceTextIncluded: false,
      schoolLevel: 'middle',
      subjectGroupId: 'kr.subject-group.example',
      courseCategory: 'common',
      gradeScope: ['7-9'],
      creditRuleRefs: [],
    };
    expect(validate(candidate)).toBe(false);
  });

  test('does not allow a model candidate to claim an official prerequisite', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema('https://dexa.art/learnmap/schema/secondary/high-profile.schema.json#/$defs/courseRelation');
    const candidate = {
      id: 'kr.course-relation.example',
      fromCourseId: 'kr.course.a',
      toCourseId: 'kr.course.b',
      relationKind: 'official-prerequisite',
      claimStatus: 'candidate',
      reason: '예시',
      sourceRefs: [],
      reviewStatus: 'candidate',
    };
    expect(validate(candidate)).toBe(false);
  });

  test('rejects repository-authored learning relations', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema('https://dexa.art/learnmap/schema/secondary/middle-profile.schema.json#/$defs/learningRelation');
    const candidate = {
      id: 'kr.learning-relation.example',
      dependentTopicId: 'kr.topic.b',
      prerequisiteTopicId: 'kr.topic.a',
      layer: 'official',
      relationKind: 'recommended-before',
      scope: 'same-course',
      strength: 'recommended',
      reason: '예시',
      basisKind: 'repository-authored',
      basis: 'example',
      sourceRefs: [],
      reviewStatus: 'internal-reviewed',
    };
    expect(validate(candidate)).toBe(false);
  });

  test('accepts a reviewed official high-school cross-course prerequisite', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema('https://dexa.art/learnmap/schema/secondary/high-profile.schema.json#/$defs/learningRelation');
    const candidate = {
      id: 'kr.learning-relation.example',
      dependentTopicId: 'kr.topic.b',
      prerequisiteTopicId: 'kr.topic.a',
      layer: 'official',
      relationKind: 'required-prerequisite',
      scope: 'cross-course',
      strength: 'required',
      reason: '공식 해설이 직접 연결한 예시 관계다.',
      basisKind: 'official-source',
      basis: '교육부 고시 제2022-33호 별책8 수학과 교육과정 성취기준 해설 p.1',
      sourceRefs: ['kr-moe-2022-33-annex8'],
      reviewStatus: 'internal-reviewed',
    };
    expect(validate(candidate)).toBe(true);
  });

  test('requires a bridge alignment to target a high course or topic', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema('https://dexa.art/learnmap/schema/secondary/bridge-profile.schema.json#/$defs/transitionAlignment');
    const candidate = {
      id: 'kr.transition.example',
      fromSchoolLevel: 'middle',
      toSchoolLevel: 'high',
      fromCourseIds: ['kr.course.middle.example'],
      fromTopicIds: ['kr.topic.middle.example'],
      toCourseIds: [],
      toTopicIds: [],
      transitionKind: 'deepens',
      reason: '예시',
      basisKind: 'model-candidate',
      basis: 'fixture',
      sourceRefs: [],
      reviewStatus: 'candidate',
    };
    expect(validate(candidate)).toBe(false);
  });

  test('marks illustrative pathways as non-official', async () => {
    const ajv = await createAjv();
    const validate = ajv.getSchema('https://dexa.art/learnmap/schema/secondary/high-profile.schema.json#/$defs/pathway');
    const candidate = {
      id: 'kr.pathway.example',
      labelKorean: '예시 경로',
      pathwayKind: 'illustrative',
      audience: 'student',
      steps: [{ order: 1, stepKind: 'foundation', courseIds: [], choiceSetId: null, reason: '예시' }],
      notOfficialRequirement: false,
      reviewStatus: 'candidate',
    };
    expect(validate(candidate)).toBe(false);
  });
});
