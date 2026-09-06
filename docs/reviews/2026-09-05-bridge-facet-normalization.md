# 초→중 bridge facet 정규화·초등 재핀 검토 (2026-09-05)

- 대상: `data/kr/bridges/elementary-transitions.json` 290건, `data/kr/bridges/elementary-topic-inventory.json`
- 계약: `docs/plans/2026-09-05-k12-relation-vocabulary-spec.md` 3·4절, 개선계획 A6·P2-3
- 결론: official bridge 290건은 그대로이고 관계 ID도 전건 동일하다. 초등 선수 주제 127건(고유 초등 성취기준 94개)이 각 성취기준의 `facetKey: concept` 주제로 옮겨졌다.

## 1. 무엇을 바꿨나

개선계획 A6이 지적한 대로, 46개 사양 모듈의 `elementaryToMiddleRequired`·`elementaryCommentaryRequired` 튜플은 초등 topicId를 사람이 직접 적어 왔다. 그래서 같은 규칙인데도 과목마다 다른 facet를 골랐다.

| 상태 | 초등 선수 주제의 접미사·facet 분포 |
| --- | --- |
| 변경 전 | `concept` 110, `perform` 64, `.01` 38, `practice` 23, `application` 19, `make` 16, 영어 의미형 접미사 20 |
| 변경 후 | `concept` 270, `communication` 20(영어 예외) |

빌더는 이제 튜플의 topicId를 그대로 쓰지 않는다. `elementary-topic-inventory.json`에 핀된 topicId → 초등 성취기준 매핑으로 성취기준을 역산한 뒤, 그 성취기준의 대표 주제(`facetKey: concept`, 없으면 topicId 정렬상 첫 주제)를 `prerequisiteTopicId`로 기록한다.

**ID 안정성**: 관계 ID 해시 씨앗은 튜플에 적힌 원래 topicId를 그대로 쓴다(`scripts/build-learning-relations.mjs`의 `elementaryPrerequisite`). R2-E가 `math.mjs`에 쓴 `idPageOffset`과 같은 방식으로 표시값과 해시 씨앗을 분리했다. 그 결과 290건의 관계 ID 집합이 변경 전후 완전히 동일하고, `data/kr/bridges/review-records.json`의 `targetIds`도 그대로다.

## 2. 예외: 영어 20건

초등 영어(EFL) 인벤토리에는 `concept` facet 주제가 없다. 20개 초등 영어 성취기준의 주제는 모두 `communication`·`procedure`·`reflection`이다. 계약 3절의 폴백("없으면 정렬상 첫 주제")에 따라 정렬상 첫 주제를 쓰며, 그 결과 facet는 전건 `communication`이다. 이것이 문서화된 유일한 예외이고 `tests/relation-layers.test.mjs`가 "예외 교과는 영어뿐"임을 검사한다.

## 3. 초등 재핀 결과

- 초등 `taxonomyVersion`: `kr-full-depth-v0.4` → `kr-full-depth-v0.5`
- 초등 `topics.json` 주제 수: 1,956 (변화 없음), 성취기준 620 (변화 없음)
- 인벤토리는 `scripts/dev/pin-elementary-inventory.mjs`로 재생성한다. 이제 topicId 목록뿐 아니라 성취기준별 `code`·`subjectKorean`·`domainKorean`·`gradeBand`·대표 주제·주제 목록과 초등 manifest의 `topics.json` sha256 핀(`sourcePin`)을 담는다. 중등 빌더는 초등 저장소를 직접 읽지 않고 이 핀만 읽는다.

### 삭제·변경된 초등 주제

2026-1판 통합교과 재작성으로 초등 주제 ID 48개가 사라지고 48개가 새로 생겼다.

| 구분 | 건수 | 내용 |
| --- | ---: | --- |
| 삭제 | 48 | `kr.mt.integrated.joyful-life.{who,where,now,doing}.2jeul0[1-4]xx.0[1-3]` — 이 중 `[2즐04-*]` 12건은 성취기준 자체가 사라졌고, 나머지 36건은 영역 경로가 바뀌어 ID가 재발급됐다 |
| 신규 | 48 | `kr.mt.integrated.joyful-life.{experience,expression,appreciation}.2jeul0[1-3]xx.0[1-3]` |

**bridge 영향: 0건.** 사라진 48개 ID를 참조하는 official bridge 튜플은 없다. 통합교과는 1~2학년군 전용이고 초→중 bridge는 3~4·5~6학년군 주제만 출발점으로 쓰기 때문이다. official에서 제외한 관계는 없다.

## 4. 변경된 초등 성취기준 매핑표 (94개)

`접미사(전)`·`접미사(후)`는 topicId의 마지막 마디다. `참조`는 그 성취기준을 쓰는 bridge 튜플 수다.

| 교과 | 초등 성취기준 | 접미사(전) | 접미사(후) | 참조 |
| --- | --- | --- | --- | ---: |
| 미술 | `[4미01-04]` | `make` | `understand` | 1 |
| 미술 | `[4미02-04]` | `make` | `understand` | 1 |
| 미술 | `[6미01-01]` | `make` | `understand` | 1 |
| 미술 | `[6미01-03]` | `make` | `understand` | 1 |
| 미술 | `[6미01-04]` | `make` | `understand` | 2 |
| 미술 | `[6미02-01]` | `make` | `understand` | 1 |
| 미술 | `[6미02-02]` | `make` | `understand` | 2 |
| 미술 | `[6미02-03]` | `make` | `understand` | 1 |
| 미술 | `[6미02-04]` | `make` | `understand` | 1 |
| 미술 | `[6미03-01]` | `make` | `understand` | 1 |
| 미술 | `[6미03-02]` | `make` | `understand` | 1 |
| 미술 | `[6미03-03]` | `make` | `understand` | 1 |
| 미술 | `[6미03-04]` | `make` | `understand` | 2 |
| 국어 | `[4국02-05]` | `01` | `02` | 1 |
| 국어 | `[6국02-01]` | `01` | `02` | 1 |
| 국어 | `[6국02-02]` | `01` | `02` | 1 |
| 국어 | `[6국02-03]` | `01` | `02` | 1 |
| 국어 | `[6국02-04]` | `01` | `02` | 1 |
| 수학 | `[4수02-03]` | `application` | `concept` | 1 |
| 수학 | `[4수03-03]` | `application` | `concept` | 1 |
| 수학 | `[4수03-12]` | `application` | `concept` | 1 |
| 수학 | `[4수04-03]` | `application` | `concept` | 1 |
| 수학 | `[6수01-04]` | `application` | `concept` | 1 |
| 수학 | `[6수01-05]` | `application` | `concept` | 2 |
| 수학 | `[6수01-11]` | `application` | `concept` | 1 |
| 수학 | `[6수02-01]` | `application` | `concept` | 2 |
| 수학 | `[6수02-05]` | `application` | `concept` | 1 |
| 수학 | `[6수03-02]` | `application` | `concept` | 1 |
| 수학 | `[6수03-06]` | `application` | `concept` | 1 |
| 수학 | `[6수03-08]` | `application` | `concept` | 1 |
| 수학 | `[6수03-16]` | `application` | `concept` | 1 |
| 수학 | `[6수03-19]` | `application` | `concept` | 1 |
| 수학 | `[6수04-03]` | `application` | `concept` | 2 |
| 수학 | `[6수04-06]` | `application` | `concept` | 1 |
| 음악 | `[6음01-01]` | `perform` | `listen` | 1 |
| 음악 | `[6음01-02]` | `perform` | `listen` | 1 |
| 음악 | `[6음01-03]` | `perform` | `listen` | 1 |
| 음악 | `[6음01-04]` | `perform` | `listen` | 1 |
| 음악 | `[6음02-01]` | `perform` | `listen` | 1 |
| 음악 | `[6음02-02]` | `perform` | `listen` | 1 |
| 음악 | `[6음02-03]` | `perform` | `listen` | 1 |
| 음악 | `[6음02-04]` | `perform` | `listen` | 1 |
| 음악 | `[6음02-05]` | `perform` | `listen` | 1 |
| 음악 | `[6음03-01]` | `perform` | `listen` | 1 |
| 음악 | `[6음03-02]` | `perform` | `listen` | 1 |
| 음악 | `[6음03-03]` | `perform` | `listen` | 1 |
| 음악 | `[6음03-04]` | `perform` | `listen` | 1 |
| 체육 | `[6체01-01]` | `perform` | `understand` | 3 |
| 체육 | `[6체01-02]` | `perform` | `understand` | 3 |
| 체육 | `[6체01-03]` | `perform` | `understand` | 3 |
| 체육 | `[6체01-04]` | `perform` | `understand` | 3 |
| 체육 | `[6체01-05]` | `perform` | `understand` | 1 |
| 체육 | `[6체01-06]` | `perform` | `understand` | 1 |
| 체육 | `[6체02-01]` | `perform` | `understand` | 3 |
| 체육 | `[6체02-02]` | `perform` | `understand` | 3 |
| 체육 | `[6체02-03]` | `perform` | `understand` | 3 |
| 체육 | `[6체02-04]` | `perform` | `understand` | 3 |
| 체육 | `[6체02-05]` | `perform` | `understand` | 3 |
| 체육 | `[6체02-06]` | `perform` | `understand` | 3 |
| 체육 | `[6체02-07]` | `perform` | `understand` | 2 |
| 체육 | `[6체02-08]` | `perform` | `understand` | 2 |
| 체육 | `[6체02-09]` | `perform` | `understand` | 2 |
| 체육 | `[6체02-10]` | `perform` | `understand` | 1 |
| 체육 | `[6체02-11]` | `perform` | `understand` | 1 |
| 체육 | `[6체02-12]` | `perform` | `understand` | 1 |
| 체육 | `[6체03-01]` | `perform` | `understand` | 3 |
| 체육 | `[6체03-02]` | `perform` | `understand` | 1 |
| 체육 | `[6체03-03]` | `perform` | `understand` | 1 |
| 체육 | `[6체03-04]` | `perform` | `understand` | 1 |
| 체육 | `[6체03-05]` | `perform` | `understand` | 1 |
| 체육 | `[6체03-06]` | `perform` | `understand` | 1 |
| 체육 | `[6체03-07]` | `perform` | `understand` | 1 |
| 체육 | `[6체03-08]` | `perform` | `understand` | 1 |
| 기술·가정·정보 | `[6실01-01]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실01-04]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실01-05]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실01-07]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실02-01]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실02-04]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실02-05]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실02-07]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실02-10]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실02-11]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실03-01]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실03-02]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실03-03]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실03-04]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실03-05]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실04-01]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실04-02]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실04-05]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실04-06]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실04-07]` | `practice` | `concept` | 1 |
| 기술·가정·정보 | `[6실05-02]` | `practice` | `concept` | 3 |

바뀌지 않은 교과: 도덕(19건)·과학(35건)·사회·역사(56건)는 이미 `concept`를 골랐고, 국어 38건 중 33건은 `.01`이 이미 그 성취기준의 `concept` 주제였다. 영어 20건은 2절의 예외다.

## 5. 과목별 검토 문서와의 관계

`docs/reviews/2026-07-17-<subject>-official-relations-review.md`의 "초등학교에서 중학교로" 절은 채굴 당시 사양 모듈에 적힌 topicId를 그대로 옮겨 적었다. 그 topicId는 지금도 사양 모듈의 값이자 관계 ID의 해시 씨앗이며, 발행되는 `prerequisiteTopicId`만 이 문서의 매핑표대로 대표 주제로 옮겨진다. 두 문서가 다르게 보이면 이 문서가 발행 값의 기준이다.

## 6. 검토 한계

- 이 정규화는 facet 선택 규칙의 일관성을 맞춘 것이고, 어떤 초등 성취기준이 어떤 중학교 성취기준의 선수인지에 대한 판단은 바꾸지 않았다.
- 초등 영어 인벤토리에 `concept` facet가 생기면 예외 20건을 다시 검토해야 한다.
- 초등 저장소가 다시 재핀되면 `bun scripts/dev/pin-elementary-inventory.mjs`를 돌리고 이 문서의 3절을 갱신해야 한다.
