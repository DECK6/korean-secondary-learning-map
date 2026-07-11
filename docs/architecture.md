# 중등교육 학습지도 아키텍처

## 1. 설계 목표

중등교육 지도는 단순한 `7학년→8학년→9학년→10학년→11학년→12학년` 선형 그래프가 아니다. 중학교에서는 공통 기반과 선택 활동이 함께 나타나고, 고등학교에서는 과목 선택·학점·진로·학교별 개설 조건 때문에 여러 경로가 갈라진다.

따라서 이 프로젝트의 중심 질문은 “다음 학년에 무엇을 배우는가?”가 아니라 다음 네 가지다.

- 지금 보는 개념은 어느 학교급·교과군·과목·영역·성취기준에 속하는가?
- 이 주제를 이해하는 데 어떤 선행 학습이 도움이 되며, 그 주장은 누구의 어떤 근거를 갖는가?
- 중학교의 학습이 어떤 고등학교 공통·선택 과목으로 이어지는가?
- 과목 선택 결과가 여러 학습·진로 경로에서 어떤 기회를 열어 주는가?

## 2. 기존 초등 모델에서 유지할 것

기존 초등 온톨로지의 아래 계약은 학교급과 무관하므로 K–12 코어로 유지한다.

- `DatasetRelease`, `Curriculum`, `Subject`, `GradeBand`, `LearningDomain`
- `AchievementStandard`, `LearningTopic`, `LearningCluster`
- `EvidenceCriterion`, `AssessmentPrompt`
- `PrerequisiteAssertion`, `StandardTopicAlignment`
- `SourceDocument`, `SourceLocator`, `VerificationRecord`, `CoverageGap`
- `directRequires`는 탐색용 투영이고 한정자를 가진 주장은 `PrerequisiteAssertion`이 권위 레코드라는 원칙
- 공식 문구·공식 승인·권리 허가·모델 추천을 서로 다른 상태로 관리하는 원칙
- 결정적 빌드, SHACL 검증, SPARQL 역량 질문, 적대 fixture, 릴리스 manifest

초등 저장소의 현재 온톨로지 IRI `https://dexa.art/learnmap/ontology`와 기존 인스턴스 식별자는 변경하지 않는다.

## 3. 중등 확장에 필요한 새 개념

| 개념 | 역할 | 중요한 경계 |
| --- | --- | --- |
| `SchoolLevel` | middle/high 구분 | 학년 숫자만으로 학교급을 추정하지 않음 |
| `ProgramType` | 일반·전문 등 교육과정 적용 범위 | 실제 학교 유형과 국가 수준 프로그램 범위를 혼동하지 않음 |
| `SubjectGroup` | 국어·수학·사회·과학 등 교과군 | 개별 과목과 구분 |
| `Course` | 중학교 교과 또는 고등학교 과목 | 고등학교 그래프의 중심 노드 |
| `CourseCategory` | 공통, 일반 선택, 진로 선택, 융합 선택, 전문 공통, 전공 일반, 전공 실무 등 | 값은 공식 인벤토리에서 확정 |
| `CreditRule` | 졸업·교과군·과목 범주의 이수 조건 | 과목 자체의 속성과 분리하고 시행 버전을 기록 |
| `ChoiceSet` | 여러 과목 중 선택하는 묶음 | “모두 이수”와 “하나 이상 선택”을 구분 |
| `CourseOffering` | 특정 학교·학기의 실제 개설 정보 | 국가 교육과정의 `Course`와 별도 데이터셋으로 유지 |
| `CourseRelation` | 과목 간 권장 순서·연계·대체·병행 관계 | 공식 필수조건인지 저장소 후보인지 표시 |
| `TransitionAlignment` | 초→중, 중→고의 개념·주제 연결 | 동일성, 확장, 준비 관계를 구분 |
| `IllustrativePathway` | 목적에 따른 탐색 경로 | 공식 교육과정 사실이 아니라 설명 가능한 추천 산출물 |
| `PathwayStep` | 경로의 필수·선택·대안 단계 | 순서와 선택 조건, 이유를 보존 |

## 4. 5계층 모델

```text
정책 계층
CurriculumFramework ─ SchoolLevel ─ ProgramType ─ CreditRule
        │
교육과정 계층
SubjectGroup ─ Subject ─ Course ─ LearningDomain ─ AchievementStandard
        │
학습 계층
LearningCluster ─ LearningTopic ─ EvidenceCriterion / AssessmentPrompt
        │
관계 계층
LearningRelation / CourseRelation / TransitionAlignment
ChoiceSet / IllustrativePathway / PathwayStep
        │
증거 계층
SourceDocument ─ SourceLocator ─ VerificationRecord ─ ReviewRecord
```

각 하위 계층의 레코드는 자신이 속한 릴리스와 상위 노드의 안정 식별자를 반드시 참조한다. 화면용 단순 간선은 탐색 편의를 위한 투영일 뿐, 근거가 필요한 주장의 원본이 아니다.

## 5. 학교급별 조직 원칙

### 5.0 분리 수준 결정

중학교와 고등학교는 **의미 코어는 공유하고 데이터 제품은 분리**한다.

| 구분 | 공유/분리 | 이유 |
| --- | --- | --- |
| OWL/RDFS/SKOS 핵심 어휘 | 공유 | 같은 개념의 중복 정의와 IRI 분기를 방지 |
| 출처·검증·권리 모델 | 공유 | 공식 코드 확인과 권리 HOLD를 같은 방식으로 관리 |
| 중학교 ABox·JSON·manifest | 분리 | 학년군·공통 기반 중심으로 독립 검수 |
| 고등학교 ABox·JSON·manifest | 분리 | 과목 범주·학점·선택·프로그램 범위를 독립 검수 |
| SHACL 프로필 | 코어+학교급별 분리 | 중학교에 고등학교 학점 제약을 강제하지 않음 |
| 중→고 전이 관계 | 별도 bridge 릴리스 | 양쪽 버전을 명시하고 독립 교체 가능 |
| 사용자 탐색 화면 | 공유 | 한 서비스에서 학교급 전이와 과목 선택을 연속 탐색 |

초기 물리 구조는 하나의 저장소/모노레포를 권장한다. 두 저장소로 즉시 분리하면 공통 어휘·빌더·검증기가 복제되고 전이 간선 변경에 양쪽 동시 릴리스가 필요해진다. 반대로 하나의 거대한 ABox로 합치면 고등학교 전용 제약이 중학교 레코드까지 오염시키고 부분 릴리스가 어려워진다.

권장 배포 단위는 다음과 같다.

```text
middle release ─┐
                ├─ secondary bundle / unified explorer
high release ───┤
                │
transition bridge release
```

bridge manifest는 사용한 `middleReleaseId`와 `highReleaseId`를 반드시 고정한다. 한쪽 데이터만 갱신되면 bridge를 자동 승격하지 않고 재검토 대기 상태로 둔다.

### 5.1 중학교

- 기본 탐색 축은 `교과군 → 교과/과목 → 영역 → 성취기준 → 세부 주제`다.
- 공식 성취기준이 학년군 단위이면 임의로 특정 학년에 고정하지 않는다.
- 학교 현장의 편성 순서는 `localSequence` 확장 데이터로만 표현한다.
- 선택 교과와 자유학기 활동은 공통 교과와 같은 의미로 합치지 않는다.
- 중학교 주제에서 고등학교 과목으로 이어지는 관계는 `TransitionAlignment`로 기록한다.

### 5.2 고등학교

- 기본 탐색 축은 `교과군 → 과목 범주 → 과목 → 영역 → 성취기준 → 세부 주제`다.
- `grade`와 `semester`는 국가 과목 정의의 필수값이 아니다. 실제 학년·학기는 학교 편성 데이터가 제공할 때만 표시한다.
- 공통 과목과 선택 과목을 구분하고 선택 과목 안에서도 공식 범주를 보존한다.
- 과목 간 관계는 `필수 선수`, `권장 선행`, `병행 권장`, `내용 확장`, `대안`, `진로 준비`를 구분한다.
- 고교학점제 규칙은 시행 버전을 가진 `CreditRule`로 관리하며 과목 그래프와 분리한다.
- 특정 학교가 개설하지 않은 과목을 “수강 가능”으로 표시하지 않는다. 국가 수준에서는 “교육과정에 정의됨”까지만 주장한다.

## 6. 관계 의미론

### 6.1 학습 주제 관계

`LearningRelation`은 한정자를 가진 선수 관계 주장으로 아래 필드를 사용한다.

- `relationKind`: `required-prerequisite` 또는 `recommended-before`
- `scope`: 동일 과목, 동일 교과군, 교과 간, 학교급 전이
- `applicability`: 적용되는 학교급·과목·경로·학습 맥락
- `basisKind`: 공식 문서, 전문가 검토, 저장소 편집, 모델 후보
- `reviewStatus`: 후보, 내부 검토, 교과 전문가 검토, 현장 검토
- `confidence`: 수치가 아니라 등급과 근거 메모를 함께 사용

모델이 자동 생성한 관계는 `candidate`이며 사람의 검토 없이 `required`가 될 수 없다.

코드 배열 순서는 교육적 선수 관계의 근거가 아니므로 자동 간선을 만들지 않는다. v0.2 후보의 `LearningRelation`은 0건이며, 공식 근거나 식별 가능한 전문가 검토가 있는 주장만 추가한다.

### 6.2 과목 관계

`CourseRelation`의 관계 종류는 다음과 같다.

- `official-prerequisite`: 공식 규정에서 요구되는 경우에만 사용
- `recommended-before`: 교육적으로 먼저 배우기를 권장
- `co-recommended`: 함께 또는 인접 시기에 배우기를 권장
- `extends`: 다른 과목 내용을 심화·확장
- `alternative-to`: 같은 선택 묶음 안의 대안
- `prepares-for`: 특정 후속 과목·학습 분야 준비

`prepares-for`는 대학 입학 보장이나 진로 적합성 판정이 아니다.

### 6.3 학교급 전이

`TransitionAlignment`는 세 가지 의미를 분리한다.

- `continues`: 같은 개념 계열이 다음 학교급에서 계속됨
- `deepens`: 이전 개념을 더 형식적·복합적으로 심화함
- `prepares-for`: 이후 과목을 위한 배경을 형성함

`sameAs`는 실제 동일 개념임이 검토된 경우에만 사용하며, 대개의 학교급 전이는 동일성이 아니라 심화 관계로 본다.

## 7. K–12 코어와 저장소 경계

권장 구조는 세 부분이다.

```text
korean-k12-learning-ontology
  공통 TBox, 통제 어휘, JSON-LD context, SHACL, URI/거버넌스

korean-elementary-learning-map
  초등 데이터 프로필과 ABox

korean-secondary-learning-map
  중학교·고등학교 독립 데이터 프로필, 전이 bridge, 중등 확장 TBox와 통합 UI
```

첫 구현 단계에서 기존 초등 릴리스를 이동시키지 않는다. 먼저 새 코어가 기존 P3 의미와 식별자를 바이트·그래프 수준에서 보존하는지 검증한 뒤 권위 저장소를 이전한다. 마이그레이션 전까지 중등 프로젝트는 기존 TBox를 참조하고 중등 전용 용어를 별도 초안으로 관리한다.

중등 저장소 내부 권장 구조는 다음과 같다.

```text
profiles/middle/       중학교 schema·workstream·검증 규칙
profiles/high/         고등학교 schema·workstream·검증 규칙
profiles/bridges/      중→고 전이 schema·검토 규칙
data/kr/middle/        중학교 권위 입력과 생성 산출물
data/kr/high/          고등학교 권위 입력과 생성 산출물
data/kr/bridges/       버전 고정 전이 주장
dist/middle/           중학교 JSON-LD·Turtle·manifest
dist/high/             고등학교 JSON-LD·Turtle·manifest
dist/bridges/          전이 JSON-LD·Turtle·manifest
apps/explorer/         세 릴리스를 결합하는 통합 탐색 UI
```

## 8. 탐색 화면 설계

### 8.1 다중 해상도

| 레벨 | 화면에 보이는 단위 | 주 사용 질문 |
| ---: | --- | --- |
| L0 | 중학교 / 고등학교 / 전이 | 어디에서 탐색할까? |
| L1 | 교과군 | 어떤 분야인가? |
| L2 | 과목과 선택 범주 | 무엇을 선택하거나 이수하는가? |
| L3 | 영역과 학습 클러스터 | 과목 안에서 무엇을 배우는가? |
| L4 | 세부 학습 주제와 직접 관계 | 어떤 개념·기능이 연결되는가? |
| L5 | 성취기준·증거·평가·출처 | 왜 이 연결을 믿을 수 있는가? |

전체 세부 주제를 첫 화면에 동시에 렌더링하지 않는다. L2 또는 L3 집계 그래프를 먼저 보여 주고 선택한 하위 그래프만 지연 로딩한다.

### 8.2 핵심 화면

- `학교급 지도`: 중학교 공통 기반과 고등학교 선택 구조 비교
- `과목 탐색기`: 과목 범주·교과군·학습 영역·성취기준 탐색
- `전이 지도`: 초등 5~6학년 → 중학교 → 고등학교 과목 연결
- `경로 설계기`: 목적을 고르면 필수·권장·대안 과목과 근거를 비교
- `과목 비교`: 두 과목의 공통 주제, 차이, 선행 추천, 후속 연결 비교
- `근거 패널`: 출처, 위치, 검토 상태, 권리 상태, 모델 한계 표시

### 8.3 사용자 모드

- 학생: 과목이 무엇을 열어 주는지와 선택 대안을 쉬운 언어로 표시
- 학부모: 학교급 전이, 과목 선택 구조, 근거와 주의점을 중심으로 표시
- 교사: 성취기준, 세부 주제, 평가 증거, 관계 검토 상태를 자세히 표시

세 모드는 같은 그래프를 사용하고 표현 밀도만 바꾼다.

## 9. 금지 규칙

- 성취기준 코드를 확인하지 않은 채 공식 앵커로 공개하지 않는다.
- 공식 원문을 권리 확인 없이 대량 재수록하지 않는다.
- 학년군 성취기준을 저장소 편의상 개별 학년으로 단정하지 않는다.
- 교육과정에 존재하는 과목을 특정 학교가 개설한다고 추론하지 않는다.
- 추천 경로를 공식 이수 규정이나 대학 입학 요건으로 표현하지 않는다.
- 모델 생성 관계를 전문가 검토 관계와 같은 색·상태로 표시하지 않는다.
- 개인 성적·진단 결과를 온톨로지 ABox에 저장하지 않는다.
- 세부 주제 수를 맞추기 위한 패딩 노드나 근거 없는 간선을 만들지 않는다.

## 10. 공식 설계 근거

- NCIC의 2022 개정 교육과정 고시 안내는 중학교 교육과정, 고등학교 교육과정, 교과별 교육과정, 중학교 선택 교과, 고등학교 교양·계열 선택·전문 교과를 서로 다른 별책으로 제공한다: https://ncic.re.kr/board/B0031.cs?act=read&bwrId=1271&pageIndex=1&pageUnit=15
- 같은 고시는 2025년 중1·고1, 2026년 중2·고2, 2027년 중3·고3 순으로 적용 일정을 제시한다.
- 교육부 고교학점제 자료는 총 이수학점과 과목 선택을 별도 정책 규칙으로 다뤄야 함을 보여 준다: https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=88188&lev=0&m=020404&opType=N&s=moe&statusYN=W
- 학교생활기록부 종합지원포털은 2022 개정 선택 과목을 일반·진로·융합 선택으로, 전문 교과를 전문 공통·전공 일반·전공 실무로 구분한다: https://star.moe.go.kr/web/contents/m30103.do?id=106233&schM=view

접근일: 2026-07-11. 자료별 저작권·공공누리 조건은 실제 원문 인벤토리 단계에서 문서 단위로 다시 기록한다.
