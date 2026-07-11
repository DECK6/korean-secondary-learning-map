import { describe, expect, test } from 'bun:test';
import { createAjv, validateRepository } from '../scripts/validate.mjs';

describe('repository schema contract', () => {
  test('validates the complete candidate repository', async () => {
    const result = await validateRepository();
    expect(result.errors).toEqual([]);
    expect(result.loaded.middle.release.counts.coverageGaps).toBe(2);
    expect(result.loaded.high.release.counts.coverageGaps).toBe(2);
    expect(result.loaded.bridges.release.counts.coverageGaps).toBe(1);
    expect(result.loaded.middle.release.counts.standards).toBe(714);
    expect(result.loaded.high.release.counts.standards).toBe(50749);
    expect(result.loaded.middle.release.counts.domains).toBe(149);
    expect(result.loaded.high.release.counts.domains).toBe(5169);
    expect(result.loaded.middle.release.counts.learningRelations).toBe(0);
    expect(result.loaded.high.release.counts.learningRelations).toBe(0);
    expect(result.loaded.bridges.release.counts.transitionAlignments).toBe(398);
    expect(result.inventoryReport.diagnosticCount).toBe(0);
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
