# 결정: 중학교 facet 24종 → K-12 공통 facet 8종 사상

- 결정일: 2026-09-05
- 근거 계약: `docs/plans/2026-09-05-k12-relation-vocabulary-spec.md` 4절 (공통 facet 8종), 5절 (ID 안정성)
- 적용 대상: `data/kr/middle/topics.json` 2,160건, `data/kr/high/topics.json` 50,749건
- 구현: `scripts/build-curriculum-data.mjs`의 `commonFacetKeyByDetail`, `data/kr/shared/controlled-vocabularies.json`의 `facetKeys`·`facetKeyMappings`

## 1. 왜 두 필드인가

중학교 주제 ID는 `sha256(standardId | facetKey)`로 발급됐다. 과목별 24종 키를 8종으로 바꾸면 2,160개 주제 ID가 전부 재발급되고 초→중 bridge 290건과 라이브 UI 링크가 깨진다. 거버넌스의 "기존 IRI 비재발급" 원칙에 따라 **해시 입력은 원값을 그대로 쓰고**, 원값을 `facetKeyDetail`에 보존한 뒤 공통 어휘를 `facetKey`에 새로 담았다.

- `facetKeyDetail`: 과목별 24종 (기존 `facetKey` 값). 주제 ID 해시 입력.
- `facetKey`: K-12 공통 8종. 초등 저장소와 같은 SKOS scheme(`slm:facetScheme`).

고등학교 주제는 성취기준과 1:1이라 분해가 없으므로 `facetKey: core`만 갖는다(`facetKeyDetail` 없음).

## 2. 사상 원칙

1. **라벨의 앞 축을 따른다.** 이 저장소의 facet 라벨은 "A와 B" 꼴이고 A가 주된 인지 행위다. 예: `언어 산출과 의사소통 성찰` → 산출(수행) 축이 주된 행위.
2. **한 성취기준 안에서 8종 키가 겹치지 않게 한다.** 같은 성취기준의 두 주제가 같은 `facetKey`를 가지면 튜터가 "핵심 → 관점 A → 관점 B"를 구분할 수 없고, `scripts/validate.mjs`의 성취기준별 facet 중복 검사도 실패한다. 아래 표는 11개 facet 조합 전부에서 겹침이 없다.
3. **과목 쌍의 대비를 보존한다.** 과학·사회의 두 facet은 "자료를 다루는 축(inquiry)"과 "판단·적용 축(application)"으로 갈라 원래의 대비를 유지한다.
4. `standard-core` 주제는 `core`로 고정한다(계약 4절 표의 중등 전용 값).

## 3. 사상표 (24 → 8)

| facetKeyDetail | 라벨 | 주제 `types` | facetKey | 근거 |
| --- | --- | --- | --- | --- |
| `core` | 성취기준 핵심 주제 | (성취기준 유형) | `core` | 계약 4절: 성취기준 전체 핵심 |
| `ethical-concept` | 윤리 개념과 가치 관계 이해 | conceptual | `concept` | 개념·가치 관계의 구분이 주된 행위 |
| `design-problem-solving` | 설계·문제 해결과 안전한 수행 | procedural | `procedure` | 설계·제작 수행이 주된 행위. 기술·가정/정보의 유일 facet |
| `skill-strategy` | 기능·전략과 안전한 수행 | procedural | `procedure` | 기능 수행 축 |
| `performance-creation` | 연주·창작과 음악적 표현 | procedural | `procedure` | 연주·창작 수행 축 |
| `production-reflection` | 언어 산출과 의사소통 성찰 | procedural | `procedure` | 산출 수행 축. 같은 과목의 `reception-interaction`(communication)과 대비 |
| `representation-modeling` | 표현·모델링과 수학적 연결 | representational | `representation` | 계약의 representation 정의(표현·모델링·변환)와 직접 일치 |
| `exploration-expression` | 조형 탐색과 시각적 표현 | representational | `representation` | 시각적 표현·변환 축 |
| `problem-solving-explanation` | 문제 해결과 수학적 설명 | procedural | `application` | 계약의 application 정의(적용·문제 해결)와 직접 일치 |
| `evidence-explanation` | 증거 기반 설명과 적용 | procedural | `application` | 과학 쌍에서 적용 축. 짝 facet `inquiry-data`가 탐구 축 |
| `evidence-judgment` | 근거 기반 판단과 사회적 적용 | meta | `application` | 사회·역사 쌍에서 사회적 적용 축. 짝 facet `source-context`가 탐구 축 |
| `application-evidence` | 사례·자료 적용과 근거 제시 | procedural | `application` | 기타 교과(보건·환경·진로·한문 등) 기본 쌍의 적용 축 |
| `inquiry-data` | 탐구 설계와 자료 해석 | representational | `inquiry` | 계약의 inquiry 정의(탐구·자료·근거)와 직접 일치 |
| `source-context` | 자료·맥락 해석과 관점 비교 | representational | `inquiry` | 사료·자료 해석이 주된 행위 |
| `language-analysis` | 언어 자료 분석과 의미 구성 | language | `inquiry` | 언어 **자료의 분석**이 주된 행위. 같은 과목의 `communication-production`이 표현 축이므로 communication과 분리 |
| `case-judgment` | 도덕적 사례 분석과 근거 판단 | representational | `inquiry` | 사례 자료 분석·근거 축 |
| `communication-production` | 의사소통 표현과 수행 | procedural | `communication` | 계약의 communication 정의(언어 표현·의사소통)와 직접 일치 |
| `dialogue-practice` | 대화·토론과 공동체 실천 | procedural | `communication` | 대화·토론이 주된 행위 |
| `reception-interaction` | 이해·상호작용과 의미 협상 | language | `communication` | 상호작용·의미 협상 축 |
| `critical-reflection` | 비판적 검토와 언어생활 성찰 | meta | `reflection` | 성찰 축 |
| `reflection-action` | 삶의 성찰과 실천 계획 | meta | `reflection` | 성찰 축 |
| `participation-reflection` | 참여·협력과 활동 성찰 | meta | `reflection` | 활동 성찰 축 |
| `appreciation-reflection` | 감상·비평과 문화 성찰 | meta | `reflection` | 감상·비평 뒤의 성찰 축 (음악·미술 공용 키) |
| `reflection-transfer` | 판단·성찰과 생활 맥락 전이 | meta | `reflection` | 계약의 reflection 정의(성찰·태도·전이)와 직접 일치 |

## 4. 과목별 겹침 검사

| 과목 | facetKeyDetail | facetKey |
| --- | --- | --- |
| 국어 | language-analysis / communication-production / critical-reflection | inquiry / communication / reflection |
| 도덕 | ethical-concept / case-judgment / dialogue-practice / reflection-action | concept / inquiry / communication / reflection |
| 수학 | representation-modeling / problem-solving-explanation | representation / application |
| 과학 | inquiry-data / evidence-explanation | inquiry / application |
| 사회·역사 | source-context / evidence-judgment | inquiry / application |
| 체육 | skill-strategy / participation-reflection | procedure / reflection |
| 음악 | performance-creation / appreciation-reflection | procedure / reflection |
| 미술 | exploration-expression / appreciation-reflection | representation / reflection |
| 영어·생활 외국어 | reception-interaction / production-reflection | communication / procedure |
| 기술·가정·정보 | design-problem-solving | procedure |
| 그 밖의 교과 | application-evidence / reflection-transfer | application / reflection |

모든 조합에서 `facetKey`가 중복되지 않으며, `core`까지 더해도 성취기준 안의 주제는 서로 다른 `facetKey`를 갖는다.

## 5. 결과 분포 (중학교 2,160 주제)

| facetKey | 주제 수 |
| --- | ---: |
| core | 714 |
| application | 332 |
| procedure | 296 |
| inquiry | 274 |
| communication | 228 |
| reflection | 221 |
| representation | 73 |
| concept | 22 |

고등학교는 50,749건 전부 `core`다.

`concept`가 22건뿐인 이유는 중학교 facet 설계에서 개념 이해 축을 명시한 과목이 도덕 하나이기 때문이다. 개념 축이 필요한 과목(과학·수학)은 `standard-core` 주제가 그 역할을 맡고 있으며, 이 불균형은 주제 분해 정책 자체를 다시 볼 때(개선계획 P3-4) 함께 다룬다.

## 6. 검증

- 주제 ID 집합 불변: 중학교 2,160 / 고등학교 50,749 모두 개선 전후 동일 (해시 입력이 `facetKeyDetail`이므로 불변)
- `schema/core.schema.json`의 `facetKey` enum 8종, 중학교 프로필이 `facetKeyDetail` 필수
- SHACL `slm:TopicShape`가 `slm:facetKey`를 8종으로 제한, `slm:MiddleTopicShape`가 `slm:facetKeyDetail` 필수
- `tests/relation-layers.test.mjs`가 사상표와 실제 주제 값의 일치를 검사
