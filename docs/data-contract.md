# 데이터 계약 초안

## 1. 파일 구성

초등 프로젝트의 중첩된 대형 파일은 초기 구축에는 편리했지만, 중·고 전체 과목 수와 선택 관계를 다루기에는 변경 충돌과 부분 로딩 비용이 크다. 중등 프로젝트는 정규화된 파일을 권장한다.

```text
data/kr/
  shared/
    source-manifest.json
    controlled-vocabularies.json
  middle/
    release.json
    curriculum-frameworks.json
    subject-groups.json
    courses.json
    domains.json
    standards.json
    topics.json
    clusters.json
    learning-relations.json
    learning-relations.candidate.json
    review-records.json
    coverage-gaps.json
    content/                # 주제 콘텐츠 오버레이(빌드 입력, 5.1절)
  high/
    release.json
    curriculum-frameworks.json
    subject-groups.json
    courses.json
    domains.json
    standards.json
    topics.json
    clusters.json
    learning-relations.json
    learning-relations.candidate.json
    course-relations.json
    credit-rules.json
    choice-sets.json
    pathways.json
    review-records.json
    coverage-gaps.json
    content/                # 주제 콘텐츠 오버레이(빌드 입력, 5.1절)
  high-vocational/          # 직업계 전문교과 528과목 (아키텍처 5.3절)
    release.json
    subject-groups.json
    courses.json
    domains.json
    standards/<교과군슬러그>.json   # 18개 샤드
    topics/<교과군슬러그>.json      # 18개 샤드
    clusters.json
    learning-relations.json
    review-records.json
    coverage-gaps.json
  bridges/
    release.json
    transition-alignments.json
    review-records.json
  local-offerings/          # 선택 확장; 네 국가 수준 릴리스와 분리
```

교과별 작성 작업은 `workstreams/<school-level>/<subject-group>.json`에서 수행한다. 중학교·고등학교(일반·직업계)·bridge 빌더는 각각 독립 manifest를 생성하며, 통합 bundle manifest는 릴리스별 해시만 조합한다.

스키마도 `core`, `middle-profile`, `high-profile`, `high-vocational-profile`, `bridge-profile`로 나눈다. 고등학교의 학점·선택 제약을 중학교 레코드에 요구하지 않고, 일반 고교의 선택 묶음·경로·과목 관계·후보 관계 층을 직업계 릴리스에 요구하지 않는다. `high-vocational-profile`의 레코드 모양은 `high-profile`을 재사용하며 릴리스 구성만 다르다.

**`collections` 항목은 문자열 또는 샤드 경로 배열이다.** 한 파일로 담기는 컬렉션은 `"topics.json"`처럼 파일명 하나를 쓰고, 샤딩한 컬렉션은 `["topics/agriculture.json", …]`처럼 릴리스 순서를 유지한 경로 배열을 쓴다. 소비자는 경로를 하드코딩하지 않고 `release.json`을 통해 파일 목록을 얻는다(`scripts/lib/profile-collections.mjs`의 `readProfileCollection`). 샤드 슬러그는 공개 경로의 일부이므로 안정 식별자로 취급하며 `vocationalSubjectGroupSlugs`에 교과군 라벨 기준으로 고정한다.

**파일 크기 한도 25 MB.** `scripts/validate.mjs`의 `MAX_DATA_FILE_BYTES`가 `data/kr/**`의 모든 `.json`을 걸어 개당 25 MB 초과를 실패로 처리한다. GitHub 100 MB 하드 리밋에서 여유를 두기 위한 게이트이며, 한도를 넘길 컬렉션은 의미 있는 축(교과군)으로 샤딩한다. 현재 최대 단일 파일은 `high-vocational/topics/agriculture.json` 10.3 MB다.

## 2. 공통 필드

모든 권위 레코드는 다음 필드를 갖는다.

```json
{
  "id": "stable-id",
  "releaseId": "kr-2022-secondary-v0.4.0-candidate",
  "labelKorean": "표시 이름",
  "sourceRefs": ["source-id"],
  "verificationStatus": "official-source-checked",
  "reviewStatus": "candidate",
  "sourceTextIncluded": false
}
```

`verificationStatus`는 출처 확인 상태이고 `reviewStatus`는 교육적 해석 검토 상태다. 두 값을 합치지 않는다.

중학교와 고등학교는 서로 다른 `releaseId`를 사용한다. bridge 릴리스에는 다음 버전 핀이 필수다.

```json
{
  "id": "kr-2022-middle-high-bridge-v0.4.0-candidate",
  "middleReleaseId": "kr-2022-middle-v0.4.0-candidate",
  "highReleaseId": "kr-2022-high-v0.4.0-candidate",
  "transitionCount": 0
}
```

`transitionCount: 0`은 설계 예시이며 실제 인벤토리 수량이 아니다.

## 3. 과목

```json
{
  "id": "kr.course.2022.high.example",
  "schoolLevel": "high",
  "programScopes": ["general"],
  "subjectGroupId": "kr.subject-group.example",
  "courseCategory": "common",
  "officialNameKorean": "공식 과목명",
  "gradeScope": null,
  "creditRuleRefs": ["kr.credit-rule.2022.example"],
  "sourceRefs": ["kr-ncic-2022-annex-example"],
  "verificationStatus": "official-source-checked",
  "sourceTextIncluded": false
}
```

- `gradeScope: null`은 누락이 아니라 국가 과목 정의가 특정 학년에 고정되지 않았음을 뜻할 수 있다.
- 실제 개설 학년·학기·반·교사는 `CourseOffering`에만 둔다.
- 과목명과 과목 범주를 식별자에 과도하게 넣지 않는다. 공식 코드가 있으면 코드 기반 안정 식별자를 우선한다.

## 4. 성취기준

`Domain`은 화면용 문자열이 아니라 과목에 속하는 독립 레코드다. 성취기준·세부 주제·클러스터의 `domainId`는 반드시 이 컬렉션의 노드를 참조한다.

```json
{
  "id": "kr.standard.2022.high.example-code",
  "courseId": "kr.course.2022.high.example",
  "code": "[공식코드]",
  "domainId": "kr.domain.2022.high.example",
  "summary": "저장소 작성 요약",
  "summaryKind": "mechanical-derivative",
  "sourceLocator": {
    "sourceId": "kr-ncic-2022-annex-example",
    "attachmentNo": "확인값",
    "sha256": "확인값",
    "pdfPage": 1,
    "printedPage": null,
    "section": "확인한 절",
    "code": "[공식코드]"
  },
  "verificationStatus": "official-source-checked",
  "officialTextIncluded": false
}
```

코드 패턴은 중학교와 고등학교의 실제 공식 코드 인벤토리에서 생성한다. 초등 전용 정규표현식을 복사하지 않는다.

## 5. 세부 학습 주제

```json
{
  "id": "kr.topic.2022.high.example.001",
  "schoolLevel": "high",
  "courseIds": ["kr.course.2022.high.example"],
  "domainId": "kr.domain.2022.high.example",
  "type": ["conceptual", "representational"],
  "labelKorean": "세부 학습 주제",
  "description": "무엇을 이해하거나 수행하는지 설명",
  "evidence": [
    "관찰 가능한 수행 기준"
  ],
  "assessmentPrompts": [
    "증거를 끌어내는 평가 질문"
  ],
  "contentKind": "mechanical-derivative",
  "decompositionKind": "subject-facet",
  "facetKey": "representation",
  "facetKeyDetail": "representation-modeling",
  "standardAlignments": [
    {
      "standardId": "kr.standard.2022.high.example-code",
      "alignmentKind": "supports",
      "confidence": "reviewed",
      "basis": "subject-workstream-v1"
    }
  ],
  "reviewStatus": "candidate"
}
```

중등에서는 하나의 주제가 여러 과목에서 재맥락화될 수 있다. 다만 과목별 의미가 달라지면 억지로 같은 노드를 공유하지 않고 `TransitionAlignment` 또는 `relatedTopic`으로 연결한다.

`facetKey`는 K-12 공통 계약의 공통 8종(`concept`, `procedure`, `representation`, `application`, `inquiry`, `communication`, `reflection`, `core`)이고, 중학교의 과목별 24종 원값은 `facetKeyDetail`에 보존한다. 주제 ID는 `facetKeyDetail`을 해시 입력으로 쓰므로 공통 어휘 도입이 ID를 바꾸지 않는다. 사상표와 근거는 `docs/decisions/2026-09-05-facet-mapping.md`, 통제 어휘는 `controlled-vocabularies.json`의 `facetKeys`·`facetKeyMappings`에 있다. 고등학교 주제는 성취기준과 1:1이라 `facetKey: core`만 갖는다.

중학교는 초등 학습지도의 과목별 분해 밀도와 맞춰 성취기준당 2~5개 주제 후보를 둔다. 기존 1:1 주제는 `decompositionKind: standard-core`, `facetKey: core`로 식별자를 보존하고, 추가 주제는 `subject-facet`과 과목별 facet key를 갖는다. 국어는 기준당 4개, 도덕은 5개, 기술·가정/정보는 2개, 나머지는 3개다. 모든 분해는 후보이며 `middle-subject-facet-decomposition-v1` 생성 근거를 보존한다. 고등학교는 별도 분해 정책을 만들기 전까지 성취기준당 하나의 기계적 후보만 유지한다.

### 5.1 주제 콘텐츠 오버레이

`evidence`·`assessmentPrompts`의 기계적 템플릿을 성취기준 해설 등 공식 출처를 근거로 새로 쓴 문장으로 바꾸는 **빌드 입력**이다(개선계획 P3-2).

- 경로: `data/kr/<level>/content/<courseSlug>.json` (`level`은 `middle` 또는 `high`). 예: `data/kr/middle/content/math.json`.
- `courseSlug`는 과목 라벨의 안전한 슬러그다. 규칙은 `scripts/lib/content-overlay.mjs`의 `courseSlug()` 하나뿐이며, 중학교 24과목과 고등학교 공통과목은 표로 고정하고(`수학`→`math`, `국어`→`korean`, `기술·가정`→`technology-home-economics` …), 표에 없는 라벨은 `course-<sha256 앞 12자리>`로 결정한다. 엔트리의 주제가 속한 과목의 슬러그와 파일 이름이 다르면 검증에서 실패한다.
- 파일 형식은 `schema/content-overlay.schema.json`. `entries` 키는 실제 주제 ID여야 하고(dangling 금지), 한 주제는 한 파일에서만 작성한다.
- 최소 길이: `evidence` 25자, `assessmentPrompts` 40자, `misconceptions` 15자. 성취기준 `summary`를 통째로 포함한 문장은 금지한다(원문 대량 재수록 방지). 파일 안의 완전 중복 문장도 금지한다.
- 빈 오버레이(엔트리 0건) 파일은 두지 않는다. 디렉터리가 없으면 오버레이 0건으로 동작한다.

```json
{
  "$schema": "../../../../schema/content-overlay.schema.json",
  "contentKind": "source-grounded-draft",
  "subjectKorean": "수학",
  "authoredAt": "2026-09-05",
  "sourceRefs": ["kr-moe-2022-33-annex8"],
  "entries": {
    "kr.topic.2022.middle.0180f61b656c5de360d0": {
      "evidence": ["관찰 가능한 수행 증거 1", "관찰 가능한 수행 증거 2"],
      "assessmentPrompts": ["증거를 끌어내는 평가 질문"],
      "misconceptions": ["자주 나타나는 오답 유형"],
      "sourceLocator": { "sourceId": "kr-moe-2022-33-annex8", "printedPage": 23, "section": "성취기준 해설" }
    }
  }
}
```

병합 지점은 `scripts/build-curriculum-data.mjs`의 `buildProfile()` 안, 주제 생성 루프 뒤다. 오버레이가 있으면 해당 주제의 `evidence`·`assessmentPrompts`를 교체하고 `contentKind: "source-grounded-draft"`, `misconceptions`, `contentSourceLocator`를 기록한다. 없으면 템플릿을 그대로 두고 `contentKind: "mechanical-derivative"`만 남긴다. 모든 주제는 두 값 중 하나를 반드시 갖는다.

`bun run validate`는 스키마·출처 참조·dangling·원문 복사·중복과 함께 "오버레이가 빌드 산출물에 반영되었는지"까지 본다. 오버레이를 고친 뒤에는 `bun run build:data && bun run build`를 다시 돌려야 한다. `dist/<level>/manifest.json`은 오버레이 파일과 `schema/content-overlay.schema.json`의 해시를 핀한다. UI는 `source-grounded-draft` 주제에 ‘검토 초안’ 배지를 붙인다.

콘텐츠 작성자용 단일 파일 게이트:

```bash
bun scripts/dev/check-content-overlay.mjs data/kr/middle/content/math.json
bun scripts/dev/check-content-overlay.mjs 초안.json --profile middle   # content 디렉터리 밖의 초안
```

## 6. 학습 관계 주장

```json
{
  "id": "lr-sha256-prefix",
  "dependentTopicId": "kr.topic.2022.high.example.002",
  "prerequisiteTopicId": "kr.topic.2022.middle.example.001",
  "relationKind": "recommended-before",
  "scope": "cross-school-level",
  "strength": "recommended",
  "reason": "권장 이유",
  "applicability": {
    "schoolLevels": ["middle", "high"],
    "courseIds": ["kr.course.2022.high.example"]
  },
  "basisKind": "expert-review",
  "basis": "review-batch-id",
  "sourceRefs": ["source-or-review-id"],
  "reviewStatus": "subject-expert-reviewed"
}
```

간선의 결정적 식별자는 양 끝점만이 아니라 관계 종류·적용 범위·근거·출처를 포함한 정규 튜플로 만든다.

### 6.1 관계 2층

| 층 | 파일 | `layer` | `relationKind` | `basisKind` | `reviewStatus` |
| --- | --- | --- | --- | --- | --- |
| 공식 | `learning-relations.json`, `bridges/elementary-transitions.json` | `official` | `required-prerequisite` | `official-source`만 | `internal-reviewed` 이상 |
| 교육적 후보 | `learning-relations.candidate.json`, `bridges/elementary-transitions.candidate.json` | `pedagogical-candidate` | `recommended-before` | `official-code-order`, `decomposition-order`, `repository-authored` | `candidate` |

official 파일에 `layer != official`, `basisKind != official-source`, `relationKind != required-prerequisite`, 인쇄 쪽번호 없는 `basis`가 있으면 스키마 또는 `scripts/validate.mjs`가 거부한다. 후보 파일에 `official-source`를 넣어도 거부한다. 두 층 각각이 DAG여야 하고 합집합도 DAG여야 하며, 같은 (선수, 후속) 쌍이 두 층에 동시에 있으면 실패한다.

후보 층 생성 규칙은 아래 세 가지뿐이며 각 레코드의 `basis`가 규칙 ID로 시작한다.

- `R-CODE` (`official-code-order`): 같은 과목·같은 영역에서 공식 성취기준 코드가 인접한 두 기준의 핵심 주제 사이.
- `R-FACET` (`decomposition-order`): 한 성취기준의 핵심 주제 → 같은 성취기준의 각 `subject-facet` 주제 (중학교 전용).
- `R-DOMAIN-CONTINUITY` (`repository-authored`, 초→중 bridge 전용): 내용 체계표가 초등 5~6학년군 영역과 중학교 영역을 같은 영역 계열로 제시할 때, 그 초등 영역 성취기준의 대표 주제 → 그 중학교 영역 성취기준의 `standard-core` 주제. 영역 대응표는 `scripts/lib/bridge-domain-map.mjs`에 교과별로 명시하며 대응이 불명확한 교과는 비워 둔다.

영역은 병렬 갈래이므로 영역 사이 순서(`R-DOMAIN-FIRST`)는 만들지 않는다. 과목 간·교과 간 후보도 만들지 않으며 과목 수준 연계는 official `course-relations.json`이 담당한다. 고등학교 후보는 `programScopes`에 `all-high-schools`가 있는 과목만 대상으로 하고 직업계 전문교과는 제외한다.

코드 배열 순서만으로 필수 선수 관계를 만들지 않는다. 필수 관계는 공식 출처·페이지와 `official-source` basis가 있는 경우에만 official 층으로 추가한다.

## 7. 과목 관계와 선택 묶음

```json
{
  "id": "cr-sha256-prefix",
  "fromCourseId": "kr.course.2022.high.example-a",
  "toCourseId": "kr.course.2022.high.example-b",
  "relationKind": "prepares-for",
  "claimStatus": "reviewed-recommendation",
  "reason": "연결 이유",
  "basisKind": "expert-review",
  "basis": "review-batch-id",
  "sourceRefs": ["review-id"],
  "reviewStatus": "subject-expert-reviewed"
}
```

```json
{
  "id": "kr.choice-set.2022.example",
  "choiceKind": "choose-at-least",
  "minimumSelections": 1,
  "maximumSelections": null,
  "courseIds": [
    "kr.course.2022.high.example-a",
    "kr.course.2022.high.example-b"
  ],
  "ruleBasis": "official-curriculum-or-local-policy",
  "sourceRefs": ["source-id"]
}
```

공식 선택 규칙과 지도 서비스가 제안하는 비교 묶음은 `ruleBasis`와 별도 클래스/상태로 구분한다.

## 8. 경로

```json
{
  "id": "kr.pathway.example",
  "pathwayKind": "illustrative",
  "audience": "student",
  "goalLabelKorean": "탐색 목적",
  "steps": [
    {
      "order": 1,
      "stepKind": "foundation",
      "courseIds": ["kr.course.2022.high.example-a"],
      "choiceSetId": null,
      "reason": "포함 이유"
    }
  ],
  "notOfficialRequirement": true,
  "reviewStatus": "candidate"
}
```

경로는 `official-constraint`, `reviewed-recommendation`, `illustrative`를 구분한다. 기본 사용자 경로는 `illustrative`이며 공식 이수 요건처럼 보이지 않게 한다.

## 9. 로컬 개설 정보

```json
{
  "id": "kr.offering.school-year-semester-course",
  "courseId": "kr.course.2022.high.example",
  "schoolId": "external-or-pseudonymous-id",
  "academicYear": 2026,
  "semester": 1,
  "status": "planned",
  "sourceRefs": ["local-source-id"]
}
```

로컬 개설 정보는 선택 모듈이다. 국가 교육과정 ABox에 합치지 않고 별도 그래프로 조인한다. 개인 학생의 수강·성적 데이터는 이 프로젝트 범위 밖이다.

## 10. 식별자 정책

- 기존 초등 ID와 IRI는 변경하지 않는다.
- 표시 이름·학년·학기·배열 위치를 안정 ID의 근거로 사용하지 않는다.
- 공식 과목·성취기준 코드가 있으면 이를 포함한 복합 키를 사용한다.
- n-ary 주장에는 SHA-256 기반 결정적 ID를 사용하며 정규화 알고리즘을 버전 관리한다.
- 삭제·통합·이름 변경은 tombstone과 replacement mapping으로 처리한다.
- 개인 정보, 로컬 파일 경로, 서명 URL, 원문 문장을 IRI에 넣지 않는다.
- **레코드가 어느 릴리스 파일에 있느냐는 ID에 영향을 주지 않는다.** 파일 배치는 배포 결정이고 ID는 의미 결정이다. 고등학교 레코드는 한 번의 빌드로 `high` 네임스페이스에서 발급한 뒤 일반·직업계 두 릴리스로 나누므로, 분리 후에도 두 릴리스의 ID가 모두 `kr.*.2022.high.*` 네임스페이스를 유지한다. 샤딩도 마찬가지로 ID를 바꾸지 않는다.
