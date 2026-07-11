# 한국 중등교육 학습지도

대한민국 2022 개정 교육과정의 **중학교와 고등학교 전체**를 하나의 의미 체계로 탐색하되, `middle`·`high`·`bridges`를 독립 검증·릴리스하는 학습 온톨로지다.

현재 릴리스는 `v0.3.0-candidate`다. NCIC 공식 PDF 38개에서 확인한 714개 중학교 성취기준과 50,749개 고등학교 성취기준을 과목·영역(`Domain`)·PDF 해시·페이지 locator에 연결한다. 공식 원문은 포함하지 않는다. 중학교 성취기준은 초등 학습지도의 과목별 분해 원칙을 참고해 2~5개 주제 후보로 나눴다. 세부 주제·중→고 전이 398건·과목 관계·예시 경로는 저장소가 만든 검토 후보이며 공식 필수 요건이나 교과 전문가 승인을 뜻하지 않는다. 근거 없는 코드 배열 순서로 만든 선수 관계는 생성하지 않는다.

## 릴리스 수량

| 구분 | 중학교 | 고교 비직업계 | 고교 직업계 전문교과 |
| --- | ---: | ---: | ---: |
| 과목 | 24 | 231 | 528 |
| 영역 | 149 | 689 | 4,480 |
| 성취기준 | 714 | 3,124 | 47,625 |
| 세부 주제 | 2,160 | 3,124 | 47,625 |
| 주제 선수 관계 | 0 | 0 | 0 |

고등학교 전체 합계는 34개 교과군, 759개 과목, 5,169개 영역, 50,749개 성취기준이다. 이 중 직업계 전문교과가 고등학교 성취기준의 93.8%이므로 중학교와 고등학교 총계를 그대로 비교하지 않는다. 중→고 과정 수준 전이는 398건, 고등학교 과목 관계 후보는 473건이다.

고등학교 759개 과목에는 공통·일반 선택·진로 선택·융합 선택, 교양·계열 선택, 전문 공통·전공 일반·전공 실무 과목이 포함된다. 같은 과목의 별책 내 성취기준 접두부 차이는 별도 과목으로 세지 않으며, 성취기준 수가 많다고 과목의 중요도나 난이도가 높다는 뜻은 아니다.

## 왜 중학교와 고등학교를 나눴나

중학교는 공통 기반과 학년군 구조가 중심이고, 고등학교는 과목 범주·학점·선택·전문 프로그램 구조가 중심이다. 따라서 의미 코어와 UI는 공유하지만 데이터 제품은 아래처럼 분리했다.

- `data/kr/middle`: 중학교 과목·영역·성취기준·주제
- `data/kr/high`: 고등학교 과목·학점 규칙·선택·경로·성취기준·관계
- `data/kr/bridges`: 중학교→고등학교 전이와 양쪽 릴리스 버전 핀

이 구조는 한 저장소의 일관성을 유지하면서도 한 학교급만 독립 검수하거나 교체할 수 있다.

## 산출물

- `sources/official`: 현행 고시 선택 근거, 첨부 번호, 파일 크기, SHA-256, 페이지 수 receipt
- `schema`: 공통·중학교·고등학교·bridge·공식 원문 계약
- `data/kr`: 세 정규화 JSON 데이터 제품과 통합 인벤토리 보고서
- `ontology`: OWL/RDFS/SKOS TBox, JSON-LD context, SHACL, SCQ-01~20, 양성·적대 fixture
- `dist/ontology`: 168,326개 노드·1,879,104개 트리플의 결정적 JSON-LD/Turtle ABox와 manifest
- `ui`: 학교급→교과군→과목→영역→성취기준/주제→근거, 중→고 전이, 비교, 예시 경로 UI
- `dist/{middle,high,bridges,bundle,ui}`: 릴리스별 SHA-256 manifest

## 실행

```bash
bun install --frozen-lockfile
bun run setup:ontology
bun run verify
bun run serve
```

브라우저에서 `http://127.0.0.1:54321`을 열면 된다. `verify`는 데이터 schema·참조, JSON-LD↔Turtle 전체 RDF 동형성, 전체 ABox SHACL Advanced, 20개 SPARQL 실제 결과, 10개 적대 fixture, 콘텐츠·권리 경계, 테스트, 모든 manifest 해시를 확인한다. 최초 실행 전 `bun run setup:ontology`로 Python 형식 검증 환경을 만든다.

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
- 기계적 파생 요약·과목별 facet 주제·전이·과목 관계·경로는 모두 `candidate` 또는 `repository-authored`로 구분한다.
- 주제 선수 관계는 공식 근거나 전문가 검토 레코드가 생기기 전까지 생성하지 않는다.
- 경로는 `notOfficialRequirement: true`이며 진학·진로 적합성 판정이 아니다.
- 형식 검증, 교육적 검토, 문서 권리는 서로 다른 상태다. 현재 문서 권리는 `HOLD`다.
- 개인 성적·진단·수강 데이터는 저장하지 않는다.

## 문서

- [완성 계획과 수용 기준](docs/completion-plan.md)
- [아키텍처](docs/architecture.md)
- [데이터 계약](docs/data-contract.md)
- [역량 질문](docs/competency-questions.md)
- [출처와 재현](PROVENANCE.md)
- [권리 고지](NOTICE.md)
- [후보 릴리스 보고서](docs/release/v0.3.0-candidate.md)

이 프로젝트는 교육부·국가교육위원회·NCIC의 공식 온톨로지나 승인 제품이 아니다.
