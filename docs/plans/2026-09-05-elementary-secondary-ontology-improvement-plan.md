# 초등·중등 학습지도 온톨로지 점검 결과와 개선계획

- 점검일: 2026-09-05
- 대상: `korean-elementary-learning-map` (데이터 `kr-full-depth-v0.4`, 온톨로지 `0.3.0-p3`), `korean-secondary-learning-map` (`v0.5.0-candidate`, middle·high·bridges)
- 범위 밖: `transition-gap-map`, `korean-k12-ai-curriculum` (소유자 지시로 제외)
- 점검 방법: 두 저장소의 자동 게이트 재실행(초등 `npm test`·`validate`·`validate:ontology`, 중등 `bun test`·`validate`·`check:relations`), 데이터 파일 직접 집계 스크립트, TBox·SHACL·검토 문서·릴리스 문서 대조. Python G7(SHACL/OWL-RL) 게이트는 재실행하지 않았고 마지막 릴리스 보고서의 통과 기록을 신뢰했다.

## 0. 한 줄 판정

형식 품질(스키마·DAG·해시·SHACL 계약)은 두 저장소 모두 오늘 기준 전 게이트 통과다. 문제는 의미 품질이다. 제품이 쓸 **선수 관계 층**이 초등은 99%가 저장소 추론이고 중학교는 714개 성취기준에 56건뿐이며, 두 저장소가 관계 정책·주제 분해·ID·출처 고시 버전·온톨로지 네임스페이스에서 서로 다른 규칙을 쓴다. 개선의 핵심은 "더 많이 생성"이 아니라 **두 저장소를 한 규칙으로 맞추고, 공식 근거 층과 교육적 후보 층을 분리해 둘 다 갖추는 것**이다.

## 1. 현황 수치

| 항목 | 초등 | 중학교 | 고등학교 |
| --- | ---: | ---: | ---: |
| 과목(과정) | 11 교육과정 | 24 과목 | 759 과목 (일반 231 + 직업계 528) |
| 성취기준 | 620 | 714 | 50,749 (직업계 47,625) |
| 세부 주제 | 1,956 (3.15/기준) | 2,160 (핵심 714 + facet 1,446) | 50,749 (1:1, 분해 없음) |
| 선수 관계 | 1,894 | 56 | 508 (+과목 관계 39) |
| 관계 근거 | 저장소 작성 (공식 문장 인용 15건) | 전건 공식 근거·인쇄 쪽수 | 전건 공식 근거 |
| 관계 0건 과목 | 없음 | 9/24 | 공통 과목 37 중 11 |
| 증거·평가 프롬프트 | 템플릿 생성 (증거 4,056 중 완전 중복 1,744) | 템플릿 생성 (주제당 1개, 템플릿 351종) | 템플릿 생성 |
| 외부 전문가 검토 | 0 | 0 | 0 |
| 자동 게이트 | 62 테스트 통과 | 19 테스트 통과 | (동일 실행) |

초→중 bridge: 290건, 초등 주제 229개 → 중학교 성취기준 259개(36.3%). 12개 중학교 과목만 연결.

## 2. 발견 사항

심각도: **H** 제품 차단 또는 의미 오류 / **M** 품질·일관성 / **L** 위생.

### A. 관계 층

| ID | 심각도 | 발견 | 근거 |
| --- | --- | --- | --- |
| A1 | H | 초등 관계 1,894건 중 73.1%(1,384)는 같은 성취기준 안의 facet 순서(개념→적용→성찰)다. 성취기준 사이를 잇는 간선은 510건, 학년군을 넘는 간선은 65건뿐이다. | `dependencies.json` 집계. 미술·사회·음악·체육은 성취기준 간 간선 0건(150개 기준 고립) |
| A2 | H | 초등 관계의 `basis`는 자유 문자열 12종이고, 그중 공식 문서 문장을 인용한 것은 15건("PDF 고려 사항")이다. 179건은 코드 순서·단원 배열 순서("official-code sequence", "within-unit official sequence")인데, 이는 중등 v0.5가 "문서 배열 순서는 선수 관계가 아니다"로 **전면 삭제**한 유형이다. 두 저장소가 정반대 정책을 쓴다. | 초등 `basis` 분포, 중등 `docs/release/v0.5.0-candidate.md` |
| A3 | H | 초등 수학 선수 사슬 최대 깊이 170. 코드 순서 간선을 hard/soft로 이어 붙인 결과로, `[2수01-01]`부터 `[6수04-xx]`까지 사실상 선형 순서를 "선수"로 주장한다. 제품 경로 추천에 그대로 쓰면 학습자에게 불필요한 선행을 요구한다. | 깊이 분포: 수학 170, 국어 71, 통합 53, 영어 42 |
| A4 | H | 중학교 관계 56건(수학 30). 과학·기술·가정·영어·음악·정보·체육·한문·생활 중국어·생활 프랑스어는 0건. 구조적 원인: 중학교 내용 체계표가 1~3학년 단일 학년군이라 C계층(학년 진행) 채굴이 수학 외 0건, 해설 명시(D계층)도 드물다. 제품 "경로는 온톨로지가"의 중학교 부분이 비어 있다. | `relation-coverage-report.json`, 과목별 검토 문서 |
| A5 | M | 고교 공통 과목 11개(공통국어1·공통수학1·공통영어1·통합과학1·통합사회1/2·한국사1/2·과학탐구실험1·기본수학1·기본영어1)가 관계 0건. "2" 과목만 "1"을 선행으로 갖는 형태라 1학년 공통 과목 안의 경로가 없다. | high `learning-relations.json` 과목별 집계 |
| A6 | M | 초→중 bridge가 초등 facet를 일관되게 고르지 못한다(concept 110, perform 64, `.01` 38, practice 23…). 국어 검토 문서가 "국어 인벤토리에는 의미형 접미사가 없어 `.01`을 썼다"고 명시했다. 원인은 A/B층의 초등 ID 불일치(B2). | `elementary-transitions.json`, `docs/reviews/…korean…` |

### B. 주제·콘텐츠 층

| ID | 심각도 | 발견 | 근거 |
| --- | --- | --- | --- |
| B1 | H | 세 학교급 모두 증거·평가 프롬프트가 템플릿 치환문이다. 초등: 증거 4,056건 중 서로 다른 템플릿 632종, 완전 중복 1,744건, 프롬프트 완전 중복 144건. 중학교: 주제당 증거 1개, 템플릿 351종("학습자가 X와 관련된 개념…을 보여 준다" 707회). 튜터 LLM이 쓸 평가 자료로는 정보량이 없다. | 집계 스크립트 |
| B2 | M | 초등 주제 ID 체계가 workstream별로 8가지다(통합 `w.w.w.N.N`, 국어 `w.w.N.N.N`, 수학 `w.w.gN.gN.w`, 과학 `w.w.w.gN.w`, 도덕 `w.w.gN.N.w`, 미술·사회·음악·체육 `w.N.N.w`, 영어 `w.N.w.N.N.w`, 실과 `w.w.N.N.w`). facet 접미사도 15종 이상(concept/understand/application/perform/practice/01~04…). `sourceStandardCode`가 987개(50%) 주제에 없다. 중등은 해시 ID + `facetKey` 24종으로 통일돼 있어 코어 어휘가 다르다. | `topics.json` ID 패턴 집계 |
| B3 | M | 중등 성취기준 요약에 PDF 추출 공백 결함이 있다("추 론하기", "표 현하기", "유 용성", "밤 하늘"). 휴리스틱 추정 중학교 34/714(4.8%), 고교 5,543/50,749(10.9%). 요약이 주제 라벨·증거·프롬프트에 3~4배로 복제돼 결함이 증폭된다. | `standards.json` 단음절 토큰 검사 |
| B4 | L | 초등 `titleEnglish` 자리표시자 171건("… micro-topic 1"), null 198건. 주제 페이지 locator는 597/1,956(30.5%)만 `pdfPage` 보유, `printedPage`는 27건. 중학교 성취기준은 `printedPage` 0건(pdfPage만)인데 관계 근거는 인쇄 쪽수를 쓴다. | 집계 |
| B5 | L | 고교 주제가 성취기준과 1:1이라 "세부 주제" 층이 명목상 존재만 한다. 직업계 47,625건은 제품 범위 밖이므로 그대로 두되, 일반고 3,124건은 중학교와 같은 분해 정책이 필요하다. | inventory-report |

### C. 저장소 간 일관성

| ID | 심각도 | 발견 | 근거 |
| --- | --- | --- | --- |
| C1 | H | 관계 정책 불일치(A2). 초등 `hard/soft` + 자유 `basis` ↔ 중등 `relationKind`·`basisKind`·`scope`·`reviewStatus` 통제 어휘 + `repository-authored` 스키마 거부. 하나의 제품이 두 그래프를 한 의미로 읽을 수 없다. | 두 스키마 |
| C2 | M | 온톨로지 TBox 중복. 중등 `slm:` 네임스페이스가 `AchievementStandard`·`LearningTopic`·`LearningCluster`·`SourceDocument`·`SourceLocator`·`CoverageGap`을 초등 `lm:`과 별도로 재정의하고 `owl:imports`·`equivalentClass` 연결이 없다. 아키텍처 문서는 "K-12 코어 공유"를 선언했지만 실제 파일은 공유하지 않는다. | `ontology/learning-map.ttl` 양쪽 |
| C3 | M | 출처 고시 버전 불일치. 초등 사회(별책7)·과학(별책9)·영어(별책14)는 교육부 고시 2022-33판을 인용하고, 중등은 같은 별책의 국가교육위원회 고시 2024-3판을 인용한다. 초→중 bridge는 초등 주제를 2024-3판 쪽수로 근거 댄다. 초등 국어·수학·실과에는 "2026-1 개정 대조 미완" 갭 레코드가 열려 있다. | 두 `source-manifest`, 초등 `coverageGaps` |
| C4 | M | 주제 분해 정책 불일치. 초등 3.15/기준(과목별 상이), 중학교 3.0/기준(핵심+facet 명시), 고교 1.0. bridge와 튜터 경로 생성이 학교급마다 다른 입도를 다뤄야 한다. | 수치표 |

### D. 메타데이터·거버넌스 위생

| ID | 심각도 | 발견 |
| --- | --- | --- |
| D1 | L | 초등 `package.json`이 `version 0.4.0`, `license "(ODbL-1.0 AND CC-BY-SA-4.0)"`인데 CHANGELOG는 0.4.1 MIT 재라이선스를 기록한다. 11개 교육과정 레코드의 `license` 문구가 "KOGL·상업 재사용 미해결"로 남아 있고 `metadata.ttl`은 `cleared`다. |
| D2 | L | 초등 커버리지 갭 43건의 `severity`가 6가지 값(undefined 24 포함), `status`가 11가지 값. 통제 어휘가 없어 SPARQL CQ-11이 "몇 개"만 세고 분류를 못 한다. |
| D3 | L | 중등 `controlled-vocabularies.json` `version 0.4.0-candidate`, 온톨로지 `owl:versionIRI …/0.4.0-candidate`가 데이터 릴리스 0.5.0과 어긋난다. `courseCategories.common` status가 `draft`. 중학교 갭 `gap.middle.document-rights-review-pending`(severity high, open)은 권리 `cleared` 결정 뒤에도 남아 있다. |
| D4 | M | 두 저장소 모두 검토 상태가 `candidate`/`internal-reviewed`뿐이다. 거버넌스 문서는 외부 검토 축을 정의했지만 표본 검토 한 번도 실행된 기록이 없다. |

## 3. 선결 결정 (소유자 판단 필요)

각 항목 첫 번째가 권고안이다. 권고안 기준으로 4장 계획을 짰다.

**결정 1. 관계 층 구조** — 두 저장소 공통으로 **2층 분리**를 권고한다.
- (권고) `official` 층: 내용 체계표 학년(군) 진행·해설 명시만, 인쇄 쪽수 필수, 현재 중등 v0.5 규칙 그대로. `pedagogical-candidate` 층: 코드 순서·분해 순서·교육적 추론을 담되 **별도 파일·별도 릴리스 상태**로 두고 제품에서는 "권장 순서"로만 표시. 초등 기존 1,894건은 후보 층으로 이관하고, 공식 채굴로 승격되는 것만 official로 올린다. 7월 지시("비공식으로 AI가 추가한 문서는 따로 분류해")와 제품 요구("경로는 온톨로지가")를 동시에 만족한다.
- 대안: 초등도 official 전용으로 축소. 중학교와 같은 사슬 부재가 초등에도 생겨 M0(초등 수학 슬라이스)가 막힌다.

**결정 2. 초등 ID·facet 정규화 방식** — **ID는 보존하고 필드를 추가**하는 방식을 권고한다.
- (권고) 기존 IRI 비재발급 원칙(governance.md)을 지키고, 모든 초등 주제에 `decompositionKind`·`facetKey`(공통 SKOS 8종 내외)·`standardKey`를 추가한다. bridge·라이브 UI·인용이 깨지지 않는다.
- 대안: 중등식 해시 ID로 전면 재발급 + `replacements.json`. 깨끗하지만 P3 릴리스와 dexa.art/learnmap 라이브를 동시에 갈아야 한다.

**결정 3. 중학교 추가 공식 근거원 인정 범위** — 다음 순서로 조사 후 결정.
- 교육부·KICE 「성취기준 해설·평가기준·성취수준」(STAS, `stas.moe.go.kr/rest`, 무인증 REST): 성취기준별 평가기준(상/중/하)과 학년 배정 여부를 확인. 국가기관 발행이므로 official 후보.
- 내용 체계표의 "핵심 아이디어·내용 요소" 순서: 학년 진행이 아니므로 후보 층.
- 검정 교과서 단원 순서: 비공식이므로 후보 층, 출판사별 상이함을 명시.

## 4. 개선계획

형식: `[작업] → verify: [확인 방법]`. 대량 생성·채굴 작업은 Codex 병렬 위임 대상으로 표시(◆).

### Phase 1 — 정합성·위생 (선행, 약 2주)

- **P1-1 초등 내용 체계표 공식 관계 채굴 ◆** — 11개 교과 별책의 내용 체계표에서 1~2→3~4→5~6학년군 진행과 해설·고려 사항 명시를 채굴해 `basisKind: official-source`, 인쇄 쪽수 포함 간선을 만든다. 중등 `scripts/lib/official-relation-specs/*.mjs` 모듈 형식과 과목별 검토 문서 형식을 그대로 이식한다. 초등은 세 학년군이 있어 중학교와 달리 C계층 수확이 크다(초→중 290건이 이미 같은 표에서 나왔다). → verify: 교과별 `docs/reviews/2026-XX-<subject>-official-relations-review.md` 11건, 간선 전건 `printedPage`·`sourceRefs`, DAG·학년군 역행 0, 교과별 건수 표.
- **P1-2 초등 관계 어휘 정규화** — 12종 자유 `basis`를 `basisKind {official-source | official-code-order | repository-authored}` + `relationKind {required-prerequisite | recommended-before}` + `scope`로 매핑하고, 코드 순서·분해 순서 간선은 전부 `recommended-before` + 후보 층 파일(`dependencies.candidate.json`)로 이동한다. 스키마 enum 추가, `hard/soft` 원값은 보존. → verify: 스키마 검증 통과, official 파일에 `repository-authored` 0건, 후보 파일 건수 = 1,894 − 승격 건수, `unlocks`/`indirectRequires` 물질화가 official 층에서만 생성됨.
- **P1-3 중등 PDF 추출 공백 결함 정정 ◆** — 추출 단계에서 줄바꿈 하이픈·자간 공백 결합 규칙을 넣고(`pdftotext -layout` 또는 후처리 사전), 성취기준 요약→주제 라벨→증거→프롬프트를 재생성한다. → verify: 단음절 토큰 휴리스틱 중 34→0, 고 5,543→0(허용 목록 예외만), 표본 50건 육안 검토, manifest 해시 갱신.
- **P1-4 메타데이터 정합** — 초등 `package.json` version/license, 11개 교육과정 `license` 문구, 갭 `severity`·`status` 통제 어휘(각 4~5값)로 재분류; 중등 controlled-vocab version, `owl:versionIRI` 0.5.0, `common` status, 권리 갭 종결. → verify: `grep` 결과 0, 초등 62·중등 19 테스트 통과, CQ-11 분류별 카운트 출력.
- **P1-5 출처 고시 버전 매트릭스** — 교과별 [2022-33 / 2024-3 / 2026-1] 어느 판을 인용하는지 표를 만들고, 사회·과학·영어 별책은 2024-3판, 국어·수학·실과는 2026-1 개정과 초등 성취기준 코드·요약 diff를 낸다. 변경이 있으면 새 데이터 릴리스로 처리(조용한 덮어쓰기 금지). → verify: `docs/source-version-matrix.md`, diff 보고서(추가·삭제·문구 변경 코드 목록), 두 저장소 `source-manifest` 동일 별책 동일 판.

### Phase 2 — 관계 층 강화 (약 4~6주)

- **P2-1 중학교 추가 근거원 조사** — 결정 3에 따라 STAS 성취기준·평가기준 전량 수집(중 714건), 학년 배정·선행 언급 필드 유무 확인, 인정 범위 문서화. → verify: `docs/decisions/2026-XX-middle-relation-sources.md`, STAS 수집 receipt(건수·해시).
- **P2-2 중학교 후보 층 구축 ◆** (결정 1 승인 시) — 24개 과목 전부에 `recommended-before` 후보 간선을 명시적 생성 규칙(내용 요소 순서·소주제 순서·STAS 평가기준 위계)으로 만들고 규칙별 `basis`를 남긴다. 파일 `learning-relations.candidate.json`, 스키마 프로필 `pedagogical-candidate`. → verify: official 파일 해시 불변, 후보 층 DAG·참조 무결성, 과목 커버리지 24/24, UI에서 official/후보 시각 구분, 적대 fixture(후보 간선을 official로 넣으면 실패).
- **P2-3 초→중 bridge 확장 ◆** — P1-1·결정 2 이후 facet 선택 규칙("해당 성취기준의 `standard-core`/`concept` facet")을 고정하고 12→24 과목, 중학교 성취기준 커버리지 36%→60% 이상. → verify: 과목별 bridge 검토 문서, `elementaryReleaseVersion` 재핀, 커버리지 표.
- **P2-4 고교 공통 과목 관계** — 공통국어1·공통수학1·공통영어1·통합과학1·통합사회1/2·한국사1/2 등 11개 과목에 과목 성격·해설의 중→고 연계 재채굴 + 후보 층. → verify: 공통 과목 37개 중 관계 0건 11→0(official 또는 후보), 중→고 `transition-alignments` 증가분 검토 문서.

### Phase 3 — 주제·평가 콘텐츠 품질 (제품 M0 슬라이스 순: 초등 수학 → 중학교 수학 → 국어·과학)

- **P3-1 공통 facet 어휘·초등 필드 보강** — 초등 15종 접미사와 중등 24종 `facetKey`를 공통 SKOS scheme(예: concept, procedure, representation, application, inquiry, communication, reflection, language) 8종 내외로 사상하고, 초등 전 주제에 `facetKey`·`decompositionKind`·`standardKey` 추가, `sourceStandardCode` 987건 채움. → verify: 두 저장소 `controlled-vocabularies`에 동일 scheme, 초등 주제 100% 필드 보유, SHACL shape 추가, bridge 재생성 시 facet 규칙 위반 0.
- **P3-2 증거·평가 프롬프트 재작성 ◆** — 템플릿 치환문을 성취기준 해설·STAS 평가기준(상/중/하)에 근거한 문장으로 교체. 주제당 증거 2개(개념·수행), 프롬프트 1개 + 오답 유형 1개. 상태는 `source-grounded-draft`로 표기(기존 `mechanical-derivative`와 구분). 시작 범위: 초등 수학 121기준·363주제, 중학교 수학 60기준·180주제. → verify: 완전 중복 문자열 0, 템플릿 비율(유사도 0.9 이상 쌍) 10% 미만, 표본 30건 교사 검토 기록, `check:content` 게이트에 중복·템플릿 지표 추가.
- **P3-3 자리표시자 정리** — 초등 `titleEnglish` 369건은 채우거나 필드 제거 결정, 주제 `pdfPage` 30%→100%(성취기준 locator 상속). → verify: 자리표시자 0, locator 결측 0.
- **P3-4 일반고 주제 분해** (후순위) — 일반고 3,124기준에 중학교와 같은 핵심+facet 분해. 직업계는 제외. → verify: 일반고 주제/기준 비율 ≥ 2.5, 직업계 1.0 유지.

### Phase 4 — 온톨로지 코어 통합·검토 거버넌스

- **P4-1 K-12 코어 TBox 분리** — `lm:`·`slm:` 공통 클래스·속성을 `k12-core.ttl`(단일 네임스페이스)로 빼고 양쪽이 `owl:imports`. 학교급 전용 클래스(`Course`, `CreditRule`, `ChoiceSet` 등)만 확장 모듈에 남긴다. 기존 IRI는 `owl:equivalentClass`로 보존. → verify: 두 ABox가 코어 하나로 SHACL 통과, SPARQL CQ 15 + SCQ 20 전부 코어 어휘로 재작성 후 결과 동일, `replacements.json`에 매핑 기록.
- **P4-2 외부 검토 프로토콜 1회 실행** — 교과당 성취기준 10% 표본(초등 62건, 중학교 71건)을 현직 교사·교과 전문가에게 검토받고 `ReviewRecord`(reviewerRole, 판정, 수정 요청)로 기록. 승격 규칙: official 관계는 표본 오류율 5% 미만이면 `subject-expert-reviewed`. → verify: 검토 레코드 존재, 승격된 관계 수, 오류 유형 분류.
- **P4-3 릴리스** — 초등 `kr-full-depth-v0.5` / 온톨로지 `0.4.0`, 중등 `v0.6.0-candidate`, bridge 양쪽 재핀. → verify: 초등 7게이트·중등 `verify` 통과, manifest 해시, CHANGELOG·릴리스 보고서, dexa.art/learnmap 라이브 재배포 확인.

## 5. 순서와 이유

1. Phase 1 전체 → 이후 모든 작업이 어휘·출처 판을 전제로 하므로 먼저 고정한다.
2. P2-1·P2-2(중학교) → 제품 차단 요인(A4)이고 초등보다 부족분이 크다.
3. P3-1·P3-2 초등 수학 → 튜터 M0 세로 슬라이스와 정확히 겹친다.
4. P2-3 bridge → 초등 facet(P3-1)이 정리된 뒤에 해야 두 번 하지 않는다.
5. P4 → 두 저장소 데이터가 안정된 뒤 코어 통합과 외부 검토.

## 6. 리스크

- 결정 1을 미루면 P1-2·P2-2가 시작할 수 없다. 이 문서의 계획은 권고안 채택을 가정한다.
- P1-5에서 2024-3·2026-1 개정이 초등 코드를 바꾼 것이 확인되면 초등은 데이터 릴리스 v0.5가 아니라 새 인벤토리 사이클(S0)로 돌아가야 한다.
- P3-2는 생성 품질을 사람이 봐야 끝난다. 교사 검토자를 미리 확보하지 않으면 `source-grounded-draft` 상태에 머문다.
- P4-1 IRI 통합은 라이브 UI(dexa.art/learnmap)와 bridge를 동시에 건드린다. 초등 P3 릴리스의 "IRI 비재발급" 약속을 `equivalentClass`로 지키는 방식만 허용한다.

## 7. 부록 — 점검 명령과 산출물

- 초등: `npm test`(62 pass), `npm run validate`, `npm run validate:ontology`(136 terms)
- 중등: `bun test`(19 pass), `bun run validate`, `bun run check:relations`(56/508/39/175/290)
- 집계 스크립트: `docs/plans/2026-09-05-audit-scripts/elem-analysis.mjs`(node), `sec-analysis.mjs`(bun). 형제 디렉토리 절대 경로를 읽는다.
- 주요 참조: 초등 `ontology/governance.md`, `docs/kr-full-depth-integration-report.md`; 중등 `docs/release/v0.5.0-candidate.md`, `docs/roadmap.md`, `docs/reviews/`
