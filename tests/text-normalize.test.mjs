import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'bun:test';
import {
  HANGUL_SINGLE_TOKEN_ALLOWLIST,
  buildJoinLexicon,
  findSuspiciousTokens,
  joinBrokenHangul,
} from '../scripts/lib/text-normalize.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// PDF wrap defects observed in 2022 개정 중등 성취기준 (개선계획 B3).
const defects = [
  ['세포의 구조와 기능의 관계를 추 론할 수 있다', '세포의 구조와 기능의 관계를 추론할 수 있다'],
  ['열전달 과정을 모형 등을 사용하여 다양하게 표 현할 수 있다', '열전달 과정을 모형 등을 사용하여 다양하게 표현할 수 있다'],
  ['이를 실생활에 적용하여 과학의 유 용성을 인식한다', '이를 실생활에 적용하여 과학의 유용성을 인식한다'],
  ['별자리 변화를 이해하고, 밤 하늘 천체에 호기심을 가진다', '별자리 변화를 이해하고, 밤하늘 천체에 호기심을 가진다'],
  ['청소년기의 발달 특 징을 자신의 발달 특징과 연결 짓는다', '청소년기의 발달 특징을 자신의 발달 특징과 연결 짓는다'],
  ['세계 다양한 주체들의 협력 사 례를 조사한다', '세계 다양한 주체들의 협력 사례를 조사한다'],
  ['생명 존 중 및 윤리적 태도를 갖는다', '생명 존중 및 윤리적 태도를 갖는다'],
  ['적절한 응 급처치와 협력적 대응 방안을 탐색한다', '적절한 응급처치와 협력적 대응 방안을 탐색한다'],
  // 조사·어미가 통째로 다음 줄로 넘어간 유형 (R5-B4 보고).
  ['사회적 독서에 참여 하고 독서 문화 형성에 기여한다', '사회적 독서에 참여하고 독서 문화 형성에 기여한다'],
  ['표현 방법의 적절성을 평가 하며 읽는다', '표현 방법의 적절성을 평가하며 읽는다'],
  ['멘델 유전 현상을 조사 하여 협력적으로 소통한다', '멘델 유전 현상을 조사하여 협력적으로 소통한다'],
  ['다양한 문제 상황을 중심 으로 대처 방안을 탐색한다', '다양한 문제 상황을 중심으로 대처 방안을 탐색한다'],
  ['이를 이용한 사례를 주변 에서 찾을 수 있다', '이를 이용한 사례를 주변에서 찾을 수 있다'],
  ['해결 방안을 탐색, 실현, 평가함 으로써 태도를 갖는다', '해결 방안을 탐색, 실현, 평가함으로써 태도를 갖는다'],
];

// Correct spacing that must survive: 의존 명사·관형사, and one-syllable words
// that carry meaning on their own in the official statements.
const preserved = [
  '간단한 삼차방정식과 사차방정식을 풀 수 있다',
  '생물을 계 수준에서 분류할 수 있다',
  '건강한 성 가치관을 함양한다',
  '분석한 결과를 삶의 질 향상에 활용한다',
  '구성원 간에 서로 신뢰하며 팀 목표를 달성한다',
  '두 가지 방법을 비교하고 세 가지 사례를 제시한다',
  '자료를 수집하고 분석 및 해석 등 각 단계를 수행한다',
  '빅 데이터와 인공지능의 관계를 설명한다',
  '광 통신 시스템의 구조를 이해한다',
  '타 분야와 연계하여 다양한 재료와 기법을 활용한다',
  '다소 긴 글이나 대화를 듣고 대의나 주제를 파악한다',
  // 두 토큰 모두 두 음절 이상인 정상 복합어는 조사·어미가 아니므로 붙이지 않는다.
  '사회 과학 탐구 방법과 자연 과학 탐구 방법을 비교한다',
  '세계 다양한 주체들의 협력 사례를 조사한다',
  '자기 주도적으로 학습 계획을 세우고 점검한다',
  '학습 활동 결과를 정리하여 발표한다',
];

describe('pdftotext hangul spacing repair', () => {
  let lexicon;

  beforeAll(async () => {
    const receipts = JSON.parse(await readFile(join(root, 'sources/official/source-receipts.json'), 'utf8'));
    lexicon = buildJoinLexicon(await Promise.all(receipts.sources.map((source) => readFile(join(root, source.textFile), 'utf8'))));
  }, 60000);

  test('repairs wrapped words using corpus evidence', () => {
    expect(defects.map(([broken]) => joinBrokenHangul(broken, lexicon))).toEqual(defects.map(([, fixed]) => fixed));
  });

  test('keeps legitimate one-syllable tokens apart', () => {
    expect(preserved.map((text) => joinBrokenHangul(text, lexicon))).toEqual(preserved);
  });

  test('leaves text without hangul spacing defects untouched', () => {
    const text = '자료를 분석하고 결과를 해석하여 근거와 함께 설명한다.';
    expect(joinBrokenHangul(text, lexicon)).toBe(text);
    expect(joinBrokenHangul('', lexicon)).toBe('');
    expect(joinBrokenHangul('요약', null)).toBe('요약');
  });

  test('every built middle summary is free of suspicious one-syllable tokens', async () => {
    const standards = JSON.parse(await readFile(join(root, 'data/kr/middle/standards.json'), 'utf8')).records;
    const suspicious = standards.filter((standard) => findSuspiciousTokens(standard.summary).length);
    expect(suspicious.map((standard) => `${standard.code} ${standard.summary}`)).toEqual([]);
  });

  test('the repair leaves nothing for a second pass to merge', async () => {
    for (const file of ['data/kr/middle/standards.json', 'data/kr/high/standards.json']) {
      const standards = JSON.parse(await readFile(join(root, file), 'utf8')).records;
      const residual = standards.filter((standard) => joinBrokenHangul(standard.summary, lexicon) !== standard.summary);
      expect(residual.map((standard) => `${standard.code} ${standard.summary}`)).toEqual([]);
    }
  });

  test('flags only tokens outside the allowlist', () => {
    expect(findSuspiciousTokens('관계를 추 론하기')).toEqual(['추']);
    expect(findSuspiciousTokens('일차방정식을 풀 수 있고, 두 가지 방법 및 각 사례')).toEqual([]);
    expect(findSuspiciousTokens('밤 하늘', new Set())).toEqual(['밤']);
    expect(HANGUL_SINGLE_TOKEN_ALLOWLIST.has('수')).toBe(true);
    expect(HANGUL_SINGLE_TOKEN_ALLOWLIST.has('추')).toBe(false);
  });
});
