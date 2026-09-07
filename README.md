# 한국 중등교육 학습지도

대한민국 2022 개정 교육과정의 **중학교와 고등학교 전체**를 하나의 의미 체계로 탐색하되, `middle`·`high`·`high-vocational`·`bridges`를 독립 검증·릴리스하는 학습 온톨로지다.

현재 릴리스는 `v0.6.0-candidate`다. NCIC 공식 PDF 38개에서 확인한 714개 중학교 성취기준과 50,749개 고등학교 성취기준(일반 `high` 3,124 + 직업계 `high-vocational` 47,625)을 과목·영역(`Domain`)·PDF 해시·페이지 locator에 연결한다. 공식 원문은 포함하지 않는다.

**학습 관계는 두 층으로 나뉜다.** `official` 층(`learning-relations.json`)은 공식 문서가 직접 뒷받침하는 필수 선수 관계만 담고, `pedagogical-candidate` 층(`learning-relations.candidate.json`)은 성취기준 코드 순서와 주제 분해 순서에서 만든 권장 학습 순서를 담는다. 두 층은 파일·스키마·릴리스 상태가 다르고, official 파일에 후보 간선을 넣으면 스키마와 SHACL이 거부한다. 제품은 official을 "먼저 알아야 한다"로, 후보를 "권장 순서"로만 쓴다.

official 층의 모든 관계는 내용 체계표의 학년(군) 진행 또는 성취기준 해설·적용 시 고려 사항의 명시적 선행 지목을 근거로 가지며 인쇄 쪽번호 locator를 포함한다. `internal-reviewed`는 저장소 내부 검토를 뜻하며 교육부·교과 전문가 승인을 뜻하지 않는다. 후보 층은 전건 `candidate`이며 공식 근거가 아니다.

## 릴리스 수량

고등학교 데이터 제품은 일반 릴리스 `high`와 직업계 전문교과 릴리스 `high-vocational` 두 개로 나뉜다. 두 릴리스는 하나의 ID 네임스페이스를 공유하므로 분리로 바뀐 것은 레코드가 어느 파일에 있느냐뿐이고 고교 합계는 그대로다.

| 구분 | 중학교 `middle` | 고교 일반 `high` | 고교 직업계 `high-vocational` | 고교 합계 |
| --- | ---: | ---: | ---: | ---: |
| 교과군 | 13 | 16 | 18 | 34 |
| 과목 | 24 | 231 | 528 | 759 |
| 영역 | 149 | 689 | 4,480 | 5,169 |
| 성취기준 | 714 | 3,124 | 47,625 | 50,749 |
| 세부 주제 | 2,160 | 3,124 | 47,625 | 50,749 |
| 학습 클러스터 | 149 | 689 | 4,480 | 5,169 |
| official 학습 관계 | 56 | 171 | 298 | 469 |
| 후보 학습 관계 | 1,988 | 2,353 | 0 | 2,353 |
| 과목 관계 | — | 39 | 0 | 39 |
| 검토 기록 | 1 | 1 | 1 | 2 |
| 커버리지 갭 | 2 | 2 | 2 | 4 |

두 고교 릴리스의 교과군은 겹치지 않는다. 직업계 릴리스에는 학점 규칙·선택 묶음·예시 경로·과목 관계·후보 관계 층이 없으며, 없는 것이 정상이고 `schema/high-vocational-profile.schema.json`이 그렇게 규정한다.

### official 층 (공식 근거)

근거가 없는 과목은 관계 0건이 정상이며, 이는 공식 문서가 해당 과목의 선수 관계를 명시하지 않는다는 뜻이다.

| 관계 | 건수 | 근거 |
| --- | ---: | --- |
| 중학교 성취기준 선수 관계 | 56 | 내용 체계표 학년 진행, 해설 명시 (15/24 과목) |
| 고등학교 일반 `high` 성취기준 선수 관계 | 171 | 내용 체계·과목 설계, 해설 명시 (87/231 과목) |
| 고등학교 직업계 `high-vocational` 성취기준 선수 관계 | 298 | 전문교과 별책의 성취기준 해설 선행 지목 (61/528 과목) |
| 고등학교 과목 관계 | 39 | 교과 설계의 연계·심화 설명 |
| 중→고 주제 전이 | 175 | 교과별 과목 성격·해설의 명시적 연계 |
| 초등→중학교 전이 | 290 | 내용 체계표의 초→중 학년군 진행, 해설 명시 (초등 `kr-full-depth-v0.5` 핀) |

고교 469건 중 **10건은 직업계 관계가 일반고 성취기준을 선수로 가리키는 교차 참조**다. 별책26 미용전문교과 해설이 예술 계열 「미술 전공 실기」의 `[12미전02-04]`·`[12미전03-02]`를 헤어·피부·네일·메이크업 과목의 선수 지식으로 지목하기 때문이다. 두 고교 릴리스는 하나의 ID 네임스페이스를 공유하므로 이 방향은 허용하고, 반대 방향(일반고 관계가 직업계 주제를 참조)은 검증기가 거부한다.

### pedagogical-candidate 층 (권장 순서)

| 규칙 | 중학교 | 고등학교 일반 `high` | 근거 |
| --- | ---: | ---: | --- |
| `R-CODE` (`official-code-order`) | 542 | 2,353 | 같은 과목·같은 영역에서 공식 성취기준 코드가 인접한 두 기준의 핵심 주제 |
| `R-FACET` (`decomposition-order`) | 1,446 | 0 | 한 성취기준의 핵심 주제 → 같은 성취기준의 각 facet 주제 (중학교 분해 정책) |
| 합계 | **1,988** | **2,353** | |

고등학교 후보 2,353건은 일반 릴리스의 231개 과목만 대상이다. 직업계 릴리스에는 `learning-relations.candidate.json` 자체가 없으며, 이는 누락이 아니라 제품 범위 결정이다.

초→중 bridge에도 같은 층 구조를 둔다.

| 규칙 | 건수 | 근거 |
| --- | ---: | --- |
| `R-DOMAIN-CONTINUITY` (`repository-authored`) | 3,180 | 내용 체계표가 초등 5~6학년군과 중학교를 같은 영역 계열로 제시하는 10개 교과 57개 영역 쌍 |

영역 대응표는 `scripts/lib/bridge-domain-map.mjs`에 교과별로 명시하고, 대응이 불명확한 사회·역사는 비워 둔다. 근거와 한계는 `docs/reviews/2026-09-05-bridge-domain-continuity.md`에 있다. 중학교 성취기준 714개 중 official bridge 보유는 259개(36.3%), official+후보 보유는 447개(62.6%)다.

후보 층은 중학교 24/24 과목과 고등학교 일반 릴리스 231/231 과목을 덮고, 직업계 전문교과 528과목은 제외한다(제품 범위 밖). 두 층을 합치면 고등학교 공통·일반 선택 66개 과목 중 관계 0건 과목이 없다. 과목 간·교과 간 후보는 만들지 않으며 과목 수준 연계는 official `course-relations.json`이 담당한다. 각 층은 DAG이고 두 층의 합집합도 DAG다.

고등학교 전체 합계는 두 릴리스를 더한 값으로 34개 교과군, 759개 과목, 5,169개 영역, 50,749개 성취기준이다. 이 중 직업계 전문교과가 고등학교 성취기준의 93.8%이므로 중학교와 고등학교 총계를 그대로 비교하지 않는다. 튜터 제품이 실제로 쓰는 범위는 일반 릴리스 `high`의 231과목·3,124 성취기준이다.

두 릴리스를 합친 고등학교 759개 과목에는 공통·일반 선택·진로 선택·융합 선택, 교양·계열 선택, 전문 공통·전공 일반·전공 실무 과목이 포함된다. 같은 과목의 별책 내 성취기준 접두부 차이는 별도 과목으로 세지 않으며, 성취기준 수가 많다고 과목의 중요도나 난이도가 높다는 뜻은 아니다.

## 왜 중학교와 고등학교를 나눴나

중학교는 공통 기반과 학년군 구조가 중심이고, 고등학교는 과목 범주·학점·선택·전문 프로그램 구조가 중심이다. 따라서 의미 코어와 UI는 공유하지만 데이터 제품은 아래처럼 분리했다.

- `data/kr/middle`: 중학교 과목·영역·성취기준·주제
- `data/kr/high`: 모든 고등학교가 개설할 수 있는 231개 과목의 학점 규칙·선택·경로·성취기준·관계
- `data/kr/high-vocational`: 직업계 전문교과 528개 과목의 성취기준·주제·official 관계 (교과군 단위 샤드)
- `data/kr/bridges`: 초등→중학교·중학교→고등학교 전이와 양쪽 릴리스 버전 핀, 초등 주제 인벤토리 핀

이 구조는 한 저장소의 일관성을 유지하면서도 한 학교급만 독립 검수하거나 교체할 수 있다.

고등학교를 다시 두 릴리스로 나눈 이유는 두 가지다. 첫째, **제품 범위**가 다르다. 직업계 전문교과는 튜터 제품이 다루는 범위 밖의 참조 데이터인데도 고등학교 레코드의 93.8%를 차지해, 한 파일에 두면 제품이 실제로 쓰는 231과목이 묻힌다. 둘째, **파일 크기 한도**다. 합쳐 둔 `high/topics.json`은 80.4 MB, `high/standards.json`은 52.1 MB로 GitHub의 100 MB 하드 리밋에 근접했고 푸시마다 GH001 경고가 떴다. 분리 후에는 두 파일이 각각 5.2 MB·3.2 MB로 줄었고, 직업계 릴리스의 `standards`·`topics`는 교과군 단위 18개 샤드로 나눠 최대 단일 파일이 10.3 MB다. ID는 분리로 바뀌지 않는다 — 해시 입력이 `high` 네임스페이스로 유지되므로 레코드가 어느 파일에 있느냐만 달라진다.

## K-12 코어 TBox

초등 저장소(`korean-elementary-learning-map`)와 공유하는 클래스·속성·개념 어휘는 `ontology/k12-core.ttl` 한 파일에 모았다. 온톨로지 IRI는 `https://dexa.art/learnmap/ontology/k12-core`, versionIRI는 `…/1.0.0`이다.

- 두 저장소가 **바이트 동일 사본**을 보관하고, `tests/k12-core-sync.test.mjs`가 파일 헤더의 `# k12-core-sync-sha256:` 기준 해시로 동기화를 검사한다.
- `ontology/learning-map.ttl`이 `owl:imports`로 코어를 선언하지만 검증기는 로컬 사본에서 읽으므로 네트워크가 필요 없다. IRI의 실제 호스팅은 이 릴리스의 범위가 아니다.
- `slm:` IRI는 하나도 재발급하지 않는다. 클래스는 `owl:equivalentClass`, 관계 한정자·locator 필드는 `owl:equivalentProperty`, facet 개념은 `skos:exactMatch`로 코어에 연결한다. 중등은 한정자를 토큰(문자열)으로 저장하므로 코어의 `*Token` 하위 속성에 잇는다.
- ABox는 코어 어휘 `core:facetKey`·`core:topicRole`·`core:collapseInto`·`core:contentKind`·`core:misconception`·`core:contentSourceLocator`·`core:layerConcept`를 함께 배출한다. 덕분에 `ontology/queries/scq-21-k12-core-vocabulary.rq`는 초등 저장소의 `cq-18-k12-core-vocabulary.rq`와 **질의문이 완전히 같고** 두 저장소 모두에서 답이 나온다.
- 출처 기반 초안(`core:contentKind = source-grounded-draft`)은 SHACL이 `core:contentSourceLocator`를 정확히 하나 요구한다. 적대 fixture `UNSOURCED_AUTHORED_DRAFT`가 이 제약을 검사한다.
- 주제 역할 어휘(`core:TopicRoleScheme`의 anchor·facet·auxiliary)는 성취기준마다 대표 주제를 하나로 고정한다. SHACL `core:AnchorUniquenessShape`가 유일성을, `core:TopicRoleShape`가 `collapseInto`의 auxiliary 전용 규칙을 강제하고 적대 fixture `DUPLICATE_ANCHOR_ROLE`·`AUXILIARY_WITHOUT_COLLAPSE_TARGET`이 검사한다.
- STAS 레코드 locator 어휘(`core:stasEndpoint`·`core:stasRecordId`·`core:collectedAt`·`core:fileSha256`)는 TBox·shape에만 있고 데이터 배출은 없다. `docs/decisions/2026-09-05-stas-source-assessment.md`의 판정에 따라 어디서 읽었는지만 기록하고 본문은 담지 않는다.

## 산출물

- `sources/official`: 현행 고시 선택 근거, 첨부 번호, 파일 크기, SHA-256, 페이지 수 receipt
- `schema`: 공통·중학교·고등학교·bridge·공식 원문 계약
- `data/kr`: 네 정규화 JSON 데이터 제품(`middle`·`high`·`high-vocational`·`bridges`)과 통합 인벤토리 보고서
- `ontology`: OWL/RDFS/SKOS TBox, 초등 저장소와 공유하는 K-12 코어 TBox `k12-core.ttl`, JSON-LD context, SHACL, SCQ-01~22, 양성·적대 fixture
- `dist/ontology`: 결정적 JSON-LD/Turtle ABox와 manifest. 기본 빌드는 middle + high + bridges를 `learning-map.{ttl,jsonld}`로 내고 **25,954개 노드·330,750개 트리플**이다. `--include-vocational` 빌드는 직업계 ABox를 `high-vocational.{ttl,jsonld}`(**152,682개 노드**)로 따로 내며, 두 파일의 합집합은 **178,636개 노드·2,219,261개 트리플**이다
- `ui`: 학교급→교과군→과목→영역→성취기준/주제→근거, 초→중·중→고 전이(층 구분), 비교, 예시 경로 UI
- `dist/{middle,high,bridges,bundle,ui}`: 릴리스별 SHA-256 manifest

## 실행

```bash
bun install --frozen-lockfile
bun run setup:ontology
bun run verify
bun run serve
```

브라우저에서 `http://127.0.0.1:54321`을 열면 된다. `verify`는 데이터 schema·참조, JSON-LD↔Turtle 전체 RDF 동형성, 전체 ABox SHACL Advanced, 22개 SPARQL 실제 결과, 14개 적대 fixture, 콘텐츠·권리 경계, 테스트, 모든 manifest 해시를 확인한다. 여기에 `data/kr/**`의 모든 `.json`이 개당 25 MB를 넘지 않는지도 함께 본다(`MAX_DATA_FILE_BYTES`). GitHub 100 MB 하드 리밋에서 여유를 두기 위한 게이트이며, 한도를 넘길 컬렉션은 교과군 단위로 샤딩한다. 최초 실행 전 `bun run setup:ontology`로 Python 형식 검증 환경을 만든다.

직업계 ABox까지 포함한 온톨로지가 필요하면 기본 빌드 대신 전체 빌드를 쓴다.

```bash
bun run build:ontology:full   # = build:ontology --include-vocational
```

`dist/ontology/manifest.json`의 `includesVocational` 플래그가 어느 모드로 빌드했는지 기록하고, `validate:sparql`·`validate:shacl`은 이 플래그를 보고 검사할 그래프와 기대값을 고른다. 기대값은 `ontology/queries/expected.json`의 `results`(기본)와 `resultsIncludingVocational`(합집합)에 각각 들어 있다.

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
- 성취기준마다 `topicRole: anchor` 주제가 정확히 하나다. 분해가 인위적이라고 집필 보고가 지목한 facet 주제 21건은 삭제하지 않고 `topicRole: auxiliary` + `collapseInto`로 표시해 튜터가 대표 주제로 대신하게 한다. 규칙표는 `scripts/lib/facet-collapse-rules.mjs`이며 추측으로 항목을 늘리지 않는다.
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
- [K-12 공통 계약 v1 — 관계 층·어휘·facet](docs/plans/2026-09-05-k12-relation-vocabulary-spec.md)
- [후보 릴리스 보고서](docs/release/v0.6.0-candidate.md)

이 프로젝트는 교육부·국가교육위원회·NCIC의 공식 온톨로지나 승인 제품이 아니다.

## IRI 호스팅

온톨로지 용어(`https://dexa.art/learnmap/secondary/ontology#…`), 버전 IRI, 자원 IRI 안내(`/secondary/resource/`), JSON Schema `$id`는 dexa.art의 정적 문서로 해석된다. `bun run build:hosting`이 `dist/hosting/`에 배포 트리와 매니페스트를 만들고 `bun run check:hosting`이 결정성과 IRI 커버리지를 검사한다(`verify`에 포함). 사이트 저장소의 `scripts/sync-learnmap-ontology.mjs`가 초등·중등 트리를 함께 복사하며 공용 `k12-core.ttl`은 두 사본이 동일해야 한다. `check:hosting:deploy`는 사이트 체크아웃과, `check:hosting:live`는 dexa.art 실제 응답과 비교한다. 고교 직업계 그래프는 GitHub Pages 파일 한도(100 MB)를 넘어 호스팅하지 않는다.
