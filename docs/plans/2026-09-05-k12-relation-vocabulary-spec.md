# K-12 학습지도 공통 계약 v1 — 관계 층·어휘·facet

- 상태: 확정 (2026-09-05, 소유자 "초등·중등 다 개선" 지시에 따라 개선계획 3장 권고안을 채택)
- 적용 저장소: `korean-elementary-learning-map`, `korean-secondary-learning-map`
- 이 문서는 구현 계약이다. 두 저장소의 스키마·빌더·검증기·온톨로지는 이 문서와 일치해야 한다.

## 1. 관계 2층 구조

| 층 | 의미 | 파일 (초등) | 파일 (중등) |
| --- | --- | --- | --- |
| `official` | 공식 문서가 직접 뒷받침하는 선수 관계. 튜터가 "먼저 알아야 한다"로 쓴다. | `data/kr/dependencies.json` | `data/kr/{middle,high}/learning-relations.json`, `data/kr/bridges/*.json` |
| `pedagogical-candidate` | 코드 순서·분해 순서·저장소 추론. 튜터가 "권장 순서"로만 쓴다. | `data/kr/dependencies.candidate.json` | `data/kr/{middle,high}/learning-relations.candidate.json` |

- 두 층은 파일이 다르고 릴리스 상태가 다르다. official 파일에 후보 간선을 넣으면 스키마가 거부한다.
- 온톨로지 파생 관계(`directRequires`, `unlocks`, `indirectRequires`)는 official 층에서만 물질화한다. 후보 층은 `PrerequisiteAssertion`으로 내보내되 `layer` 한정자를 붙이고 파생하지 않는다.
- 각 층은 DAG여야 하고, 두 층의 합집합도 DAG여야 한다. 교과 간 간선은 두 층 모두 금지(`crossSubjectEdges: none`).
- manifest는 두 파일의 건수·해시를 각각 기록한다.

## 2. 관계 레코드 공통 어휘

두 저장소 모두 아래 필드를 갖는다. 초등은 기존 필드(`topicId`, `prerequisiteId`, `strength: hard|soft`, `reason`, `basis`, `source`)를 그대로 유지하고 아래를 **추가**한다. 중등은 이미 대부분 갖고 있으며 `layer`만 추가한다.

| 필드 | 값 | 규칙 |
| --- | --- | --- |
| `layer` | `official` \| `pedagogical-candidate` | 파일과 일치해야 한다 |
| `relationKind` | `required-prerequisite` \| `recommended-before` | official은 전건 `required-prerequisite`, 후보는 전건 `recommended-before` |
| `basisKind` | `official-source` \| `official-code-order` \| `decomposition-order` \| `repository-authored` \| `expert-authored` | official은 `official-source`만 허용 |
| `basis` | 자유 문자열 | 사람이 읽는 근거 설명. official은 "고시 번호 별책 N 내용 체계표/해설 p.NN" 형식 |
| `scope` | `same-standard` \| `same-domain` \| `same-subject` \| `cross-school-level` | 두 주제의 성취기준·영역·교과를 비교해 기계적으로 계산 |
| `reviewStatus` | `candidate` \| `internal-reviewed` \| `subject-expert-reviewed` \| `classroom-reviewed` | official은 `internal-reviewed` 이상. 후보는 `candidate` |
| `sourceRefs` | 출처 ID 배열 | official은 1개 이상 필수 |
| `sourceLocator` | `{ sourceId, printedPage, pdfPage?, section? }` | official은 `printedPage` 필수 |
| `strength` | 초등 `hard`\|`soft` 원값 보존, 중등 `required`\|`recommended` | 초등은 `relationKind`가 정규화 값이다 |

`basisKind` 판정 규칙 (초등 기존 12종 `basis` 문자열 매핑):

| 기존 basis | basisKind | layer |
| --- | --- | --- |
| `cross-grade official linkage candidate from PDF 고려 사항 and content progression` | 검토 후 `official-source`(쪽수 확인된 것) 또는 `repository-authored` | 확인된 것만 official |
| `grade-band progression by domain`, `grade-band progression candidate`, `same-grade domain sequence candidate` | `repository-authored` | candidate |
| `official-code sequence within grade-band/domain`, `within-unit official sequence candidate` | `official-code-order` | candidate |
| `within-standard decomposition order`, `within-standard *-to-* bridge` (4종) | `decomposition-order` | candidate |
| `workstream-authored` | `repository-authored` | candidate |

## 3. official 층 채굴 규약 (초등·중등 공통, 중등 v0.5 규칙 계승)

- C계층: 내용 체계표에서 같은 갈래(내용 요소 행)의 학년(군) 진행이 선후를 직접 보여줄 때. 초등은 1~2 → 3~4 → 5~6학년군, 초→중은 5~6 → 중1~3.
- D계층: 성취기준 해설·적용 시 고려 사항·교과 성격이 선행 학습을 명시 지목할 때("~을 바탕으로", "~을 토대로", "~에서 다룬").
- 내용 요소 → 성취기준 전개: 내용 요소가 여러 성취기준에 걸치면 해당 영역·학년군의 성취기준으로 기계 전개하고, 전개 방식을 과목별 검토 문서에 적는다.
- 근거 없으면 0건. 코드 순서·문서 배열·교육적 추론은 official에 넣지 않는다.
- 과목별 사양 모듈: `scripts/lib/official-relation-specs/<subject>.mjs` (중등 형식 이식). 튜플 `[fromCode, toCode, domainLabel, printedPage, note?]`. 초등은 `fromCode`·`toCode`가 성취기준 코드이고 빌더가 각 성취기준의 `facetKey: concept`(없으면 첫 주제) 주제로 전개한다.
- 과목별 검토 문서: `docs/reviews/<date>-<subject>-official-relations-review.md` (원천, 방법, 계층별 목록, 전개 규칙, 채택하지 않은 후보와 이유).

초등 사양 모듈 형식 (`scripts/lib/official-relation-specs/<subject>.mjs`, ESM default export):

```js
export default {
  subject: 'math',                    // workstream 키 (korean, math, science, social, english-efl, moral, practical-arts, integrated, art, music, pe)
  subjectKorean: '수학',
  sourceId: 'kr-ncic-math-pdf-2022',  // curriculum-standards.json sources[]에 존재하는 ID
  contentSystemRequired: [            // C계층 [fromCode, toCode, domainLabel, printedPage, note]
    ['[2수01-01]', '[4수01-01]', '수와 연산', 13, '네 자리 이하의 수 → 다섯 자리 이상의 수'],
  ],
  commentaryRequired: [               // D계층 [fromCode, toCode, printedPage, note]
  ],
  expansionRules: '내용 요소가 여러 성취기준에 걸칠 때의 전개 방식 설명',
};
```

`index.mjs`는 존재하는 모듈을 모두 모아 `export const officialRelationSpecs = [...]`로 내보낸다. 빌더는 각 코드 쌍을 해당 성취기준의 `facetKey: concept` 주제(없으면 정렬상 첫 주제)로 전개한다.

## 4. 주제 공통 필드

| 필드 | 값 | 초등 | 중등 |
| --- | --- | --- | --- |
| `decompositionKind` | `standard-core` \| `subject-facet` | 전건 `subject-facet` | 유지 |
| `facetKey` | 아래 공통 8종 | 접미사·`type`에서 도출 | 기존 24종을 8종으로 사상, 원값은 `facetKeyDetail`에 보존 |
| `standardKey` | 성취기준 키 | `standards[0]` | `standardAlignments[0].standardId` |
| `sourceStandardCode` | `[2수01-01]` 형식 | 전건 채움 | 이미 `code`로 존재 |

공통 facet 8종 (SKOS scheme `https://dexa.art/learnmap/vocab/facet/`):

| facetKey | 뜻 | 초등 접미사 매핑 | 초등 `type` 폴백 |
| --- | --- | --- | --- |
| `concept` | 개념·조건·예 구분 | concept, understand | CONCEPTUAL |
| `procedure` | 절차·기능·제작 수행 | procedure, perform, make | PROCEDURAL |
| `representation` | 표현·모델링·변환 | representation | REPRESENTATIONAL |
| `application` | 적용·문제 해결 | application, practice | — |
| `inquiry` | 탐구·자료·근거 | inquiry, evidence | — |
| `communication` | 언어 표현·의사소통 | — | LANGUAGE |
| `reflection` | 성찰·태도·전이 | reflect | META |
| `core` | 성취기준 전체 핵심 | — | (중등 standard-core 전용) |

숫자 접미사(`.01`~`.04`, 국어·통합교과)는 `type` 폴백으로 결정한다. 한 주제는 facetKey 하나만 갖는다.

## 5. 위생 규칙

- 중등 성취기준 요약·주제 라벨·증거·프롬프트에 PDF 추출 공백(단어 내부 공백)이 없어야 한다. 검사 휴리스틱: 공백으로 나뉜 토큰 중 한글 1음절 토큰이 허용 목록(수·및·등·각·그·이·한·두·세·더·잘·때·것·수·할·될·볼·뒤·후·전·내·밖·위·속·중·간·새·큰·몇·약·총·단·첫·데·바·채·듯·차·별·초·말·끝·앞·옆·곧·즉·좀·늘·참·온·맨·겸·대·관·향) 밖이면 결함 후보.
- 성취기준·주제 ID는 코드·과목·facet 키로만 해시한다. 요약 문자열 수정이 ID를 바꾸면 안 된다.
- `titleEnglish` 자리표시자("micro-topic N")와 null은 허용하지 않는다. 채우지 못하면 필드를 생략한다.

## 6. 버전

- 초등 데이터 `kr-full-depth-v0.5`, 패키지 `0.5.0`, 온톨로지 `0.4.0` (`owl:priorVersion` 0.3.0-p3). 기존 IRI·주제 ID는 재발급하지 않는다.
- 중등 데이터 `v0.6.0-candidate`, 온톨로지 `owl:versionIRI …/0.6.0-candidate`, controlled-vocabularies `0.6.0-candidate`. 이 승격은 R4 릴리스 단계에서 한 번에 한다. R1~R3 동안은 `0.5.0-candidate` 문자열을 유지하고 메타데이터만 현재 릴리스와 일치시킨다.
- bridge는 초등 `kr-full-depth-v0.5` 인벤토리로 재핀한다.

## 7. 게이트 (두 저장소 공통 최소)

1. 스키마: official 파일에 `layer != official`, `basisKind != official-source`, `relationKind != required-prerequisite`, `printedPage` 결측이 있으면 실패.
2. 그래프: 층별 DAG, 합집합 DAG, 교과 간 간선 0, dangling 참조 0.
3. 주제: `facetKey`·`decompositionKind`·`standardKey` 100%, facetKey ∈ 8종.
4. 위생: 5장 휴리스틱 결함 0 (허용 목록 예외 제외).
5. 결정성: 두 번 빌드 시 manifest 해시 동일.
6. 기존 테스트 전부 통과 + 이 계약을 검사하는 테스트 추가.
