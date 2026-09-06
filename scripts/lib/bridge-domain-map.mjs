// R-DOMAIN-CONTINUITY: elementary 5~6 grade band domain -> middle school domain correspondence.
// Pure data. Every entry must be backed by one of two grounds, recorded in `evidenceKind`:
//   'same-content-system-domain'        the annex content system table carries the same 영역 name in the
//                                       elementary 5~6 column and the middle 1~3 column (the two labels
//                                       differ only by the middle-dot codepoint used in each repository)
//   'review-documented-correspondence'  the annex states the correspondence in prose, or the subject
//                                       review document records which content system 영역 each middle
//                                       achievement-standard unit belongs to
// `printedPage` is the printed page of the annex content system table that carries the correspondence.
// Subjects whose correspondence is not established stay in `unmapped` and produce no candidate bridge.
export default {
  ruleId: 'R-DOMAIN-CONTINUITY',
  subjects: [
    {
      elementarySubject: '국어',
      middleCourse: '국어',
      annexId: 'kr-moe-2022-33-annex5',
      evidenceKind: 'same-content-system-domain',
      domains: [
        { elementaryDomain: '듣기·말하기', middleDomains: ['듣기⋅말하기'], printedPage: 7 },
        { elementaryDomain: '읽기', middleDomains: ['읽기'], printedPage: 8 },
        { elementaryDomain: '쓰기', middleDomains: ['쓰기'], printedPage: 9 },
        { elementaryDomain: '문법', middleDomains: ['문법'], printedPage: 10 },
        { elementaryDomain: '문학', middleDomains: ['문학'], printedPage: 11 },
        { elementaryDomain: '매체', middleDomains: ['매체'], printedPage: 12 },
      ],
    },
    {
      elementarySubject: '수학',
      middleCourse: '수학',
      annexId: 'kr-moe-2022-33-annex8',
      evidenceKind: 'same-content-system-domain',
      domains: [
        { elementaryDomain: '수와 연산', middleDomains: ['수와 연산'], printedPage: 7 },
        { elementaryDomain: '변화와 관계', middleDomains: ['변화와 관계'], printedPage: 8 },
        { elementaryDomain: '도형과 측정', middleDomains: ['도형과 측정'], printedPage: 9 },
        { elementaryDomain: '자료와 가능성', middleDomains: ['자료와 가능성'], printedPage: 10 },
      ],
    },
    {
      elementarySubject: '영어',
      middleCourse: '영어',
      annexId: 'kr-nec-2024-3-annex14',
      evidenceKind: 'same-content-system-domain',
      domains: [
        { elementaryDomain: '이해', middleDomains: ['이해'], printedPage: 7 },
        { elementaryDomain: '표현', middleDomains: ['표현'], printedPage: 9 },
      ],
    },
    {
      elementarySubject: '도덕',
      middleCourse: '도덕',
      annexId: 'kr-moe-2022-33-annex6',
      evidenceKind: 'same-content-system-domain',
      domains: [
        { elementaryDomain: '자신과의 관계', middleDomains: ['자신과의 관계'], printedPage: 7 },
        { elementaryDomain: '타인과의 관계', middleDomains: ['타인과의 관계'], printedPage: 8 },
        { elementaryDomain: '사회·공동체와의 관계', middleDomains: ['사회⋅공동체와의 관계'], printedPage: 9 },
        { elementaryDomain: '자연과의 관계', middleDomains: ['자연과의 관계'], printedPage: 10 },
      ],
    },
    {
      elementarySubject: '미술',
      middleCourse: '미술',
      annexId: 'kr-moe-2022-33-annex13',
      evidenceKind: 'same-content-system-domain',
      domains: [
        { elementaryDomain: '미적 체험', middleDomains: ['미적 체험'], printedPage: 6 },
        { elementaryDomain: '표현', middleDomains: ['표현'], printedPage: 7 },
        { elementaryDomain: '감상', middleDomains: ['감상'], printedPage: 7 },
      ],
    },
    {
      elementarySubject: '음악',
      middleCourse: '음악',
      annexId: 'kr-nec-2024-3-annex12',
      evidenceKind: 'same-content-system-domain',
      domains: [
        { elementaryDomain: '연주', middleDomains: ['연주'], printedPage: 8 },
        { elementaryDomain: '감상', middleDomains: ['감상'], printedPage: 8 },
        { elementaryDomain: '창작', middleDomains: ['창작'], printedPage: 9 },
      ],
    },
    {
      elementarySubject: '체육',
      middleCourse: '체육',
      annexId: 'kr-moe-2022-33-annex11',
      evidenceKind: 'same-content-system-domain',
      domains: [
        { elementaryDomain: '운동', middleDomains: ['운동'], printedPage: 7 },
        { elementaryDomain: '스포츠', middleDomains: ['스포츠'], printedPage: 8 },
        { elementaryDomain: '표현', middleDomains: ['표현'], printedPage: 9 },
      ],
    },
    {
      // The middle 과학 domains are the achievement-standard units, not the five content system 영역.
      // The annex content system table assigns each unit's 중학교 내용 요소 to one 영역, and the subject
      // review document records that assignment for the official bridge tuples of the same annex.
      elementarySubject: '과학',
      middleCourse: '과학',
      annexId: 'kr-nec-2024-3-annex9',
      evidenceKind: 'review-documented-correspondence',
      domains: [
        { elementaryDomain: '운동과 에너지', middleDomains: ['힘의 작용', '운동과 에너지', '전기와 자기', '열', '빛과 파동'], printedPage: 6 },
        { elementaryDomain: '물질', middleDomains: ['기체의 성질', '물질의 상태 변화', '물질의 특성', '물질의 구성', '화학 반응의 규칙성'], printedPage: 8 },
        { elementaryDomain: '생명', middleDomains: ['생물의 구성과 다양성', '식물과 에너지', '동물과 에너지', '자극과 반응', '생식과 유전'], printedPage: 9 },
        { elementaryDomain: '지구와 우주', middleDomains: ['지권의 변화', '수권과 해수의 순환', '날씨와 기후변화', '태양계', '별과 우주'], printedPage: 10 },
        { elementaryDomain: '과학과 사회', middleDomains: ['과학과 인류의 지속가능한 삶', '재해⋅재난과 안전', '과학과 나의 미래'], printedPage: 11 },
      ],
    },
    {
      elementarySubject: '실과(기술·가정)/정보',
      middleCourse: '기술·가정',
      annexId: 'kr-moe-2022-33-annex10',
      evidenceKind: 'same-content-system-domain',
      domains: [
        { elementaryDomain: '인간 발달과 주도적 삶', middleDomains: ['인간 발달과 주도적 삶'], printedPage: 7 },
        { elementaryDomain: '생활환경과 지속가능한 선택', middleDomains: ['생활환경과 지속가능한 선택'], printedPage: 8 },
        { elementaryDomain: '기술적 문제해결과 혁신', middleDomains: ['기술적 문제해결과 혁신'], printedPage: 9 },
        { elementaryDomain: '지속가능한 기술과 융합', middleDomains: ['지속가능한 기술과 융합'], printedPage: 10 },
      ],
    },
    {
      // 별책10 p.11 marks the elementary 디지털 사회와 인공지능 area as the 정보 education block that is
      // linked to the middle 정보 subject, and p.148 repeats the link in the 정보 subject description.
      // The 정보 content system table has no elementary column, so the whole subject is the counterpart.
      elementarySubject: '실과(기술·가정)/정보',
      middleCourse: '정보',
      annexId: 'kr-moe-2022-33-annex10',
      evidenceKind: 'review-documented-correspondence',
      domains: [
        {
          elementaryDomain: '디지털 사회와 인공지능',
          middleDomains: ['컴퓨팅 시스템', '데이터', '알고리즘과 프로그래밍', '인공지능', '디지털 문화'],
          printedPage: 11,
        },
      ],
    },
  ],
  unmapped: [
    {
      middleCourses: ['사회', '역사'],
      reason: '별책7의 내용 체계 영역은 지리 인식·자연환경과 인간생활·인문환경과 인간생활·지속가능한 세계·정치·법·경제·사회⋅문화·역사 일반 9종이지만, 두 저장소의 domain은 초등·중등 모두 단원명이다. 단원명에서 영역으로 가는 대응표가 아직 두 저장소 어디에도 없어 추측 없이 규칙을 적용할 수 없다.',
    },
    {
      middleCourses: ['보건', '진로와 직업', '한문', '환경', '생활 독일어', '생활 러시아어', '생활 베트남어', '생활 스페인어', '생활 아랍어', '생활 일본어', '생활 중국어', '생활 프랑스어'],
      reason: '초등학교에 대응 교과가 없다. 중학교 선택 교과이거나 초등 교육과정에 같은 영역 계열이 존재하지 않는다.',
    },
    {
      middleCourses: [],
      elementarySubjects: ['통합교과'],
      reason: '통합교과(바른 생활·슬기로운 생활·즐거운 생활)는 1~2학년군 전용이라 5~6학년군 규칙의 출발점이 될 수 없다.',
    },
  ],
};
