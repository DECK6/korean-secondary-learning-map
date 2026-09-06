import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildJoinLexicon, joinBrokenHangul } from './lib/text-normalize.mjs';
import { applyContentOverlay, contentOverlayDirectory, indexOverlayEntries, readContentOverlays } from './lib/content-overlay.mjs';
import { profileSchemaNames, releaseIds, shardDirectories, vocationalSubjectGroupSlugs } from './lib/profile-collections.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(join(root, 'sources/official/source-catalog.json'), 'utf8'));
const receipts = JSON.parse(await readFile(join(root, 'sources/official/source-receipts.json'), 'utf8'));
const receiptById = new Map(receipts.sources.map((source) => [source.id, source]));

const subjectGroupByAnnex = {
  5: '국어',
  6: '도덕',
  7: '사회(역사 포함)',
  8: '수학',
  9: '과학',
  10: '기술·가정/정보',
  11: '체육',
  12: '음악',
  13: '미술',
  14: '영어',
  16: '제2외국어',
  17: '한문',
  18: '중학교 선택',
  19: '교양',
  20: '과학 계열',
  21: '체육 계열',
  22: '예술 계열',
  23: '경영·금융',
  24: '보건·복지',
  25: '문화·예술·디자인·방송',
  26: '미용',
  27: '관광·레저',
  28: '식품·조리',
  29: '건축·토목',
  30: '기계',
  31: '재료',
  32: '화학공업',
  33: '섬유·의류',
  34: '전기·전자',
  35: '정보·통신',
  36: '환경·안전·소방',
  37: '농림·축산',
  38: '수산·해운',
  39: '융복합·지식재산',
};

const middleSubjectCourseByAnnex = {
  5: '국어',
  6: '도덕',
  7: '사회·역사',
  8: '수학',
  9: '과학',
  10: '기술·가정/정보',
  11: '체육',
  12: '음악',
  13: '미술',
  14: '영어',
};

const courseTitleByPrefix = {
  '9사(일사)': '사회',
  '9사(지리)': '사회',
  '9역': '역사',
  '9기가': '기술·가정',
  '9정': '정보',
  '9생독': '생활 독일어',
  '9생프': '생활 프랑스어',
  '9생스': '생활 스페인어',
  '9생중': '생활 중국어',
  '9생일': '생활 일본어',
  '9생러': '생활 러시아어',
  '9생아': '생활 아랍어',
  '9생베': '생활 베트남어',
  '9한': '한문',
  '9보': '보건',
  '9진로': '진로와 직업',
  '9환': '환경',
  '12진로': '진로와 직업',
  '12생환': '생태와 환경',
  '12인철': '인간과 철학',
  '12논리': '논리와 사고',
  '12심리': '인간과 심리',
  '12교이': '교육의 이해',
  '12삶종': '삶과 종교',
  '12보건': '보건',
  '12인경': '인간과 경제활동',
  '12논술': '논술',
};

const professionalCommonPrefixes = new Set(['성직', '인산', '디직']);

const categoryLabels = {
  common: '공통',
  'middle-elective': '중학교 선택',
  'general-elective': '일반 선택',
  'career-elective': '진로 선택',
  'convergence-elective': '융합 선택',
  'specialized-common': '전문 공통',
  'major-general': '전공 일반',
  'major-practical': '전공 실무',
};

function hash(value, length = 16) {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function stableJson(value) {
  const sort = (input) => {
    if (Array.isArray(input)) return input.map(sort);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(Object.keys(input).sort((a, b) => a.localeCompare(b, 'en')).map((key) => [key, sort(input[key])]));
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

async function atomicJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporary, stableJson(value), 'utf8');
  await rename(temporary, path);
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function normalizeLine(line) {
  return line.replaceAll('\f', '').replace(/\s+/g, ' ').trim();
}

function normalizeCode(code) {
  return code.normalize('NFKC').replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, ' ').trim();
}

function coursePrefix(code) {
  const normalized = normalizeCode(code);
  const professional = normalized.match(/^(.+?)\s+\d{2}(?:-\d{2})+$/);
  if (professional) return professional[1].trim();
  const numeric = normalized.replace(/\s+/g, '').match(/^([0-9]{1,2}[^0-9\s-]+[0-9]?)(?:-?[0-9]{2})-[0-9]{2}$/);
  if (numeric) return numeric[1];
  return normalized.replace(/(?:-?\d{2})-\d{2}$/, '').trim();
}

function profileFor(code, annex) {
  const compact = code.replace(/\s+/g, '');
  if (compact.startsWith('9')) return 'middle';
  if (compact.startsWith('10') || compact.startsWith('12')) return 'high';
  if (annex === 18) return 'middle';
  if (annex >= 19 && annex <= 39) return 'high';
  return null;
}

function categoryFromLine(line) {
  if (/전문 공통 과목/.test(line)) return 'specialized-common';
  if (/전공 일반 과목/.test(line)) return 'major-general';
  if (/전공 실무 과목/.test(line)) return 'major-practical';
  if (/융합 선택 과목/.test(line)) return 'convergence-elective';
  if (/진로 선택 과목/.test(line)) return 'career-elective';
  if (/일반 선택 과목/.test(line)) return 'general-elective';
  if (/공통 과목/.test(line)) return 'common';
  return null;
}

function categoryFor(lines, lineIndex, profile, annex, sections) {
  if (profile === 'middle') return annex >= 16 ? 'middle-elective' : 'common';
  let section = null;
  for (const candidate of sections) {
    if (candidate.index > lineIndex) break;
    section = candidate;
  }
  if (section?.category) return section.category;
  const window = lines.slice(Math.max(0, lineIndex - 180), lineIndex + 1).map(normalizeLine).reverse();
  for (const line of window) {
    const category = categoryFromLine(line);
    if (category) return category;
  }
  if (annex >= 23) return 'major-general';
  if ([19, 20, 21, 22].includes(annex)) return 'career-elective';
  return 'common';
}

function findCourseSections(lines) {
  const markers = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^1\.\s*성격\s*(및|과)\s*목표$/.test(normalizeLine(lines[index]))) continue;
    let title = null;
    let category = null;
    for (let cursor = index - 1; cursor >= Math.max(0, index - 120); cursor -= 1) {
      category = categoryFromLine(normalizeLine(lines[cursor]));
      if (category) break;
    }
    for (let cursor = index - 1; cursor >= Math.max(0, index - 90); cursor -= 1) {
      const line = normalizeLine(lines[cursor]);
      const professional = line.match(/(?:전문 공통 과목|전공 일반 과목|전공 실무 과목)\s*-\s*\d+\.\s*(.+)$/);
      if (professional) {
        title = professional[1].trim();
        break;
      }
      const numberedCourse = line.match(/^\d+\.\s*(.+)$/);
      if (numberedCourse && !/^(성격|목표|내용 체계|교수|평가)/.test(numberedCourse[1])) {
        title = numberedCourse[1].trim();
        break;
      }
      if (!line || line.length > 55 || /^\d+$/.test(line)) continue;
      if (/교육과정|선택 중심|공통 교육|차\s*례|전문 공통 과목$|전공 일반 과목$|전공 실무 과목$/.test(line)) continue;
      if (/^[가-하]\.|^\d+\.|^[<【•※(]/.test(line)) continue;
      if (/[.!?]$/.test(line)) continue;
      title = line;
      break;
    }
    markers.push({ index, title, category });
  }
  return markers;
}

function courseTitleFor(lines, sections, lineIndex, code, annex, profile) {
  const prefix = coursePrefix(code);
  if (courseTitleByPrefix[prefix]) return courseTitleByPrefix[prefix];
  if (profile === 'middle' && middleSubjectCourseByAnnex[annex]) return middleSubjectCourseByAnnex[annex];
  let section = null;
  for (const candidate of sections) {
    if (candidate.index > lineIndex) break;
    section = candidate;
  }
  if (section?.title) {
    const title = section.title
      .replace(/^[-–—]\s*/, '')
      .replace(/^\[|\]$/g, '')
      .replace(/^(?:일반|진로|융합) 선택 과목\s*[-–—]\s*/, '')
      .trim();
    const pair = title.split(/\s*,\s*/);
    if (pair.length === 2 && /1$/.test(prefix)) return pair[0].trim();
    if (pair.length === 2 && /2$/.test(prefix)) return pair[1].trim();
    return title;
  }
  const fallbackPrefix = prefix.replace(/^\d+/, '');
  return fallbackPrefix || `${subjectGroupByAnnex[annex]} 과목`;
}

function domainFor(lines, lineIndex, code) {
  for (let cursor = lineIndex - 1; cursor >= Math.max(0, lineIndex - 80); cursor -= 1) {
    const line = normalizeLine(lines[cursor]);
    const match = line.match(/^(?:\((\d+)\)|(\d+)\))\s*(.+)$/);
    if (match && match[3].length <= 80) return match[3].trim();
  }
  const compact = code.replace(/\s+/g, '');
  const match = compact.match(/(\d{2})-\d{2}$/);
  return match ? `영역 ${match[1]}` : '통합 영역';
}

function pageFor(lines, lineIndex) {
  let page = 1;
  for (let index = 0; index <= lineIndex; index += 1) {
    page += (lines[index].match(/\f/g) ?? []).length;
  }
  return page;
}

function statementFor(lines, lineIndex, firstLine) {
  const parts = [normalizeLine(firstLine)];
  for (let cursor = lineIndex + 1; cursor < Math.min(lines.length, lineIndex + 8); cursor += 1) {
    const line = normalizeLine(lines[cursor]);
    if (!line) break;
    if (/^\[|^•|^<성취기준|^\([가-힣0-9]+\)|^\d+\)/.test(line)) break;
    if (/^\d+$|교육과정$/.test(line)) continue;
    parts.push(line);
    if (/[.!?]$/.test(line)) break;
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function paraphrase(statement, domain) {
  let text = statement.normalize('NFKC').replace(/[.。]\s*$/, '').trim();
  const endings = [
    [/할 수 있다$/, '하기'],
    [/할 수 있으며.*$/, '하고 설명하기'],
    [/기른다$/, '기르기'],
    [/갖는다$/, '갖기'],
    [/쓴다$/, '쓰기'],
    [/읽는다$/, '읽기'],
    [/된다$/, '되기'],
    [/이해한다$/, '이해하기'],
    [/설명한다$/, '설명하기'],
    [/분석한다$/, '분석하기'],
    [/평가한다$/, '평가하기'],
    [/활용한다$/, '활용하기'],
    [/해결한다$/, '해결하기'],
    [/표현한다$/, '표현하기'],
    [/탐구한다$/, '탐구하기'],
    [/한다$/, '하기'],
  ];
  for (const [pattern, replacement] of endings) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      break;
    }
  }
  if (text.length > 180) text = `${text.slice(0, 176).replace(/\s+\S*$/, '')}…`;
  return text || `${domain} 영역의 핵심 이해와 수행`;
}

function topicType(statement) {
  if (/성찰|평가|비판|판단|분석/.test(statement)) return 'meta';
  if (/표현|수행|활용|해결|제작|구성|계산|실행|측정|조작/.test(statement)) return 'procedural';
  if (/기호|그래프|표|모형|모델|도식/.test(statement)) return 'representational';
  if (/말|듣|읽|쓰|언어|의사소통/.test(statement)) return 'language';
  return 'conceptual';
}

const facet = (key, label, type, alignmentKind = 'supports') => ({ key, label, type, alignmentKind });

// K-12 공통 계약 v1 4절의 공통 facet 8종. 주제 ID는 과목별 24종 키(facetKeyDetail)로 해시하므로
// 원값을 보존하고, 공통 어휘는 facetKey에 담는다. 사상 근거는
// docs/decisions/2026-09-05-facet-mapping.md 참조.
const commonFacetKeyByDetail = {
  core: 'core',
  'application-evidence': 'application',
  'appreciation-reflection': 'reflection',
  'case-judgment': 'inquiry',
  'communication-production': 'communication',
  'critical-reflection': 'reflection',
  'design-problem-solving': 'procedure',
  'dialogue-practice': 'communication',
  'ethical-concept': 'concept',
  'evidence-explanation': 'application',
  'evidence-judgment': 'application',
  'exploration-expression': 'representation',
  'inquiry-data': 'inquiry',
  'language-analysis': 'inquiry',
  'participation-reflection': 'reflection',
  'performance-creation': 'procedure',
  'problem-solving-explanation': 'application',
  'production-reflection': 'procedure',
  'reception-interaction': 'communication',
  'reflection-action': 'reflection',
  'reflection-transfer': 'reflection',
  'representation-modeling': 'representation',
  'skill-strategy': 'procedure',
  'source-context': 'inquiry',
};

function commonFacetKey(detail) {
  const key = commonFacetKeyByDetail[detail];
  if (!key) throw new Error(`no common facet mapping for ${detail}`);
  return key;
}

function middleTopicFacets(record) {
  if (record.courseTitle === '국어') return [
    facet('language-analysis', '언어 자료 분석과 의미 구성', 'language'),
    facet('communication-production', '의사소통 표현과 수행', 'procedural'),
    facet('critical-reflection', '비판적 검토와 언어생활 성찰', 'meta', 'extends'),
  ];
  if (record.courseTitle === '도덕') return [
    facet('ethical-concept', '윤리 개념과 가치 관계 이해', 'conceptual', 'introduces'),
    facet('case-judgment', '도덕적 사례 분석과 근거 판단', 'representational'),
    facet('dialogue-practice', '대화·토론과 공동체 실천', 'procedural'),
    facet('reflection-action', '삶의 성찰과 실천 계획', 'meta', 'extends'),
  ];
  if (['기술·가정', '정보'].includes(record.courseTitle)) return [
    facet('design-problem-solving', '설계·문제 해결과 안전한 수행', 'procedural'),
  ];
  if (record.courseTitle === '수학') return [
    facet('representation-modeling', '표현·모델링과 수학적 연결', 'representational'),
    facet('problem-solving-explanation', '문제 해결과 수학적 설명', 'procedural'),
  ];
  if (record.courseTitle === '과학') return [
    facet('inquiry-data', '탐구 설계와 자료 해석', 'representational'),
    facet('evidence-explanation', '증거 기반 설명과 적용', 'procedural'),
  ];
  if (['사회', '역사'].includes(record.courseTitle)) return [
    facet('source-context', '자료·맥락 해석과 관점 비교', 'representational'),
    facet('evidence-judgment', '근거 기반 판단과 사회적 적용', 'meta'),
  ];
  if (record.courseTitle === '체육') return [
    facet('skill-strategy', '기능·전략과 안전한 수행', 'procedural'),
    facet('participation-reflection', '참여·협력과 활동 성찰', 'meta'),
  ];
  if (record.courseTitle === '음악') return [
    facet('performance-creation', '연주·창작과 음악적 표현', 'procedural'),
    facet('appreciation-reflection', '감상·나눔과 음악문화 성찰', 'meta'),
  ];
  if (record.courseTitle === '미술') return [
    facet('exploration-expression', '조형 탐색과 시각적 표현', 'representational'),
    facet('appreciation-reflection', '감상·비평과 시각문화 성찰', 'meta'),
  ];
  if (record.courseTitle === '영어' || record.courseTitle.startsWith('생활 ')) return [
    facet('reception-interaction', '이해·상호작용과 의미 협상', 'language'),
    facet('production-reflection', '언어 산출과 의사소통 성찰', 'procedural'),
  ];
  return [
    facet('application-evidence', '사례·자료 적용과 근거 제시', 'procedural'),
    facet('reflection-transfer', '판단·성찰과 생활 맥락 전이', 'meta', 'extends'),
  ];
}

function facetEvidence(summary, facetRecord) {
  const byType = {
    conceptual: `학습자가 ${summary}와 관련된 핵심 개념과 가치의 관계를 구분하고 자신의 말로 설명한다.`,
    language: `학습자가 ${summary}와 관련된 언어 자료를 해석하고 상황과 목적에 맞게 의미를 구성하거나 표현한다.`,
    meta: `학습자가 ${summary}에 대한 판단이나 수행을 근거와 함께 돌아보고 다음 적용에서 바꿀 점을 제안한다.`,
    procedural: `학습자가 ${summary}와 관련된 과제에 적절한 절차와 전략을 선택해 수행하고 그 과정을 설명한다.`,
    representational: `학습자가 ${summary}와 관련된 자료·표현·사례를 비교하거나 변환하고 그 의미와 관계를 설명한다.`,
  };
  return `${byType[facetRecord.type]} 이 증거는 ‘${facetRecord.label}’ 후보 단위에 한정한다.`;
}

function facetPrompt(summary, facetRecord) {
  return `${summary}와 관련된 새로운 자료나 상황을 제시하고, ‘${facetRecord.label}’ 관점에서 해석·수행·판단한 과정과 근거를 설명하게 한다.`;
}

function sourceUrl(source) {
  const year = source.governingNotice.match(/(2022|2024|2026)/)?.[1] ?? '2022';
  return `https://ncic.re.kr/inv/org/download.do?year=${year}&seq=${source.attachmentNo}&orgType=ogi4`;
}

// `pdftotext -layout` wraps Korean lines mid-word, so the extracted text carries
// intra-word spaces ("추 론하기"). The corpus itself decides which pairs to rejoin.
const joinLexicon = buildJoinLexicon(await Promise.all(receipts.sources.map((source) => readFile(join(root, source.textFile), 'utf8'))));

const extracted = [];
const diagnostics = [];
for (const source of catalog.sources.filter((item) => item.annex >= 5 && item.annex <= 39 && item.annex !== 15)) {
  const receipt = receiptById.get(source.id);
  const text = await readFile(join(root, receipt.textFile), 'utf8');
  const lines = text.split(/\r?\n/);
  const sections = findCourseSections(lines);
  let count = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*\[([^\]\n]{1,32}?(?:\d{2}-\d{2}))\]\s*(.*)$/);
    if (!match) continue;
    const code = normalizeCode(match[1]);
    const profile = profileFor(code, source.annex);
    if (!profile) {
      if (/^[246]/.test(code.replace(/\s+/g, ''))) continue;
      diagnostics.push({ type: 'unknown-profile', sourceId: source.id, code, line: index + 1 });
      continue;
    }
    const category = categoryFor(lines, index, profile, source.annex, sections);
    const courseTitle = courseTitleFor(lines, sections, index, code, source.annex, profile);
    const domain = domainFor(lines, index, code);
    const statement = joinBrokenHangul(statementFor(lines, index, match[2]), joinLexicon);
    if (/두 자리 수로 제시|교과목의 2개 글자를 제시/.test(statement)) continue;
    extracted.push({
      code,
      profile,
      annex: source.annex,
      sourceId: source.id,
      attachmentNo: source.attachmentNo,
      sourceSha256: receipt.sha256,
      pdfPage: pageFor(lines, index),
      line: index + 1,
      subjectGroup: subjectGroupByAnnex[source.annex],
      category,
      coursePrefix: coursePrefix(code),
      courseTitle,
      courseLabel: joinBrokenHangul(courseTitle, joinLexicon),
      domain,
      domainLabel: joinBrokenHangul(domain, joinLexicon),
      statement,
    });
    count += 1;
  }
  if (count === 0) diagnostics.push({ type: 'no-standards-detected', sourceId: source.id, annex: source.annex });
}

const byProfileAndCode = new Map();
let repeatedProfessionalCommonOccurrenceCount = 0;
for (const record of extracted) {
  const isRepeatedProfessionalCommon = record.annex >= 23 && professionalCommonPrefixes.has(record.coursePrefix);
  const dedupeScope = isRepeatedProfessionalCommon ? 'professional-common' : `annex-${record.annex}`;
  const key = `${record.profile}|${dedupeScope}|${record.code.replace(/\s+/g, '')}`;
  const existing = byProfileAndCode.get(key);
  if (!existing) {
    byProfileAndCode.set(key, { ...record, sourceIds: [record.sourceId] });
    continue;
  }
  if (isRepeatedProfessionalCommon) repeatedProfessionalCommonOccurrenceCount += 1;
  if (!existing.sourceIds.includes(record.sourceId)) existing.sourceIds.push(record.sourceId);
  if (!isRepeatedProfessionalCommon && existing.statement !== record.statement && existing.sourceId !== record.sourceId) {
    diagnostics.push({ type: 'duplicate-code-text-difference', code: record.code, sources: [existing.sourceId, record.sourceId] });
  }
}

const records = [...byProfileAndCode.values()].sort((a, b) =>
  a.profile.localeCompare(b.profile, 'en') ||
  a.annex - b.annex ||
  a.courseTitle.localeCompare(b.courseTitle, 'ko') ||
  a.code.localeCompare(b.code, 'ko'),
);

const releases = releaseIds;

const sourceManifest = {
  $schema: '../../../schema/source-manifest.schema.json',
  version: '0.6.0-candidate',
  accessDate: catalog.catalogVersion,
  sourceCount: catalog.sources.length,
  sources: catalog.sources.map((source) => {
    const receipt = receiptById.get(source.id);
    return {
      id: source.id,
      name: source.originalName,
      publisher: source.governingNotice.startsWith('국가교육위원회') ? '국가교육위원회/NCIC' : '교육부/NCIC',
      url: sourceUrl(source),
      sourceType: 'official-pdf',
      usage: `${source.profileScopes.join('+')} 교육과정 별책 ${source.annex} 코드·과목·구조 확인`,
      verificationStatus: 'official-source-checked',
      rightsStatus: 'cleared',
      attachmentNo: source.attachmentNo,
      sha256: receipt.sha256,
      fileSizeBytes: receipt.bytes,
      notes: `${source.selectionReason}; PDF ${receipt.pdfPages}쪽; 공식 원문은 공개 데이터에 수록하지 않음.`,
    };
  }),
};
await atomicJson(join(root, 'data/kr/shared/source-manifest.json'), sourceManifest);

function buildProfile(profile) {
  const profileRecords = records.filter((record) => record.profile === profile);
  const subjectGroups = new Map();
  const courses = new Map();
  const domains = new Map();
  const standards = [];
  const topics = [];
  const clustersByKey = new Map();

  for (const record of profileRecords) {
    const groupLabel = record.category === 'specialized-common' ? '전문 공통' : record.subjectGroup;
    const subjectGroupId = `kr.subject-group.2022.${profile}.${hash(groupLabel, 12)}`;
    if (!subjectGroups.has(subjectGroupId)) {
      subjectGroups.set(subjectGroupId, {
        id: subjectGroupId,
        labelKorean: groupLabel,
        labelEnglish: null,
        schoolLevel: profile,
        sourceRefs: [...record.sourceIds].sort(),
        verificationStatus: 'official-source-checked',
        reviewStatus: 'candidate',
        sourceTextIncluded: false,
      });
    } else {
      const group = subjectGroups.get(subjectGroupId);
      group.sourceRefs = [...new Set([...group.sourceRefs, ...record.sourceIds])].sort();
    }

    const courseKey = `${profile}|${groupLabel}|${record.category}|${record.courseTitle}`;
    const courseId = `kr.course.2022.${profile}.${hash(courseKey, 16)}`;
    if (!courses.has(courseId)) {
      const base = {
        id: courseId,
        labelKorean: record.courseLabel,
        labelEnglish: null,
        schoolLevel: profile,
        subjectGroupId,
        courseCategory: record.category,
        sourceRefs: [...record.sourceIds].sort(),
        verificationStatus: 'official-source-checked',
        reviewStatus: 'candidate',
        sourceTextIncluded: false,
      };
      courses.set(courseId, profile === 'middle'
        ? { ...base, gradeScope: ['7-9'] }
        : {
            ...base,
            programScopes: record.annex >= 23 ? ['specialized-vocational'] : ['all-high-schools'],
            gradeScope: null,
            creditRuleRefs: [],
          });
    } else {
      const course = courses.get(courseId);
      course.sourceRefs = [...new Set([...course.sourceRefs, ...record.sourceIds])].sort();
    }

    const compactCode = record.code.replace(/\s+/g, '');
    const standardId = `kr.standard.2022.${profile}.${hash(`${courseId}|${compactCode}`, 20)}`;
    const summary = paraphrase(record.statement, record.domainLabel);
    const domainId = `kr.domain.2022.${profile}.${hash(`${courseId}|${record.domain}`, 16)}`;
    if (!domains.has(domainId)) {
      domains.set(domainId, {
        id: domainId,
        labelKorean: record.domainLabel,
        labelEnglish: null,
        schoolLevel: profile,
        courseId,
        sourceRefs: [...record.sourceIds].sort(),
        verificationStatus: 'public-doc-derived',
        reviewStatus: 'candidate',
        sourceTextIncluded: false,
      });
    } else {
      const domain = domains.get(domainId);
      domain.sourceRefs = [...new Set([...domain.sourceRefs, ...record.sourceIds])].sort();
    }
    standards.push({
      id: standardId,
      labelKorean: `${record.courseLabel} ${record.domainLabel} ${record.code}`,
      labelEnglish: null,
      courseId,
      code: `[${record.code}]`,
      domainId,
      summary,
      summaryKind: 'mechanical-derivative',
      sourceLocator: {
        sourceId: record.sourceId,
        attachmentNo: record.attachmentNo,
        sha256: record.sourceSha256,
        pdfPage: record.pdfPage,
        printedPage: null,
        section: `${record.courseLabel} > ${record.domainLabel}`,
        code: `[${record.code}]`,
      },
      officialTextIncluded: false,
      sourceRefs: [...record.sourceIds].sort(),
      verificationStatus: 'official-source-checked',
      reviewStatus: 'candidate',
      sourceTextIncluded: false,
    });

    const topicId = `kr.topic.2022.${profile}.${hash(standardId, 20)}`;
    const generatedTopics = [{
      id: topicId,
      labelKorean: `${record.courseLabel} — ${summary}`,
      labelEnglish: null,
      schoolLevel: profile,
      courseIds: [courseId],
      domainId,
      types: [topicType(record.statement)],
      description: `${record.courseLabel}의 ${record.domainLabel} 영역에서 ${summary}를 다루는 세부 학습 주제다.`,
      evidence: [`학습자가 ${summary}와 관련된 개념, 판단 근거 또는 수행 과정을 자신의 말이나 결과물로 보여 준다.`],
      assessmentPrompts: [`${summary}와 관련된 과제나 사례를 제시하고, 학습자가 해결 과정과 근거를 설명하거나 수행하게 한다.`],
      contentKind: 'mechanical-derivative',
      standardAlignments: [{ standardId, alignmentKind: 'supports', basis: 'official-standard-derived-topic-v2' }],
      ...(profile === 'middle' ? { decompositionKind: 'standard-core', facetKey: 'core', facetKeyDetail: 'core' } : { facetKey: 'core' }),
      sourceRefs: [...record.sourceIds].sort(),
      verificationStatus: 'public-doc-derived',
      reviewStatus: 'candidate',
      sourceTextIncluded: false,
    }];
    if (profile === 'middle') {
      for (const facetRecord of middleTopicFacets(record)) {
        generatedTopics.push({
          id: `kr.topic.2022.middle.${hash(`${standardId}|${facetRecord.key}`, 20)}`,
          labelKorean: `${record.courseLabel} — ${summary} — ${facetRecord.label}`,
          labelEnglish: null,
          schoolLevel: 'middle',
          courseIds: [courseId],
          domainId,
          types: [facetRecord.type],
          description: `${record.courseLabel}의 ${record.domainLabel} 영역에서 ${summary}를 ‘${facetRecord.label}’ 관점으로 분해한 세부 학습 주제 후보다.`,
          evidence: [facetEvidence(summary, facetRecord)],
          assessmentPrompts: [facetPrompt(summary, facetRecord)],
          contentKind: 'mechanical-derivative',
          standardAlignments: [{ standardId, alignmentKind: facetRecord.alignmentKind, basis: 'middle-subject-facet-decomposition-v1' }],
          decompositionKind: 'subject-facet',
          facetKey: commonFacetKey(facetRecord.key),
          facetKeyDetail: facetRecord.key,
          sourceRefs: [...record.sourceIds].sort(),
          verificationStatus: 'public-doc-derived',
          reviewStatus: 'candidate',
          sourceTextIncluded: false,
        });
      }
    }
    topics.push(...generatedTopics);

    const clusterKey = `${courseId}|${record.domain}`;
    if (!clustersByKey.has(clusterKey)) {
      clustersByKey.set(clusterKey, {
        id: `kr.cluster.2022.${profile}.${hash(clusterKey, 18)}`,
        labelKorean: `${record.courseLabel} — ${record.domainLabel}`,
        labelEnglish: null,
        courseId,
        domainId,
        topicIds: [],
        summary: `${record.courseLabel}의 ${record.domainLabel} 성취기준과 세부 주제를 묶은 학습 클러스터다.`,
        sourceRefs: [...record.sourceIds].sort(),
        verificationStatus: 'public-doc-derived',
        reviewStatus: 'candidate',
        sourceTextIncluded: false,
      });
    }
    clustersByKey.get(clusterKey).topicIds.push(...generatedTopics.map((topic) => topic.id));
  }

  const overlay = contentOverlays[profile];
  if (overlay) {
    const unused = new Set(overlay.entries.keys());
    for (const topic of topics) {
      if (applyContentOverlay(topic, overlay.entries.get(topic.id))) unused.delete(topic.id);
    }
    if (unused.size) throw new Error(`data/kr/${profile}/content: ${unused.size} overlay entries reference unknown topics (${[...unused].slice(0, 3).join(', ')})`);
  }

  return {
    subjectGroups: [...subjectGroups.values()].sort((a, b) => a.labelKorean.localeCompare(b.labelKorean, 'ko')),
    courses: [...courses.values()].sort((a, b) => a.labelKorean.localeCompare(b.labelKorean, 'ko')),
    domains: [...domains.values()].sort((a, b) => a.labelKorean.localeCompare(b.labelKorean, 'ko')),
    standards: standards.sort((a, b) => a.code.localeCompare(b.code, 'ko')),
    topics: topics.sort((a, b) => a.id.localeCompare(b.id, 'en')),
    clusters: [...clustersByKey.values()].map((cluster) => ({ ...cluster, topicIds: cluster.topicIds.sort() })).sort((a, b) => a.id.localeCompare(b.id, 'en')),
  };
}

// 주제 콘텐츠 오버레이(P3-2). 파일이 없으면 기계적 템플릿을 그대로 둔다.
const contentOverlays = {};
for (const profile of ['middle', 'high']) {
  const documents = await readContentOverlays(contentOverlayDirectory(root, profile));
  const { entries, errors } = indexOverlayEntries(documents);
  if (errors.length) throw new Error(errors.join('\n'));
  contentOverlays[profile] = { documents, entries };
}

const middle = buildProfile('middle');
const high = buildProfile('high');

// The high school is built in one pass so every id keeps hashing the `high` namespace, then the
// published product splits: `high` keeps the 231 courses open to every high school and
// `high-vocational` takes the 528 specialised subjects. No id changes, only the file a record
// lives in. See docs/architecture.md 5.3.
const vocationalCourseIds = new Set(
  high.courses.filter((course) => course.programScopes.includes('specialized-vocational')).map((course) => course.id),
);
const vocationalSubjectGroupIds = new Set(
  high.courses.filter((course) => vocationalCourseIds.has(course.id)).map((course) => course.subjectGroupId),
);
const vocationalPredicates = {
  subjectGroups: (record) => vocationalSubjectGroupIds.has(record.id),
  courses: (record) => vocationalCourseIds.has(record.id),
  domains: (record) => vocationalCourseIds.has(record.courseId),
  standards: (record) => vocationalCourseIds.has(record.courseId),
  topics: (record) => record.courseIds.some((courseId) => vocationalCourseIds.has(courseId)),
  clusters: (record) => vocationalCourseIds.has(record.courseId),
};
const highAcademic = {};
const highVocational = {};
for (const [collectionName, isVocational] of Object.entries(vocationalPredicates)) {
  highVocational[collectionName] = high[collectionName].filter(isVocational);
  highAcademic[collectionName] = high[collectionName].filter((record) => !isVocational(record));
}
for (const group of highAcademic.subjectGroups) {
  if (vocationalSubjectGroupIds.has(group.id)) throw new Error(`subject group ${group.labelKorean} mixes academic and vocational courses`);
}
const vocationalGroupLabelById = new Map(highVocational.subjectGroups.map((group) => [group.id, group.labelKorean]));
const vocationalShardSlugByCourseId = new Map(highVocational.courses.map((course) => {
  const label = vocationalGroupLabelById.get(course.subjectGroupId);
  const slug = vocationalSubjectGroupSlugs[label];
  if (!slug) throw new Error(`no vocational shard slug for subject group ${label}`);
  return [course.id, slug];
}));
const vocationalShardKeys = {
  standards: (record) => vocationalShardSlugByCourseId.get(record.courseId),
  topics: (record) => vocationalShardSlugByCourseId.get(record.courseIds[0]),
};

const creditRules = [
  {
    id: 'kr.credit-rule.2026.high.graduation-total',
    labelKorean: '고등학교 총 이수 학점',
    effectiveFrom: '2026-03-01',
    effectiveTo: null,
    ruleKind: 'graduation-total',
    value: 192,
    unit: 'credits',
    sourceRefs: ['kr-nec-2026-1-annex4'],
    verificationStatus: 'official-source-checked',
    rightsStatus: 'cleared',
  },
  {
    id: 'kr.credit-rule.2026.high.curriculum-total',
    labelKorean: '고등학교 교과(군) 이수 학점',
    effectiveFrom: '2026-03-01',
    effectiveTo: null,
    ruleKind: 'curriculum-total',
    value: 174,
    unit: 'credits',
    sourceRefs: ['kr-nec-2026-1-annex4'],
    verificationStatus: 'official-source-checked',
    rightsStatus: 'cleared',
  },
  {
    id: 'kr.credit-rule.2026.high.creative-activities-total',
    labelKorean: '고등학교 창의적 체험활동 이수 학점',
    effectiveFrom: '2026-03-01',
    effectiveTo: null,
    ruleKind: 'creative-activities-total',
    value: 18,
    unit: 'credits',
    sourceRefs: ['kr-nec-2026-1-annex4'],
    verificationStatus: 'official-source-checked',
    rightsStatus: 'cleared',
  },
];

// Choice sets and illustrative pathways describe how a general high school compares electives, so
// they are built from the academic profile only; the vocational release carries no selection model.
const highCoursesByGroup = new Map();
for (const course of highAcademic.courses) {
  if (!highCoursesByGroup.has(course.subjectGroupId)) highCoursesByGroup.set(course.subjectGroupId, []);
  highCoursesByGroup.get(course.subjectGroupId).push(course);
}
const choiceSets = [];
const pathways = [];
const highGroupById = new Map(highAcademic.subjectGroups.map((group) => [group.id, group]));
for (const [subjectGroupId, courses] of highCoursesByGroup) {
  const common = courses.filter((course) => course.courseCategory === 'common');
  const elective = courses.filter((course) => !['common', 'specialized-common'].includes(course.courseCategory));
  if (elective.length > 1) {
    const choiceSetId = `kr.choice-set.2022.high.${hash(subjectGroupId, 16)}`;
    choiceSets.push({
      id: choiceSetId,
      labelKorean: `${highGroupById.get(subjectGroupId)?.labelKorean ?? '교과군'} 선택 과목 비교`,
      choiceKind: 'comparison-only',
      minimumSelections: 0,
      maximumSelections: null,
      courseIds: elective.map((course) => course.id).sort(),
      ruleBasis: 'illustrative',
      sourceRefs: [...new Set(elective.flatMap((course) => course.sourceRefs))].sort(),
      reviewStatus: 'candidate',
    });
    pathways.push({
      id: `kr.pathway.2022.high.${hash(subjectGroupId, 16)}`,
      labelKorean: `${highGroupById.get(subjectGroupId)?.labelKorean ?? '교과군'} 탐색 경로`,
      pathwayKind: 'illustrative',
      audience: 'student',
      steps: [
        ...(common.length ? [{ order: 1, stepKind: 'foundation', courseIds: common.map((course) => course.id).sort(), choiceSetId: null, reason: '공통 과목을 기초로 확인한다.' }] : []),
        { order: common.length ? 2 : 1, stepKind: 'alternative', courseIds: [], choiceSetId, reason: '관심과 진로에 따라 선택 과목을 비교한다.' },
      ],
      notOfficialRequirement: true,
      reviewStatus: 'candidate',
    });
  }
}

function envelope(profile, releaseId, recordType, records, depth = 3) {
  const schemaFile = profileSchemaNames[profile];
  const definition = {
    subjectGroups: 'subjectGroupCollection',
    courses: 'courseCollection',
    domains: 'domainCollection',
    standards: 'standardCollection',
    topics: 'topicCollection',
    clusters: 'clusterCollection',
    learningRelations: 'learningRelationCollection',
    courseRelations: 'courseRelationCollection',
    creditRules: 'creditRuleCollection',
    choiceSets: 'choiceSetCollection',
    pathways: 'pathwayCollection',
    transitionAlignments: 'transitionAlignmentCollection',
    reviewRecords: 'reviewRecordCollection',
    coverageGaps: 'coverageGapCollection',
  }[recordType];
  return {
    $schema: `${'../'.repeat(depth)}schema/${schemaFile}.schema.json#/$defs/${definition}`,
    profile,
    releaseId,
    recordType,
    recordCount: records.length,
    records,
  };
}

// Only the collections derived straight from the official PDFs belong to this build. Relation,
// review and coverage-gap files are owned by build:relations and build:candidates, so this build
// never writes them; it declares their filenames and carries their counts forward. That is what
// makes `bun run build:data` idempotent (docs/plans/PROGRESS.md 2026-09-06).
const middleCollections = {
  subjectGroups: middle.subjectGroups,
  courses: middle.courses,
  domains: middle.domains,
  standards: middle.standards,
  topics: middle.topics,
  clusters: middle.clusters,
};
const highCollections = {
  subjectGroups: highAcademic.subjectGroups,
  courses: highAcademic.courses,
  domains: highAcademic.domains,
  standards: highAcademic.standards,
  topics: highAcademic.topics,
  clusters: highAcademic.clusters,
  creditRules,
  choiceSets,
  pathways,
};
const highVocationalCollections = {
  subjectGroups: highVocational.subjectGroups,
  courses: highVocational.courses,
  domains: highVocational.domains,
  standards: highVocational.standards,
  topics: highVocational.topics,
  clusters: highVocational.clusters,
};
const bridgeCollections = {};

const derivedCollections = {
  middle: ['learningRelations', 'candidateLearningRelations', 'reviewRecords', 'coverageGaps'],
  high: ['learningRelations', 'candidateLearningRelations', 'courseRelations', 'reviewRecords', 'coverageGaps'],
  'high-vocational': ['learningRelations', 'reviewRecords', 'coverageGaps'],
  bridges: ['transitionAlignments', 'elementaryTransitions', 'candidateElementaryTransitions', 'reviewRecords', 'coverageGaps'],
};

const fileNames = {
  candidateLearningRelations: 'learning-relations.candidate.json',
  elementaryTransitions: 'elementary-transitions.json',
  candidateElementaryTransitions: 'elementary-transitions.candidate.json',
  subjectGroups: 'subject-groups.json',
  courses: 'courses.json',
  domains: 'domains.json',
  standards: 'standards.json',
  topics: 'topics.json',
  clusters: 'clusters.json',
  learningRelations: 'learning-relations.json',
  courseRelations: 'course-relations.json',
  creditRules: 'credit-rules.json',
  choiceSets: 'choice-sets.json',
  pathways: 'pathways.json',
  transitionAlignments: 'transition-alignments.json',
  reviewRecords: 'review-records.json',
  coverageGaps: 'coverage-gaps.json',
};

/** Splits one collection into `<dir>/<slug>.json` shards so no published file passes 25 MB. */
async function writeShards(profile, releaseId, recordType, records, shardKey) {
  const directory = shardDirectories[recordType];
  const grouped = new Map();
  for (const record of records) {
    const slug = shardKey(record);
    if (!slug) throw new Error(`${profile}/${recordType}: record ${record.id} has no shard key`);
    if (!grouped.has(slug)) grouped.set(slug, []);
    grouped.get(slug).push(record);
  }
  const files = [];
  for (const slug of [...grouped.keys()].sort((a, b) => a.localeCompare(b, 'en'))) {
    files.push(`${directory}/${slug}.json`);
    await atomicJson(
      join(root, 'data/kr', profile, directory, `${slug}.json`),
      envelope(profile, releaseId, recordType, grouped.get(slug), 4),
    );
  }
  return files;
}

async function writeProfile(profile, collections, shardKeys = {}) {
  const releaseId = releases[profile];
  const collectionFiles = Object.fromEntries(derivedCollections[profile].map((key) => [key, fileNames[key]]));
  const previous = await readJsonIfPresent(join(root, 'data/kr', profile, 'release.json'));
  const counts = Object.fromEntries(derivedCollections[profile].map((key) => [key, previous?.counts?.[key] ?? 0]));
  for (const [recordType, profileRecords] of Object.entries(collections)) {
    counts[recordType] = profileRecords.length;
    if (shardKeys[recordType]) {
      collectionFiles[recordType] = await writeShards(profile, releaseId, recordType, profileRecords, shardKeys[recordType]);
      continue;
    }
    collectionFiles[recordType] = fileNames[recordType];
    await atomicJson(join(root, 'data/kr', profile, fileNames[recordType]), envelope(profile, releaseId, recordType, profileRecords));
  }
  const release = profile === 'bridges'
    ? {
        $schema: '../../../schema/bridge-profile.schema.json',
        releaseId,
        profile,
        curriculumVersion: '2022-revised',
        status: 'candidate',
        createdDate: catalog.catalogVersion,
        middleReleaseId: releases.middle,
        highReleaseId: releases.high,
        sourceManifest: '../shared/source-manifest.json',
        rightsStatus: 'cleared',
        collections: collectionFiles,
        counts,
      }
    : {
        $schema: `../../../schema/${profileSchemaNames[profile]}.schema.json`,
        releaseId,
        profile,
        schoolLevel: profile === 'middle' ? 'middle' : 'high',
        curriculumVersion: '2022-revised',
        status: 'candidate',
        createdDate: catalog.catalogVersion,
        sourceManifest: '../shared/source-manifest.json',
        rightsStatus: 'cleared',
        textPolicy: {
          officialTextIncluded: false,
          summaryPolicy: '공식 성취기준 문장은 수록하지 않고 코드·locator와 기계적 초안 요약을 사용하며 전문가 검토 상태를 분리한다.',
        },
        collections: collectionFiles,
        counts,
      };
  await atomicJson(join(root, 'data/kr', profile, 'release.json'), release);
}

await writeProfile('middle', middleCollections);
await writeProfile('high', highCollections);
await writeProfile('high-vocational', highVocationalCollections, vocationalShardKeys);
await writeProfile('bridges', bridgeCollections);

const middleTopicCountsByStandard = new Map();
for (const topic of middle.topics) {
  for (const alignment of topic.standardAlignments) middleTopicCountsByStandard.set(alignment.standardId, (middleTopicCountsByStandard.get(alignment.standardId) ?? 0) + 1);
}
const middleTopicDistribution = Object.fromEntries(
  [...Map.groupBy([...middleTopicCountsByStandard.values()], (count) => count)]
    .sort(([a], [b]) => a - b)
    .map(([count, values]) => [String(count), values.length]),
);
const highScopeSummary = (split) => ({
  courses: split.courses.length,
  domains: split.domains.length,
  standards: split.standards.length,
  topics: split.topics.length,
});

// Relation, review and gap totals stay owned by build:relations/build:candidates, so carry the
// previous figures instead of resetting them to zero.
const previousInventory = await readJsonIfPresent(join(root, 'data/kr/inventory-report.json'));
const inventoryCounts = (profile, collections) => ({
  ...Object.fromEntries(derivedCollections[profile].map((key) => [key, previousInventory?.[profile]?.[key] ?? 0])),
  ...Object.fromEntries(Object.entries(collections).map(([key, values]) => [key, values.length])),
});

await atomicJson(join(root, 'data/kr/inventory-report.json'), {
  version: '0.6.0-candidate',
  extractedOccurrenceCount: extracted.length,
  repeatedProfessionalCommonOccurrenceCount,
  uniqueStandardCount: records.length,
  comparisonBaselines: {
    elementary: {
      repository: 'https://github.com/DECK6/korean-elementary-learning-map',
      dataRelease: 'kr-full-depth-v0.5',
      standards: 620,
      topics: 1956,
      clusters: 152,
      learningRelations: 400,
      candidateLearningRelations: 1875,
      topicsPerStandard: 1956 / 620,
    },
  },
  middle: inventoryCounts('middle', middleCollections),
  middleTopicDecomposition: {
    policy: 'middle-subject-facet-decomposition-v1',
    stableCoreTopics: middle.topics.filter((topic) => topic.decompositionKind === 'standard-core').length,
    subjectFacetTopics: middle.topics.filter((topic) => topic.decompositionKind === 'subject-facet').length,
    topicsPerStandard: {
      minimum: Math.min(...middleTopicCountsByStandard.values()),
      maximum: Math.max(...middleTopicCountsByStandard.values()),
      average: middle.topics.length / middle.standards.length,
      distribution: middleTopicDistribution,
    },
  },
  high: inventoryCounts('high', highCollections),
  'high-vocational': inventoryCounts('high-vocational', highVocationalCollections),
  highScopeBreakdown: {
    allHighSchools: highScopeSummary(highAcademic),
    specializedVocational: highScopeSummary(highVocational),
  },
  bridges: inventoryCounts('bridges', bridgeCollections),
  diagnosticCount: diagnostics.length,
  diagnostics,
});

const overlayEntryCount = Object.values(contentOverlays).reduce((total, overlay) => total + overlay.entries.size, 0);
console.log(`curriculum build passed: ${middle.standards.length} middle standards, ${highAcademic.standards.length} high standards, ${highVocational.standards.length} high-vocational standards, ${overlayEntryCount} content overlay entries, ${diagnostics.length} diagnostics`);
