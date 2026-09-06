// 사회·역사 단원 → 내용 체계 영역 대응표.
//
// 두 저장소의 사회·역사 `domainKorean`은 내용 체계표의 영역이 아니라 성취기준 단원명이라
// (초등 '지구, 대륙 그리고 국가들', 중학교 '아시아'), 다른 교과처럼 영역 이름을 맞대어
// R-DOMAIN-CONTINUITY 후보 bridge를 만들 수 없었다. 이 표가 그 빠진 층을 채운다.
//
// 근거는 두 저장소의 검토 문서이며, 두 문서 모두 별책7(국가교육위원회 고시 제2024-3호,
// 첨부 10003993) 내용 체계표의 **인쇄 쪽수**로 영역을 지목한다.
//   - 중학교: `docs/reviews/2026-07-17-social-history-official-relations-review.md`
//     '초등→중등 내용 체계 관계' 55건이 각 중학교 성취기준을 인쇄 쪽수(=영역)와 함께 적는다.
//   - 초등: `korean-elementary-learning-map/docs/reviews/2026-09-05-social-official-relations-review.md`
//     '내용 체계표에서 읽은 갈래별 초등 내용 요소' 표가 영역·갈래·인쇄 쪽수를 적는다.
//   - 한국사(인쇄 p.18)는 내용 체계표의 갈래 이름이 곧 중학교 단원명이라 표에서 직접 읽힌다.
//
// 근거 쪽수가 없는 단원은 넣지 않는다. 그래서 중학교 '남부 지역'(초등 대응 요소 없음),
// '시장과 가격'(경제 > 시장 경제 갈래는 두 열 모두 비어 있음), '인간과 사회생활'(사회⋅문화 >
// 사회생활 갈래도 두 열 모두 비어 있음)과 별책7 내용 체계표에 등장하지 않는 세계사 단원
// (세계 종교의 확산과 지역 문화의 발전, 지역 세계의 교류와 변화, 제국주의와 국민 국가 건설
// 운동, 세계 대전과 사회 변동, 현대 세계의 전개와 과제)은 빠져 있다.

export const annexId = 'kr-nec-2024-3-annex7';

/** 별책7 내용 체계표에서 각 영역이 시작하는 인쇄 쪽수. */
export const areaPrintedPages = {
  '지리 인식': 8,
  '자연환경과 인간생활': 9,
  '인문환경과 인간생활': 10,
  '지속가능한 세계': 11,
  정치: 12,
  법: 13,
  경제: 14,
  '사회⋅문화': 15,
  '역사 일반': 16,
  지역사: 17,
  한국사: 18,
};

/** 초등 5~6학년군 사회 단원(`domainKorean`) → 내용 체계 영역. */
export const elementaryUnitAreas = [
  { unit: '우리나라 국토 여행', areas: ['지리 인식', '자연환경과 인간생활'] },
  { unit: '우리나라 지리 탐구', areas: ['자연환경과 인간생활', '인문환경과 인간생활', '지속가능한 세계'] },
  { unit: '법과 인권의 보장', areas: ['법'] },
  { unit: '유적과 유물로 살펴본 옛 사람들의 생활', areas: ['역사 일반', '한국사'] },
  { unit: '달라지는 시대, 변화하는 생활 모습', areas: ['한국사'] },
  { unit: '식민 통치와 저항, 전쟁이 바꾼 사회와 생활', areas: ['한국사'] },
  { unit: '평화 통일을 위한 노력, 민주화와 산업화', areas: ['지속가능한 세계', '정치', '한국사'] },
  { unit: '민주주의와 시민 참여', areas: ['정치', '법'] },
  { unit: '지구, 대륙 그리고 국가들', areas: ['지리 인식'] },
  { unit: '세계의 자연환경', areas: ['자연환경과 인간생활'] },
  { unit: '시장경제와 국가 간 거래', areas: ['법', '경제'] },
  { unit: '지구촌 사람들', areas: ['인문환경과 인간생활', '지속가능한 세계', '사회⋅문화'] },
];

/** 중학교 사회·역사 단원(`domainKorean`) → 내용 체계 영역. */
export const middleUnitAreas = [
  { course: '사회', unit: '대한민국, 우리가 살아가는 곳', areas: ['지리 인식'] },
  { course: '사회', unit: '아시아', areas: ['지리 인식', '인문환경과 인간생활'] },
  { course: '사회', unit: '유럽', areas: ['지리 인식', '인문환경과 인간생활'] },
  { course: '사회', unit: '아프리카', areas: ['지리 인식'] },
  { course: '사회', unit: '아메리카', areas: ['지리 인식'] },
  { course: '사회', unit: '오세아니아와 극지방', areas: ['지리 인식'] },
  { course: '사회', unit: '세계화 시대, 지리의 힘', areas: ['자연환경과 인간생활'] },
  { course: '사회', unit: '우리나라의 자연환경과 인간 생활', areas: ['자연환경과 인간생활'] },
  { course: '사회', unit: '중부 지역', areas: ['인문환경과 인간생활', '지속가능한 세계'] },
  { course: '사회', unit: '북부 지역', areas: ['지속가능한 세계'] },
  { course: '사회', unit: '지속가능한 세계와 글로컬 시민', areas: ['지속가능한 세계'] },
  { course: '사회', unit: '민주주의와 시민', areas: ['정치'] },
  { course: '사회', unit: '정치과정과 시민 참여', areas: ['정치'] },
  { course: '사회', unit: '국제 사회와 한반도', areas: ['정치'] },
  { course: '사회', unit: '일상생활과 법', areas: ['법'] },
  { course: '사회', unit: '인권과 기본권', areas: ['법'] },
  { course: '사회', unit: '헌법과 국가기관', areas: ['법'] },
  { course: '사회', unit: '경제생활과 선택', areas: ['경제'] },
  { course: '사회', unit: '우리나라 경제와 세계화', areas: ['경제'] },
  { course: '사회', unit: '다양한 문화의 이해', areas: ['사회⋅문화'] },
  { course: '사회', unit: '사회 변동과 사회문제', areas: ['사회⋅문화'] },
  { course: '역사', unit: '역사 학습의 기초', areas: ['역사 일반'] },
  { course: '역사', unit: '문명의 발생과 고대 세계의 형성', areas: ['한국사'] },
  { course: '역사', unit: '국가의 형성과 발전', areas: ['한국사'] },
  { course: '역사', unit: '통일신라와 발해', areas: ['한국사'] },
  { course: '역사', unit: '고려의 성립과 변천', areas: ['한국사'] },
  { course: '역사', unit: '조선의 성립과 발전', areas: ['한국사'] },
  { course: '역사', unit: '조선 사회의 변동', areas: ['한국사'] },
  { course: '역사', unit: '근⋅현대 사회로의 전환', areas: ['한국사'] },
];

/**
 * bridge-domain-map 형식의 `domains` 배열을 만든다: 한 영역을 공유하는 초등 단원과 중학교
 * 단원을 짝지어 `{ elementaryDomain, middleDomains, printedPage }`로 낸다.
 */
export function socialBridgeDomains(middleCourse) {
  const entries = [];
  for (const { unit, areas } of elementaryUnitAreas) {
    for (const area of areas) {
      const middleDomains = middleUnitAreas
        .filter((record) => record.course === middleCourse && record.areas.includes(area))
        .map((record) => record.unit);
      if (!middleDomains.length) continue;
      entries.push({ elementaryDomain: unit, middleDomains, printedPage: areaPrintedPages[area] });
    }
  }
  return entries;
}
