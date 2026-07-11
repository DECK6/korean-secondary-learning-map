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
    review-records.json
    coverage-gaps.json
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
    course-relations.json
    credit-rules.json
    choice-sets.json
    pathways.json
    review-records.json
    coverage-gaps.json
  bridges/
    release.json
    transition-alignments.json
    review-records.json
  local-offerings/          # 선택 확장; 세 국가 수준 릴리스와 분리
```

교과별 작성 작업은 `workstreams/<school-level>/<subject-group>.json`에서 수행한다. 중학교·고등학교·bridge 빌더는 각각 독립 manifest를 생성하며, 통합 bundle manifest는 세 릴리스의 해시만 조합한다.

스키마도 `core`, `middle-profile`, `high-profile`, `bridge-profile`로 나눈다. 고등학교의 학점·선택 제약을 중학교 레코드에 요구하지 않는다.

## 2. 공통 필드

모든 권위 레코드는 다음 필드를 갖는다.

```json
{
  "id": "stable-id",
  "releaseId": "kr-2022-secondary-v0.2.0-candidate",
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
  "id": "kr-2022-middle-high-bridge-v0.2.0-candidate",
  "middleReleaseId": "kr-2022-middle-v0.2.0-candidate",
  "highReleaseId": "kr-2022-high-v0.2.0-candidate",
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

현재 릴리스의 주제는 성취기준에서 기계적으로 파생된 1차 후보이며 `alignmentKind`와 생성 `basis`를 보존한다. 주제 수가 성취기준 수와 같다는 사실은 교과 전문가가 원자적 학습 단위를 확정했다는 뜻이 아니다.

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

코드 배열 순서만으로 선수 관계를 만들지 않는다. 현재 자동 생성 주제 관계는 0건이며, 공식 출처 또는 식별 가능한 전문가 검토가 있는 관계만 이 계약으로 추가한다.

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
