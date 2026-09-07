// Facet collapse rules — K-12 공통 계약 v1 8절 (topicRole·collapseInto·collapseReason).
//
// A middle-school achievement standard is decomposed into one `standard-core` topic plus 1-4
// subject facets. Authoring reports found standards where that split is artificial: the facets
// restate the anchor rather than adding a distinct performance. Topic ids, overlays, bridges and
// relations all reference topics, so a flagged facet is never deleted — it is marked `auxiliary`
// and points at the sibling a tutor should present instead.
//
// Only standards named by an authoring or review report belong here (계약 8절: 추측 금지). The
// sources are the R3-B4 / R5-B4 / R5-B5 reports recorded in docs/plans/PROGRESS.md and the
// v0.6.0-candidate release report. `check:content` additionally reports automatic
// `overlapping-facets` candidates, but never adds them to this table on its own.

export const TOPIC_ROLES = ['anchor', 'facet', 'auxiliary'];

export const COLLAPSE_REASONS = [
  'attitude-standard',
  'metacognitive-standard',
  'unit-relation-standard',
  'overlapping-facets',
  'process-standard',
];

/** Sibling overlays at or above this token Jaccard are reported as automatic collapse candidates. */
export const AUTO_CANDIDATE_JACCARD = 0.6;

/**
 * `code` is the bracketed official standard code, `auxiliaryFacetKeys` are common facet keys
 * (계약 4절 8종) of the sibling topics that collapse into the standard's anchor.
 */
export const facetCollapseRules = [
  {
    code: '[9국01-10]',
    auxiliaryFacetKeys: ['reflection'],
    reason: 'attitude-standard',
    note: '언어폭력 성찰과 존중하는 표현이라는 태도 자체가 성취기준 본문이라, critical-reflection facet이 core 주제를 되풀이한다(R5-B4 보고: 성찰형 성취기준).',
  },
  {
    code: '[9국01-11]',
    auxiliaryFacetKeys: ['reflection'],
    reason: 'metacognitive-standard',
    note: '듣기·말하기 과정의 점검과 조정이 성취기준 전체여서 core와 reflection facet이 겹친다(R5-B4 보고: 점검·조정 성취기준 3건).',
  },
  {
    code: '[9국02-08]',
    auxiliaryFacetKeys: ['reflection'],
    reason: 'metacognitive-standard',
    note: '읽기 과정의 점검·조정이 성취기준 전체여서 core와 reflection facet이 겹친다(R5-B4 보고: 점검·조정 성취기준 3건).',
  },
  {
    code: '[9국03-08]',
    auxiliaryFacetKeys: ['reflection'],
    reason: 'metacognitive-standard',
    note: '쓰기 과정·전략의 점검·조정과 고쳐 쓰기가 성취기준 전체여서 core와 reflection facet이 겹친다(R5-B4 보고: 점검·조정 성취기준 3건).',
  },
  {
    code: '[9국03-09]',
    auxiliaryFacetKeys: ['reflection'],
    reason: 'attitude-standard',
    note: '필자로서 자신을 성찰하고 윤리적 소통 문화에 기여하는 태도가 성취기준 본문이라, reflection facet이 core 주제와 같은 수행을 가리킨다(R5-B4 보고: 성찰형 성취기준).',
  },
  {
    code: '[9국05-09]',
    auxiliaryFacetKeys: ['reflection'],
    reason: 'attitude-standard',
    note: '타자 이해와 공동체 참여 태도가 성취기준 본문이라, reflection facet이 core 주제와 같은 수행을 가리킨다(R5-B4 보고: 성찰형 성취기준).',
  },
  {
    code: '[9수01-08]',
    auxiliaryFacetKeys: ['representation', 'application'],
    reason: 'overlapping-facets',
    note: '무리수 개념 이해와 유용성 인식이라는 하나의 수행을 세 관점으로 쪼갠 결과가 서로 크게 다르지 않다(R3-B4 보고, v0.6.0-candidate 릴리스 보고서 facet 축약 후보).',
  },
  {
    code: '[9수02-21]',
    auxiliaryFacetKeys: ['representation', 'application'],
    reason: 'overlapping-facets',
    note: '이차함수 개념 이해 하나를 세 관점으로 쪼갠 결과가 서로 크게 다르지 않다(R3-B4 보고, v0.6.0-candidate 릴리스 보고서 facet 축약 후보).',
  },
  {
    code: '[9수03-17]',
    auxiliaryFacetKeys: ['representation', 'application'],
    reason: 'overlapping-facets',
    note: '삼각비를 활용한 문제 해결이라는 하나의 수행을 세 관점으로 쪼갠 결과가 서로 크게 다르지 않다(R3-B4 보고, v0.6.0-candidate 릴리스 보고서 facet 축약 후보).',
  },
  {
    code: '[9수04-04]',
    auxiliaryFacetKeys: ['representation', 'application'],
    reason: 'process-standard',
    note: '문제 설정 → 자료 수집 → 분석 → 해석의 통계적 탐구 과정 전체가 한 성취기준이라, 세 facet이 같은 과정의 조각이 된다(R3-B4 보고).',
  },
  {
    code: '[9과01-03]',
    auxiliaryFacetKeys: ['inquiry'],
    reason: 'attitude-standard',
    note: '토의하고 활동 방안을 찾아 실천하는 태도가 성취기준 본문이고, 자료 수집을 다루는 inquiry facet은 성취기준 문장에 없는 확장이다(R5-B5 보고).',
  },
  {
    code: '[9과02-05]',
    auxiliaryFacetKeys: ['inquiry'],
    reason: 'attitude-standard',
    note: '생물다양성 보전의 필요성 이해와 실천이 성취기준 본문이고, inquiry facet은 조사 절차를 덧붙인 확장이다(R5-B5 보고).',
  },
  {
    code: '[9과18-01]',
    auxiliaryFacetKeys: ['inquiry'],
    reason: 'process-standard',
    note: '분포·활용 사례 조사에서 물의 가치 토론까지가 한 성취기준의 과정이라, inquiry facet이 core 주제의 앞 단계를 되풀이한다(R5-B5 보고).',
  },
  {
    code: '[9과22-01]',
    auxiliaryFacetKeys: ['inquiry'],
    reason: 'process-standard',
    note: '재해·재난 자료 조사에서 원인·피해 분석까지가 한 성취기준의 과정이라, 조사 단계만 떼어 낸 inquiry facet이 core 주제와 같은 수행을 가리킨다(R5-B5 보고: 재난 영역 inquiry facet 해석 확장).',
  },
  {
    code: '[9과22-02]',
    auxiliaryFacetKeys: ['inquiry'],
    reason: 'overlapping-facets',
    note: '과학적 원리를 이용한 대비·대처 방안 수립이 성취기준 전체여서 inquiry facet을 계획 수립으로 늘려 잡아야 했다(R5-B5 보고: 재난 영역 inquiry facet 해석 확장).',
  },
  {
    code: '[9과23-01]',
    auxiliaryFacetKeys: ['inquiry'],
    reason: 'process-standard',
    note: '직업 조사에서 미래 직업 변화 예상까지가 한 성취기준의 과정이라, 조사 단계만 떼어 낸 inquiry facet이 core 주제와 겹친다(R5-B5 보고: 진로 영역 inquiry facet 해석 확장).',
  },
  {
    code: '[9과23-02]',
    auxiliaryFacetKeys: ['inquiry'],
    reason: 'process-standard',
    note: '진로 관련 과학 분야 조사에서 학습 계획 수립까지가 한 성취기준의 과정이라, inquiry facet이 core 주제의 조사 단계를 되풀이한다(R5-B5 보고: 진로 영역 inquiry facet 해석 확장).',
  },
];

export const facetCollapseRuleByCode = new Map(facetCollapseRules.map((rule) => [rule.code, rule]));

/** Token set used by the automatic overlapping-facets detector: 2+ character Korean or alphanumeric runs. */
export function overlayTokens(strings) {
  return new Set(
    (strings ?? [])
      .join(' ')
      .toLowerCase()
      .split(/[^0-9a-z가-힣]+/)
      .filter((token) => token.length >= 2),
  );
}

export function jaccard(left, right) {
  if (!left.size && !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}
