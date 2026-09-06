// Repairs intra-word spaces produced by `pdftotext -layout` extraction.
// Korean lines in the official PDFs wrap mid-word, so joining extracted lines
// leaves artifacts such as "추 론하기", "밤 하늘" or "유 용성". Repair decisions
// are driven by the official text corpus itself: a pair is merged only when the
// merged form is attested as a word start in the corpus and the spaced form is
// not. Nothing is hard-coded per subject, and legitimate one-syllable words
// ("할 수 있다", "및", "등", "각", "두 가지") are never merged.

const HANGUL_RUN = /^[^가-힣]*([가-힣]+)[^가-힣]*$/;

// Prefix lengths indexed from the corpus. Two syllables is the shortest useful
// word start; twelve covers the longest wrapped compounds in the annexes.
const MIN_PREFIX_LENGTH = 2;
const MAX_PREFIX_LENGTH = 12;
// A merge must be attested at least two syllables past the left token: support
// for shorter fragments turns real phrases ("계 수준", "말 기승") into one word.
const MIN_EVIDENCE_LENGTH = 3;
const MIN_JOINED_COUNT = 3;
// Two one-syllable tokens ("존 중") carry the least context, so demand more.
const MIN_SHORT_JOINED_COUNT = 20;
// The merged form must dominate the spaced form ("빅 데이터" stays spaced).
const SPACED_EVIDENCE_RATIO = 4;
// How many syllables of the right-hand token are indexed on the spaced side.
const MAX_SPACED_TAIL_LENGTH = 4;

// One-syllable Korean tokens that legitimately stand alone between spaces.
// Source: 2026-09-05 K-12 관계 어휘 계약 5절, extended with tokens observed as
// false positives in the 2022 개정 중등 성취기준 corpus (see tests).
export const HANGUL_SINGLE_TOKEN_ALLOWLIST = new Set([
  // 계약 5절 목록
  '수', '및', '등', '각', '그', '이', '한', '두', '세', '더', '잘', '때', '것',
  '할', '될', '볼', '뒤', '후', '전', '내', '밖', '위', '속', '중', '간', '새',
  '큰', '몇', '약', '총', '단', '첫', '데', '바', '채', '듯', '차', '별', '초',
  '말', '끝', '앞', '옆', '곧', '즉', '좀', '늘', '참', '온', '맨', '겸', '대',
  '관', '향',
  // 성취기준 문장에서 확인한 정상 단독 토큰
  '풀', '쓸', '넣', '갖', '삶', '성', '질', '팀', '계', '몸', '빅', '떡', '극',
  '광', '손', '앱', '웹', '샵', '홈', '젤', '롤', '펌', '컵', '탕', '면', '떡',
  '차', '술', '옷', '집', '땅', '물', '불', '빛', '힘', '색', '선', '점', '원',
  '구', '값', '식', '표', '상', '하', '년', '월', '일', '시', '분', '회', '층',
  '편', '권', '장', '절', '항', '호', '종', '개', '명', '쪽', '배', '벌', '살',
  '씩', '째', '왜', '곳', '못', '안', '또', '다', '줄', '옛', '작', '여', '남',
  '북', '동', '서', '눈', '비', '해', '달', '산', '강', '열', '뿔', '꽃', '씨',
  '잎', '돌', '흙', '곁', '헌', '왼', '꼭',
]);

// One-syllable tokens that are never merged into a neighbour, even when the
// corpus attests the merged form. These are grammatical words whose spacing is
// mandated by 한글 맞춤법 (의존 명사·관형사·접속 부사).
const NEVER_JOIN_SINGLE_TOKENS = new Set(['및', '등', '각', '두', '할', '수']);

// Two multi-syllable tokens normally stay apart, because correctly spaced compounds ("사회 과학",
// "협력 사례를") are indistinguishable from a wrap by corpus counts alone. The exception is a right
// token that 한글 맞춤법 always writes attached to the preceding noun: a 하다/되다 conjugation
// ("참여 하고", "평가 하며") or a 격조사 ("바탕 으로", "과정 에서"). Such a token can never stand
// alone, so a wrap is the only way it becomes its own token — the corpus evidence rule still decides.
const BOUND_RIGHT_TOKEN =
  /^(?:하|되)(?:고|기|는|며|면|여|어|지|게|자|도록|므로|여야|어야|였다|었다|더라도)$|^(?:한다|된다)$|^(?:에서|에게|에게서|으로|으로서|으로써)$/;

// True when the pair may be considered at all; the merge itself still needs corpus evidence.
function joinable(leftRun, rightRun) {
  return leftRun.length === 1 || rightRun.length === 1 || BOUND_RIGHT_TOKEN.test(rightRun);
}

function hangulRunOf(token) {
  const match = HANGUL_RUN.exec(token);
  return match ? match[1] : null;
}

function countPrefixes(token, counts) {
  const limit = Math.min(MAX_PREFIX_LENGTH, token.length);
  for (let length = MIN_PREFIX_LENGTH; length <= limit; length += 1) {
    const prefix = token.slice(0, length);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
}

/**
 * Builds merge evidence from the official extracted text.
 * `joined` counts corpus tokens starting with a given hangul prefix; `spaced`
 * counts adjacent token pairs seen *within a single line*, so line-wrap
 * artifacts can never vouch for their own spacing.
 */
export function buildJoinLexicon(corpusTexts) {
  const joined = new Map();
  const spaced = new Map();
  for (const text of corpusTexts) {
    for (const rawLine of String(text).split(/\r?\n/)) {
      const line = rawLine.replace(/[\f]/g, '').trim();
      if (!line) continue;
      const runs = line.split(/\s+/).map(hangulRunOf);
      for (let index = 0; index < runs.length; index += 1) {
        const run = runs[index];
        if (!run) continue;
        if (run.length >= MIN_PREFIX_LENGTH) countPrefixes(run, joined);
        const next = runs[index + 1];
        if (!next) continue;
        if (!joinable(run, next)) continue;
        // Index right-hand prefixes so inflected variants of the same spaced
        // phrase ("빅 데이터", "빅 데이터와") vouch for each other.
        const limit = Math.min(MAX_SPACED_TAIL_LENGTH, next.length);
        for (let length = 1; length <= limit; length += 1) {
          const key = `${run} ${next.slice(0, length)}`;
          spaced.set(key, (spaced.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return { joined, spaced };
}

/** Corpus support for merging `left`+`right`, or 0 when the pair must stay apart. */
function joinScore(left, right, lexicon) {
  const leftRun = hangulRunOf(left);
  const rightRun = hangulRunOf(right);
  if (!leftRun || !rightRun) return 0;
  if (!joinable(leftRun, rightRun)) return 0;
  if (leftRun.length === 1 && NEVER_JOIN_SINGLE_TOKENS.has(leftRun)) return 0;
  if (rightRun.length === 1 && NEVER_JOIN_SINGLE_TOKENS.has(rightRun)) return 0;
  const merged = leftRun + rightRun;
  let spacedCount = 0;
  for (let length = 1; length <= Math.min(MAX_SPACED_TAIL_LENGTH, rightRun.length); length += 1) {
    spacedCount = Math.max(spacedCount, lexicon.spaced.get(`${leftRun} ${rightRun.slice(0, length)}`) ?? 0);
  }
  if (merged.length === MIN_PREFIX_LENGTH) {
    const evidence = lexicon.joined.get(merged) ?? 0;
    return evidence >= MIN_SHORT_JOINED_COUNT && evidence >= SPACED_EVIDENCE_RATIO * spacedCount ? evidence : 0;
  }
  // Evidence must reach past the left token, so support for the left token
  // alone ("무용과" in "무용과 몸") cannot justify a merge.
  let evidence = 0;
  const first = Math.max(MIN_EVIDENCE_LENGTH, leftRun.length + 1);
  const last = Math.min(MAX_PREFIX_LENGTH, merged.length);
  for (let length = first; length <= last; length += 1) {
    evidence = Math.max(evidence, lexicon.joined.get(merged.slice(0, length)) ?? 0);
  }
  return evidence >= MIN_JOINED_COUNT && evidence >= SPACED_EVIDENCE_RATIO * spacedCount ? evidence : 0;
}

/**
 * Merges PDF line-wrap artifacts in `text` using corpus evidence.
 * Merges are applied best-supported first so that a stray syllable attaches to
 * the neighbour the corpus actually supports ("협력 사 례를" → "협력 사례를").
 */
export function joinBrokenHangul(text, lexicon) {
  if (!text || !lexicon) return text;
  // Even entries are tokens, odd entries the whitespace runs between them.
  const parts = String(text).split(/(\s+)/);
  const tokens = parts.filter((_, index) => index % 2 === 0);
  const separators = parts.filter((_, index) => index % 2 === 1);
  for (;;) {
    let bestIndex = -1;
    let bestScore = 0;
    for (let index = 0; index + 1 < tokens.length; index += 1) {
      const score = joinScore(tokens[index], tokens[index + 1], lexicon);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    tokens[bestIndex] += tokens[bestIndex + 1];
    tokens.splice(bestIndex + 1, 1);
    separators.splice(bestIndex, 1);
  }
  return tokens.map((token, index) => token + (separators[index] ?? '')).join('');
}

/** Returns one-syllable hangul tokens that look like extraction artifacts. */
export function findSuspiciousTokens(text, allowlist = HANGUL_SINGLE_TOKEN_ALLOWLIST) {
  return String(text ?? '')
    .split(/\s+/)
    .filter((token) => /^[가-힣]$/.test(token) && !allowlist.has(token));
}
