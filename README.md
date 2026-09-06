# 한국 중등교육 학습지도

대한민국 2022 개정 교육과정의 **중학교와 고등학교 전체**를 하나의 의미 체계로 탐색하되, `middle`·`high`·`bridges`를 독립 검증·릴리스하는 학습 온톨로지다.

현재 릴리스는 `v0.6.0-candidate`다. NCIC 공식 PDF 38개에서 확인한 714개 중학교 성취기준과 50,749개 고등학교 성취기준을 과목·영역(`Domain`)·PDF 해시·페이지 locator에 연결한다. 공식 원문은 포함하지 않는다.

**학습 관계는 두 층으로 나뉜다.** `official` 층(`learning-relations.json`)은 공식 문서가 직접 뒷받침하는 필수 선수 관계만 담고, `pedagogical-candidate` 층(`learning-relations.candidate.json`)은 성취기준 코드 순서와 주제 분해 순서에서 만든 권장 학습 순서를 담는다. 두 층은 파일·스키마·릴리스 상태가 다르고, official 파일에 후보 간선을 넣으면 스키마와 SHACL이 거부한다. 제품은 official을 "먼저 알아야 한다"로, 후보를 "권장 순서"로만 쓴다.

official 층의 모든 관계는 내용 체계표의 학년(군) 진행 또는 성취기준 해설·적용 시 고려 사항의 명시적 선행 지목을 근거로 가지며 인쇄 쪽번호 locator를 포함한다. `internal-reviewed`는 저장소 내부 검토를 뜻하며 교육부·교과 전문가 승인을 뜻하지 않는다. 후보 층은 전건 `candidate`이며 공식 근거가 아니다.

## 릴리스 수량

| 구분 | 중학교 | 고교 비직업계 | 고교 직업계 전문교과 |
| --- | ---: | ---: | ---: |
| 과목 | 24 | 231 | 528 |
| 영역 | 149 | 689 | 4,480 |
| 성취기준 | 714 | 3,124 | 47,625 |
| 세부 주제 | 2,160 | 3,124 | 47,625 |

### official 층 (공식 근거)

근거가 없는 과목은 관계 0건이 정상이며, 이는 공식 문서가 해당 과목의 선수 관계를 명시하지 않는다는 뜻이다.

| 관계 | 건수 | 근거 |
| --- | ---: | --- |
| 중학교 성취기준 선수 관계 | 56 | 내용 체계표 학년 진행, 해설 명시 (15/24 과목) |
| 고등학교 성취기준 선수 관계 | 469 | 내용 체계·과목 설계, 해설 명시 (148/759 과목) |
| 고등학교 과목 관계 | 39 | 교과 설계의 연계·심화 설명 |
| 중→고 주제 전이 | 175 | 교과별 과목 성격·해설의 명시적 연계 |
| 초등→중학교 전이 | 290 | 내용 체계표의 초→중 학년군 진행, 해설 명시 (초등 `kr-full-depth-v0.5` 핀) |

### pedagogical-candidate 층 (권장 순서)

| 규칙 | 중학교 | 고등학교 | 근거 |
| --- | ---: | ---: | --- |
| `R-CODE` (`official-code-order`) | 542 | 2,353 | 같은 과목·같은 영역에서 공식 성취기준 코드가 인접한 두 기준의 핵심 주제 |
| `R-FACET` (`decomposition-order`) | 1,446 | 0 | 한 성취기준의 핵심 주제 → 같은 성취기준의 각 facet 주제 (중학교 분해 정책) |
| 합계 | **1,988** | **2,353** | |

초→중 bridge에도 같은 층 구조를 둔다.

| 규칙 | 건수 | 근거 |
| --- | ---: | --- |
| `R-DOMAIN-CONTINUITY` (`repository-authored`) | 3,180 | 내용 체계표가 초등 5~6학년군과 중학교를 같은 영역 계열로 제시하는 10개 교과 57개 영역 쌍 |

영역 대응표는 `scripts/lib/bridge-domain-map.mjs`에 교과별로 명시하고, 대응이 불명확한 사회·역사는 비워 둔다. 근거와 한계는 `docs/reviews/2026-09-05-bridge-domain-continuity.md`에 있다. 중학교 성취기준 714개 중 official bridge 보유는 259개(36.3%), official+후보 보유는 447개(62.6%)다.

후보 층은 중학교 24/24 과목과 고등학교 비직업계 231/231 과목을 덮고, 직업계 전문교과 528과목은 제외한다(제품 범위 밖). 두 층을 합치면 고등학교 공통·일반 선택 66개 과목 중 관계 0건 과목이 없다. 과목 간·교과 간 후보는 만들지 않으며 과목 수준 연계는 official `course-relations.json`이 담당한다. 각 층은 DAG이고 두 층의 합집합도 DAG다.

고등학교 전체 합계는 34개 교과군, 759개 과목, 5,169개 영역, 50,749개 성취기준이다. 이 중 직업계 전문교과가 고등학교 성취기준의 93.8%이므로 중학교와 고등학교 총계를 그대로 비교하지 않는다.

고등학교 759개 과목에는 공통·일반 선택·진로 선택·융합 선택, 교양·계열 선택, 전문 공통·전공 일반·전공 실무 과목이 포함된다. 같은 과목의 별책 내 성취기준 접두부 차이는 별도 과목으로 세지 않으며, 성취기준 수가 많다고 과목의 중요도나 난이도가 높다는 뜻은 아니다.

## 왜 중학교와 고등학교를 나눴나

중학교는 공통 기반과 학년군 구조가 중심이고, 고등학교는 과목 범주·학점·선택·전문 프로그램 구조가 중심이다. 따라서 의미 코어와 UI는 공유하지만 데이터 제품은 아래처럼 분리했다.

- `data/kr/middle`: 중학교 과목·영역·성취기준·주제
- `data/kr/high`: 고등학교 과목·학점 규칙·선택·경로·성취기준·관계
- `data/kr/bridges`: 초등→중학교·중학교→고등학교 전이와 양쪽 릴리스 버전 핀, 초등 주제 인벤토리 핀

이 구조는 한 저장소의 일관성을 유지하면서도 한 학교급만 독립 검수하거나 교체할 수 있다.

## K-12 코어 TBox

초등 저장소(`korean-elementary-learning-map`)와 공유하는 클래스·속성·개념 어휘는 `ontology/k12-core.ttl` 한 파일에 모았다. 온톨로지 IRI는 `https://dexa.art/learnmap/ontology/k12-core`, versionIRI는 `…/1.0.0`이다.

- 두 저장소가 **바이트 동일 사본**을 보관하고, `tests/k12-core-sync.test.mjs`가 파일 헤더의 `# k12-core-sync-sha256:` 기준 해시로 동기화를 검사한다.
- `ontology/learning-map.ttl`이 `owl:imports`로 코어를 선언하지만 검증기는 로컬 사본에서 읽으므로 네트워크가 필요 없다. IRI의 실제 호스팅은 이 릴리스의 범위가 아니다.
- `slm:` IRI는 하나도 재발급하지 않는다. 클래스는 `owl:equivalentClass`, 관계 한정자·locator 필드는 `owl:equivalentProperty`, facet 개념은 `skos:exactMatch`로 코어에 연결한다. 중등은 한정자를 토큰(문자열)으로 저장하므로 코어의 `*Token` 하위 속성에 잇는다.
- ABox는 코어 어휘 `core:facetKey`·`core:contentKind`·`core:misconception`·`core:contentSourceLocator`·`core:layerConcept`를 함께 배출한다. 덕분에 `ontology/queries/scq-21-k12-core-vocabulary.rq`는 초등 저장소의 `cq-18-k12-core-vocabulary.rq`와 **질의문이 완전히 같고** 두 저장소 모두에서 답이 나온다.
- 출처 기반 초안(`core:contentKind = source-grounded-draft`)은 SHACL이 `core:contentSourceLocator`를 정확히 하나 요구한다. 적대 fixture `UNSOURCED_AUTHORED_DRAFT`가 이 제약을 검사한다.
- STAS 레코드 locator 어휘(`core:stasEndpoint`·`core:stasRecordId`·`core:collectedAt`·`core:fileSha256`)는 TBox·shape에만 있고 데이터 배출은 없다. `docs/decisions/2026-09-05-stas-source-assessment.md`의 판정에 따라 어디서 읽었는지만 기록하고 본문은 담지 않는다.

## 산출물

- `sources/official`: 현행 고시 선택 근거, 첨부 번호, 파일 크기, SHA-256, 페이지 수 receipt
- `schema`: 공통·중학교·고등학교·bridge·공식 원문 계약
- `data/kr`: 세 정규화 JSON 데이터 제품과 통합 인벤토리 보고서
- `ontology`: OWL/RDFS/SKOS TBox, 초등 저장소와 공유하는 K-12 코어 TBox `k12-core.ttl`, JSON-LD context, SHACL, SCQ-01~21, 양성·적대 fixture
- `dist/ontology`: 176,185개 노드·2,142,988개 트리플의 결정적 JSON-LD/Turtle ABox와 manifest
- `ui`: 학교급→교과군→과목→영역→성취기준/주제→근거, 초→중·중→고 전이(층 구분), 비교, 예시 경로 UI
- `dist/{middle,high,bridges,bundle,ui}`: 릴리스별 SHA-256 manifest

## 실행

```bash
bun install --frozen-lockfile
bun run setup:ontology
bun run verify
bun run serve
```

브라우저에서 `http://127.0.0.1:54321`을 열면 된다. `verify`는 데이터 schema·참조, JSON-LD↔Turtle 전체 RDF 동형성, 전체 ABox SHACL Advanced, 21개 SPARQL 실제 결과, 12개 적대 fixture, 콘텐츠·권리 경계, 테스트, 모든 manifest 해시를 확인한다. 최초 실행 전 `bun run setup:ontology`로 Python 형식 검증 환경을 만든다.

공식 PDF를 다시 내려받아 전체를 재현하려면 다음을 실행한다.

```bash
bun run rebuild:all
bun run verify:official
```

`sources/official/files`와 `sources/official/text`는 문서 권리 검토 전까지 배포하지 않으며 로컬 재현 캐시로만 사용한다.

공개 Git 저장소는 재현 가능한 소스와 정규화 데이터만 추적한다. GitHub 단일 파일 제한을 넘는 RDF ABox와 UI 상세 데이터, `dist` 매니페스트는 각각 `bun run build:ontology`, `bun run build:ui`, `bun run build`로 재생성하며 커밋하지 않는다. 공식 PDF와 추출 원문도 공개 저장소에 포함하지 않는다.

## 중요한 경계

- `Course`는 국가 교육과정에 정의된 과목이며 특정 학교의 실제 개설을 뜻하지 않는다.
- 국가 과목 정의에 없는 학년·학기를 임의로 채우지 않는다.
- official 층의 모든 학습 관계는 `layer: official`, `basisKind: official-source`, `relationKind: required-prerequisite`이며 인쇄 쪽번호 근거를 가진다. 후보 층의 근거 종류(`official-code-order`, `decomposition-order`, `repository-authored`)는 official 파일에서 스키마 수준으로 거부된다.
- 후보 층(`learning-relations.candidate.json`)은 공식 근거가 아니라 저장소가 만든 학습 순서 제안이다. UI는 이를 "권장 순서(후보)"로 official과 시각·문구로 구분해 표시한다.
- 기계적 파생 요약·과목별 facet 주제·경로는 여전히 저장소 생성물이며 `candidate`·`mechanical-derivative`로 표시된다. 공식 근거 원칙은 **관계**에 적용된 것이고, 주제 분해·요약의 교육적 검토는 별도 과제다.
- `required-prerequisite`는 공식 내용 체계·해설이 직접 뒷받침하는 경우에만 사용한다. 공식 문장이 학습 영역 전체를 지목한 경우 해당 영역의 성취기준으로 기계적으로 전개하며, 이 전개 방식은 과목별 검토 문서에 기록한다.
- 모든 `internal-reviewed` 관계는 `review-records.json`의 검토 대상 ID에 포함되고, 관계 그래프는 DAG·참조 검사를 통과해야 한다. 공식 근거가 없는 과목은 관계 0건이 정상이다.
- 경로는 `notOfficialRequirement: true`이며 진학·진로 적합성 판정이 아니다.
- 형식 검증과 교육적 검토는 서로 다른 상태다. 공식 문서는 국가가 공표한 공개 자료이며 원 출처(교육부·NCIC)에서 누구나 이용할 수 있다. 이 저장소는 원문을 수록하지 않고 코드·해시·페이지 locator로 연결한다.
- 개인 성적·진단·수강 데이터는 저장하지 않는다.

## 문서

- [완성 계획과 수용 기준](docs/completion-plan.md)
- [아키텍처](docs/architecture.md)
- [데이터 계약](docs/data-contract.md)
- [역량 질문](docs/competency-questions.md)
- [출처와 재현](PROVENANCE.md)
- [권리 고지](NOTICE.md)
- [라이선스](LICENSE) — MIT. 저장소 산출물은 DECK이 공개 정보를 바탕으로 독립 구축한 원저작물이며, 공식 문서 원문에 대한 권리는 부여하지 않는다.
- [과목별 공식 관계 검토 기록](docs/reviews/) (`2026-07-17-*-official-relations-review.md`, 46건)
- [facet 24종 → 공통 8종 사상 근거](docs/decisions/2026-09-05-facet-mapping.md)
- [후보 릴리스 보고서](docs/release/v0.6.0-candidate.md)

이 프로젝트는 교육부·국가교육위원회·NCIC의 공식 온톨로지나 승인 제품이 아니다.
