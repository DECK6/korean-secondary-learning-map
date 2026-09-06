# PROGRESS — 초등·중등 온톨로지 개선 실행 원장

- 미션: 선수 관계 기반 튜터 에이전트에 앞서 초등·중등 학습지도 지식을 정리한다. 스펙 = `2026-09-05-k12-relation-vocabulary-spec.md`, 계획 = `2026-09-05-elementary-secondary-ontology-improvement-plan.md`.
- 역할: Fable 5.1(오케스트레이터) = 계약·발주·게이트 검증·통합. Opus 5 서브에이전트 = 구현·채굴·대량 생성. **외부 발주(Codex) 금지 — 2026-09-05 소유자 지시.**
- 규칙: 배치 단위로 이 원장을 즉시 갱신. 다른 세션이 붙으면 아래 클레임을 먼저 확인. **푸시 승인(2026-09-06 09:20, 소유자 "완료되면 푸시 해줘")**: R4 완료·전체 게이트 통과 후 초등·중등 두 저장소를 커밋·푸시한다.
- 결정: 개선계획 3장 권고안 채택 — (1) 관계 2층 분리, (2) 초등 ID 보존+필드 추가, (3) **STAS 판정 완료(19:58)**: 선수 관계 근거 불가(관련성취기준 = 같은 영역 형제 전체, 방향 없음; 학년군 단일) → 중학교 official은 56건 유지, 부족분은 후보 층. 평가 프롬프트는 STAS 성취수준(A~E)·평가준거를 **참고·교차검증용으로만** 쓰고 문장 재사용 금지(공공누리 없음, 약관 영리이용 제한). 산출물 근거는 NCIC 고시 별책(cleared)의 해설·평가 방향. STAS는 `sourceRefs` 보조 출처로만, 쪽수 대신 `{endpoint, acvmtStdSeq, collectedAt, sha256}` locator 종류를 스키마에 추가(R4).

## 상태

| 라운드 | 배치 | 저장소 | 상태 | 게이트 | 비고 |
| --- | --- | --- | --- | --- | --- |
| R1 | T1 관계 2층·주제 필드·메타 | 초등 | 완료 | 통과(오케스트레이터 재실행 20:40) | official 398(C316+D82) / 후보 1,891(repository-authored 1,122·decomposition-order 590·official-code-order 179), facetKey 100%, 온톨로지 0.4.0, 75 테스트, python G7 통과 |
| R1 | T3 PDF 공백·메타 | 중등 | 완료 | 통과 | 코퍼스 기반 결합, 중 결함 0(저장소 allowlist), 고 1,407(잔량은 직업계 실제 1음절 어휘), ID 불변, 24 테스트 |
| R1 | T5 고시 버전 매트릭스·diff | 초등 docs | 완료 | 통과 | 아래 로그 참조 |
| R1 | T6 STAS 조사·수집기 | 중등 sources/stas | 완료 | 통과 | 4,586건 수집(초611/중714/고3,261), 중 코드 100% 일치 |
| R2 | 초등 official 채굴 11교과 | 초등 | 완료(모듈) | elem-spec-module.mjs 11/11 통과 | 코드 쌍 합계 398: 수학108 국어83 체육75 사회26 과학24 음악23 영어18 미술18 도덕11 통합9 실과3. 빌드 반영은 T1a 후 |
| R2 | R2-E 중등 계약 구현(layer)·후보 층·facet 8종·쪽수 정정 | 중등 | 완료 | 통과(오케스트레이터 재실행 21:05) | official 중56/고469(recommended-before 투영 39건 제거, course-relations에 유지)/bridge 290+175, 후보 중1,988(R-CODE 542+R-FACET 1,446)/고2,353(R-CODE), 24/24·231/231 과목 커버, facet 8종 100%, math.mjs 쪽수 −6 정정(ID 불변), 31 테스트 |
| R2 | 고교 공통 과목 관계 | 중등 | R2-E에 후보 층으로 포함, official 추가 채굴은 R3 | — | |
| R3 | R3-A 통합교과 2026-1 재핀 + 음악·실과 출처 갱신 | 초등 | 완료 | 통과(오케스트레이터 재실행 22:45: 76 테스트, official 400·후보 1,875·클러스터 152) | 통합 57코드 2026판 단일(즐04 삭제·4코드 신설·12코드 의미 재배정, 별책15 추출 집합과 정확히 일치), 별책2 2026-1 교차검증 추가, 음악 10003999·실과 10004244 재핀, 갭 3건 종결 + 3건 신규(46) |
| R3 | R3-B0 콘텐츠 오버레이 인프라 — 중등 | 중등 | 완료 | 통과(43 테스트, 오케스트레이터 재확인) | data/kr/<level>/content/<slug>.json, contentKind·misconceptions·contentSourceLocator, UI '검토 초안' 배지. 온톨로지 contentKind 배출은 R4 |
| R3 | R3-B0 콘텐츠 오버레이 인프라 — 초등 | 초등 | 완료 | 통과(89 테스트, 오케스트레이터 재확인) | data/kr/content/<subject>-<band>.json, 중등과 동형, 기준선: 중복 evidence 1,660·prompt 144·템플릿 54.2% |
| R3 | R3-B4 중학교 수학 집필(180주제) | 중등 | 완료 | 통과(오케스트레이터 표본 4건 검토: 구체적·관찰 가능·해설 쪽수 근거) | evidence 360·prompt 180·misconception 240, 해설 근거 43%(나머지 고려 사항 근거), verbatim 0·중복 0 |
| R3 | R3-B1~3 초등 수학 집필(1~2: 87 / 3~4: 141 / 5~6: 135) | 초등 | 완료 | 통과(통합 빌드 89 테스트·7게이트·결정성, 오케스트레이터 09:10) | 363 주제 source-grounded-draft, 해설 근거 27~30%, 별책 원문 16자 연속 일치 0 |
| R3 | R3-C bridge facet 정규화·재핀·후보 bridge | 중등 | 완료 | 통과(오케스트레이터 재실행 08:05: 49 테스트, 커버리지 62.6%) | official 290 유지·ID 불변, facet 127튜플→concept 270+영어 communication 20, 초등 v0.5 재핀(삭제 주제 참조 0), 후보 3,180(R-DOMAIN-CONTINUITY, 10교과 57영역 쌍; 사회·역사는 domain이 단원명이라 대응표 공백) |
| R3 | bridge 확장 | 중등 | 대기 | — | R2 이후 |
| R3 | 중등 facet 8종 사상 | 중등 | 대기 | — | |
| R3 | R3-D 통합교과 즐거운 생활 연계 채굴 | 초등 | 완료(모듈) | 통과 | 후보 21건(23은 집계 오기) 중 16 채택·5 방향 미판정, D 11→27. 빌드 반영은 집필 완료 후 오케스트레이터 통합 빌드 |
| R4 | K-12 코어 TBox(k12-core.ttl)·contentKind/STAS locator 배출·초등 summary 교체·중등 v0.6.0-candidate 승격·bridge 재핀 | 양쪽 | 완료 | 통과(중등 bun verify 52테스트·SPARQL 21·적대 12·SHACL 2,142,988 트리플, sec-layers·sec-hygiene / 초등 verify:formal 7게이트·93 테스트·python 5) | 코어 클래스 11·속성 29·개념 38, 정합 축 초등 46+중등 28, 초등 트리플 238,343→248,548·리소스 21,800→22,163, 중등 노드 176,185·트리플 2,142,988. bridge 핀 = 초등 topics.json sha 16a2b843… |

## 로그

- 2026-09-05 점검 완료, 계획서·스펙 작성. R1 4태스크 pumasi 발주 준비.
- 2026-09-05 06:22 R1 pumasi 발주: job /private/tmp/claude-501/-Volumes-data-Dev/2bff99e6-57ed-4c46-a727-67e5af4b6c57/scratchpad/jobs/pumasi-2026-09-05-0622-b5574b (config scratchpad/pumasi-round1.yaml, gates scratchpad/gates/). HEAD 기준: 초등 3ef0563, 중등 68e6228.
- 2026-09-05 06:35 소유자 지시로 Codex(pumasi) 발주 중단·정지. 워커 변경 없음(양쪽 git status 깨끗). Opus 5 서브에이전트 5개(T1a/T1b/T3/T5/T6)로 R1 재발주.
- 2026-09-05 06:50 R1 Opus 5개(T1a 기계, T1b 수학, T3 위생, T5 diff, T6 STAS) + R2 초등 채굴 3개(국어 / 도덕·실과·통합 / 미술·체육) 동시 실행. 게이트: scratchpad/gates/{elem-layers,elem-spec-module,sec-hygiene,sec-layers}.mjs, stas.sh.
- 2026-09-05 07:05 T1b 완료: 초등 수학 official C 99 + D 9 = 108건(121기준 중 79 등장), 검토 문서 docs/reviews/2026-09-05-math-official-relations-review.md. **발견: 별책8 인쇄 쪽수 = PDF 페이지 − 6. 중등 official-relation-specs/math.mjs의 middleRequired 쪽수 13~16은 PDF 페이지(인쇄 p.7~10)라 정정 필요 → R2-E 범위에 추가.** 한계: 변화와 관계 3~4→5~6 0건, 갈래 내 데카르트 곱 전개로 밀도 높음(축약 규칙 후속).
- 2026-09-05 07:10 R2 국어 완료: C 79 + D 4 = 83건(1~2→3~4 34, 3~4→5~6 45), 게이트 통과. 별책5도 인쇄 쪽 = PDF 쪽 − 6. 병행·동시학습·수업제안·교과 간 후보는 미채택(문서화).
- 2026-09-05 07:20 R2 도덕(C6+D5)·실과(C0+D3)·통합교과(C0+D9) 완료, 게이트 통과. **중대 발견: 2026-1 일부개정 별책15에서 '즐거운 생활' 16개 코드가 전면 재배정(즐04 영역 삭제, [2즐02-05/02-06/03-05/03-06] 신설). 초등 인벤토리 즐 코드는 2022판 의미 → 통합교과 인벤토리를 2026판으로 갱신하는 작업(S0 재수집)이 필요. T5 결과와 함께 R3 항목으로 편성.** 실과 D2([6실05-02]→[6실04-06])는 영역 역방향이라 코드 순서 후보와 충돌 가능(문서화).
- 2026-09-05 ~18:30 Opus 세션 한도(429, 19:10 리셋)로 T1a·T3·T6·R2 미술/체육 중단. 19:28 소유자 '재개' → 4개 에이전트 SendMessage로 컨텍스트 유지 재개.
- 2026-09-05 T5 완료: docs/source-version-matrix.md, docs/source-version-diff-2026-09.md. 판정 — 국어·수학·과학·사회·영어·도덕·미술·체육 동일(재핀 불필요, 사회·영어 변경은 중·고 구간뿐), 음악 변경([4음02-05]·[6음02-05] 국가유산 용어 + 감상 영역 2셀), 실과 첨부 교체(10003781→10004244, [6실04-06] 어미), **통합교과 중대 변경(즐 12코드 재배정·[2즐04-*] 삭제·4코드 신설·건강한 생활 9 신설; 현행 620 중 616 존재, [2즐01-01]~[2즐03-04] 12건은 코드 동일하나 의미 상이)**. 2026-1 개정 대상은 별책1·2·3·4·15뿐 → 국어·수학·실과 2026 갭 3건 종결 가능. 별책2(초등학교 교육과정, 첨부 10004180) 미인용 상태 — 620코드 단일 문서. 시행일 초1·2 2028-03-01(현행 고시본 vs 시행판 정책 결정 필요). 재핀 우선순위 P0 통합교과 → P1 음악·실과 → P2 사회·영어·별책2.
- 2026-09-05 19:35 R2 미술(C15+D3=18)·체육(C43+D32=75) 모듈 게이트 통과 확인(문서 완성은 재개 에이전트가 마무리). 영어·음악 / 과학·사회 워커 2개 발주.
- 2026-09-05 19:50 T3 완료. pdftotext 옵션으론 해결 불가(한국어 단어 중간 줄바꿈) → scripts/lib/text-normalize.mjs 코퍼스 증거 결합. shapes.ttl CoverageGap status enum이 JSON 스키마와 어긋나던 기존 불일치도 해소. 게이트 allowlist 오탐(풀·성·계·질·팀) 보정 후 재실행 통과. expected.json version 0.4.0 잔존 → R2-E 범위에 추가.
- 2026-09-05 19:55 R2-E 발주(Opus): 브리프 scratchpad/r2-sec-layers-brief.md (+8 쪽수 정정, +9 expected.json version).
- 2026-09-05 19:58 T6 완료: /rest/acvmt/acvmtStd/acvmtStdList(학교급별 전량)·acvmtStd(상세 1건). 초등 620 중 611 일치(건강한 생활 9건 STAS 미탑재), 로마숫자 Ⅰ/I 표기 불일치 76건 발견(고교 ID 정규화 후속). docs/decisions/2026-09-05-stas-source-assessment.md, sources/stas/receipt.json.
- 2026-09-05 20:10 R2 영어(C18+D0)·음악(C13+D10) 완료, 게이트 통과. 영어 가치·태도 병합 셀 해석 3건은 검토 문서 한계에 명시. 남은 채굴: 과학·사회(실행 중).
- 2026-09-05 20:20 R2 과학(C19+D5)·사회(C24+D2) 완료. 사회 domainKorean이 단원명이라 tuple domainLabel은 내용 체계표 영역명 사용(인수인계). 과학 단원 나열형 '연계된다' 12건 미채택(방향 없음·교차곱 폭발), 8건은 C와 일치해 방증.
- 2026-09-05 20:40 T1a 완료·오케스트레이터 재검증 통과. R3-A 발주(Opus).
- 2026-09-05 21:05 R2-E 완료·재검증 통과. R3-B0 중등 발주. 미정정 잔여: 빌더 인라인 officialHighCourseProgressions 39건 쪽수 문장 대조(R4).
- 2026-09-05 21:25 R3-B0 중등 완료. R3-B4 중학교 수학 집필 발주(Opus).
- 2026-09-05 21:50 R3-B4 완료. 발견: 9수04-04(통계적 탐구)·9수02-21·9수01-08·9수03-17은 facet 분해가 인위적(후속 축약 후보). PDF 추출에서 9수02-19·22 수식 누락.
- 2026-09-05 22:45 R3-A 완료·재검증 통과. R3-B0 초등, R3-C bridge 병렬 발주. **후속 과제(미발주)**: 즐거운 생활 절 '연계' 23건 채굴(integrated 검토 문서 9.4절), 의미 재배정 12건의 ABox 변경 기록 방식은 deprecation-policy에 신설 절로 규정(replacements.json은 TBox 용어 전용).
- 2026-09-05 23:15 R3-B0 초등 완료·재확인. R3-B1~3 초등 수학 집필 3워커 발주.
- 2026-09-05 23:20 R3-D 발주. R4 브리프 작성 완료(scratchpad/r4-core-release-brief.md).
- 2026-09-05 23:35 R3-D 완료. 통합 빌드 대기(초등 수학 집필 3워커 진행 중).
- 2026-09-05 ~23:50 Opus 세션 한도(429, 00:20 리셋)로 R3-B1/B2/B3·R3-C 중단. 2026-09-06 07:31 소유자 '계속' → 4개 에이전트 SendMessage 재개(B1은 math-1-2.json 86KB 부분본 존재, B2/B3 파일 없음, R3-C는 검토 문서 단계).
- 2026-09-06 07:45 R3-B1(초등 수학 1~2, 87엔트리) 완료·게이트 통과. 발견: 초등 curriculum-standards summary가 성취기준 문장이 아니라 verbatim 검사가 무력(R4에서 별책2 기반 요약 보강 검토), 관찰 동사 정규식이 종결형 미인식 → 오케스트레이터가 kr-content-quality.mjs 보강(B2/B3에 통보), [2수03-06]·[2수01-01]은 facet 3분할이 인위적.
- 2026-09-06 07:50 초등 content-overlay 테스트 13번('built topics carry content provenance')은 오버레이 파일 존재·미빌드 상태라 실패 중 — 집필 완료 후 통합 빌드로 해소 예정(정규식 보강과 무관, 나머지 12 통과).
- 2026-09-06 08:05 R3-C 완료·재검증 통과. 후속: 사회·역사 초→중 영역 대응표(R4 이후), 영어 EFL 초등에 concept facet 부재(facet 사상 재검토 후보).
- 2026-09-06 08:20 R3-B2(초등 수학 3~4, 141엔트리) 완료·게이트 통과. 관찰 동사 검사를 종결형 일반 패턴+인지동사 제외로 일반화(오케스트레이터). **R4 추가 항목**: 초등 curriculum-standards summary가 '…공식 성취기준 [코드]이다' 껍데기라 verbatim 검사 무력 → 별책2(2026-1, 첨부 10004180) 기준 성취기준별 원문 비인용 요약(20~60자)으로 교체. 측정 단위 관계 계열([4수03-16/18/21/22])은 application·representation facet가 구조적으로 겹침(facet 축약 후보 목록에 추가).
- 2026-09-06 09:10 R3 종료. 오케스트레이터 직접 조치: (1) 관찰 동사 검사를 strict(기계 repair용, 원래 stem 목록)·authored(오버레이용, ㄴ다/는다 종결 + 인지동사 제외 jongseong 판정)로 분리 — 기계 주제 1,593건 출력 불변 확인, (2) R3-D +16 official 반영해 CQ expected.json 8개 수치·README·release-report·integration-report·redesign-notes 갱신(official 416, directRequires 416, indirect 97, 리소스 21,800, 트리플 238,343), (3) 중등 bridge 핀을 초등 topics.json 최신 sha(ff90b0…)로 재핀. 초등 89/89·python G7·결정성, 중등 49/49·SHACL·SPARQL·sec-layers·sec-hygiene 통과.
- 2026-09-06 09:15 R4 발주(Opus). 초등 summary 교체 항목 추가.
- 2026-09-06 08:5x R4 완료(Opus). **코어**: `ontology/k12-core.ttl`(IRI …/k12-core, versionIRI …/1.0.0, 파일 sha256 f015b4b8…, 동기화 기준 해시 cb2c8da7…)을 두 저장소에 바이트 동일 사본으로 두고 `tests/k12-core-sync.test.mjs`가 헤더 해시로 검사. 두 TBox가 `owl:imports` 선언 + 로컬 파일 로딩(네트워크 불필요). 코어는 클래스 11·속성 29·개념 스킴 8·개념 38. 정합 축은 초등 46개(equivalentClass 10·equivalentProperty 6·subClassOf/subPropertyOf 5·exactMatch 25), 중등 28개(equivalentClass 6·equivalentProperty 10·subClassOf 3·exactMatch 9). `lm:`·`slm:` IRI 재발급 0.
- 2026-09-06 R4 **배출**: 두 ABox가 `core:facetKey`·`core:contentKind`·`core:misconception`·`core:contentSourceLocator`·`core:layerConcept`를 함께 배출. SHACL이 `source-grounded-draft` → `contentSourceLocator` 필수를 강제하고 적대 fixture 2종(초등 `missing-content-locator.ttl`, 중등 `UNSOURCED_AUTHORED_DRAFT`)이 검사. STAS locator 어휘(`core:stasEndpoint`·`core:stasRecordId`·`core:collectedAt`)는 TBox·shape 전용, 데이터 배출 0.
- 2026-09-06 R4 **역량 질문**: 초등 CQ 17(콘텐츠 종류별 주제 수: 기계 1,593 / 초안 363), CQ 18 = 중등 SCQ 21과 **질의문 완전 동일**(초등 9행, 중등 10행 — 중등만 `core` facet 사용). 기존 CQ 16 / SCQ 20 전부 통과 유지.
- 2026-09-06 R4 **초등 요약 교체**: `scripts/lib/kr-standard-summaries.mjs`에 별책2 2026-1(첨부 10004180, sha256 f943dab8…) 근거 재서술 요약 293건 신설(수학 121 자리표시자 + 과학 102 + 도덕 24 + 실과 19 + 영어 17 + 통합 5 + 체육 3 + 국어 1 + 미술 1). 620건 전부 `summaryKind: source-grounded-paraphrase`, 원문 최장 공유 런 15자(임계 16자), 주제 ID 1,956건 전부 불변. 워크스트림 생성기 4곳과 `repair-kr-workstreams.mjs`가 이 표 하나만 소비한다. 오버레이 verbatim 검사를 "요약 통째 포함"에서 "16자 연속 공유"로 강화했고 기존 오버레이 3개는 여전히 verbatim 0.
- 2026-09-06 R4 **정합**: `standardKey`는 `standards[0]` 파생 필드임을 스키마·통제 어휘·TBox 주석에 명시(동등성은 validate-kr.mjs가 이미 강제 중이었다).
- 2026-09-06 R4 **버전**: 중등 데이터·온톨로지·controlled-vocabularies 모두 `0.6.0-candidate`, `docs/release/v0.6.0-candidate.md` 신규(250줄). 초등은 데이터 `kr-full-depth-v0.5` / 온톨로지 `0.4.0` 유지하고 CHANGELOG·ontology/CHANGELOG·릴리스 보고서·README·PROVENANCE·NOTICE를 이번 세션 전체 변경으로 갱신. bridge를 초등 topics.json 신규 sha(16a2b843…)로 재핀.
- 2026-09-06 R4 **미정**: 온톨로지 IRI(`https://dexa.art/learnmap/ontology/k12-core`)의 실제 호스팅은 소유자 몫. 커밋·푸시 없음(승인 게이트).
- 2026-09-06 09:20 소유자 푸시 승인. R4 완료 → 오케스트레이터 재검증 → 커밋·푸시 예정.
