import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

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
  await writeFile(temporary, stableJson(value), 'utf8');
  await rename(temporary, path);
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

function sourceUrl(source) {
  const year = source.governingNotice.match(/(2022|2024|2026)/)?.[1] ?? '2022';
  return `https://ncic.re.kr/inv/org/download.do?year=${year}&seq=${source.attachmentNo}&orgType=ogi4`;
}

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
    const statement = statementFor(lines, index, match[2]);
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
      domain,
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

const releases = {
  middle: 'kr-2022-middle-v0.2.0-candidate',
  high: 'kr-2022-high-v0.2.0-candidate',
  bridges: 'kr-2022-middle-high-bridge-v0.2.0-candidate',
};

const sourceManifest = {
  $schema: '../../../schema/source-manifest.schema.json',
  version: '0.2.0-candidate',
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
      rightsStatus: 'needs-document-level-review',
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
        labelKorean: record.courseTitle,
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
    const summary = paraphrase(record.statement, record.domain);
    const domainId = `kr.domain.2022.${profile}.${hash(`${courseId}|${record.domain}`, 16)}`;
    if (!domains.has(domainId)) {
      domains.set(domainId, {
        id: domainId,
        labelKorean: record.domain,
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
      labelKorean: `${record.courseTitle} ${record.domain} ${record.code}`,
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
        section: `${record.courseTitle} > ${record.domain}`,
        code: `[${record.code}]`,
      },
      officialTextIncluded: false,
      sourceRefs: [...record.sourceIds].sort(),
      verificationStatus: 'official-source-checked',
      reviewStatus: 'candidate',
      sourceTextIncluded: false,
    });

    const topicId = `kr.topic.2022.${profile}.${hash(standardId, 20)}`;
    topics.push({
      id: topicId,
      labelKorean: `${record.courseTitle} — ${summary}`,
      labelEnglish: null,
      schoolLevel: profile,
      courseIds: [courseId],
      domainId,
      types: [topicType(record.statement)],
      description: `${record.courseTitle}의 ${record.domain} 영역에서 ${summary}를 다루는 세부 학습 주제다.`,
      evidence: [`학습자가 ${summary}와 관련된 개념, 판단 근거 또는 수행 과정을 자신의 말이나 결과물로 보여 준다.`],
      assessmentPrompts: [`${summary}와 관련된 과제나 사례를 제시하고, 학습자가 해결 과정과 근거를 설명하거나 수행하게 한다.`],
      standardAlignments: [{ standardId, alignmentKind: 'supports', basis: 'official-standard-derived-topic-v2' }],
      sourceRefs: [...record.sourceIds].sort(),
      verificationStatus: 'public-doc-derived',
      reviewStatus: 'candidate',
      sourceTextIncluded: false,
    });

    const clusterKey = `${courseId}|${record.domain}`;
    if (!clustersByKey.has(clusterKey)) {
      clustersByKey.set(clusterKey, {
        id: `kr.cluster.2022.${profile}.${hash(clusterKey, 18)}`,
        labelKorean: `${record.courseTitle} — ${record.domain}`,
        labelEnglish: null,
        courseId,
        domainId,
        topicIds: [],
        summary: `${record.courseTitle}의 ${record.domain} 성취기준과 세부 주제를 묶은 학습 클러스터다.`,
        sourceRefs: [...record.sourceIds].sort(),
        verificationStatus: 'public-doc-derived',
        reviewStatus: 'candidate',
        sourceTextIncluded: false,
      });
    }
    clustersByKey.get(clusterKey).topicIds.push(topicId);
  }

  const learningRelations = [];

  return {
    subjectGroups: [...subjectGroups.values()].sort((a, b) => a.labelKorean.localeCompare(b.labelKorean, 'ko')),
    courses: [...courses.values()].sort((a, b) => a.labelKorean.localeCompare(b.labelKorean, 'ko')),
    domains: [...domains.values()].sort((a, b) => a.labelKorean.localeCompare(b.labelKorean, 'ko')),
    standards: standards.sort((a, b) => a.code.localeCompare(b.code, 'ko')),
    topics: topics.sort((a, b) => a.id.localeCompare(b.id, 'en')),
    clusters: [...clustersByKey.values()].map((cluster) => ({ ...cluster, topicIds: cluster.topicIds.sort() })).sort((a, b) => a.id.localeCompare(b.id, 'en')),
    learningRelations: learningRelations.sort((a, b) => a.id.localeCompare(b.id, 'en')),
  };
}

const middle = buildProfile('middle');
const high = buildProfile('high');

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
    rightsStatus: 'hold',
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
    rightsStatus: 'hold',
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
    rightsStatus: 'hold',
  },
];

const highCoursesByGroup = new Map();
for (const course of high.courses) {
  if (!highCoursesByGroup.has(course.subjectGroupId)) highCoursesByGroup.set(course.subjectGroupId, []);
  highCoursesByGroup.get(course.subjectGroupId).push(course);
}
const courseRelations = [];
const choiceSets = [];
const pathways = [];
const highGroupById = new Map(high.subjectGroups.map((group) => [group.id, group]));
for (const [subjectGroupId, courses] of highCoursesByGroup) {
  const common = courses.filter((course) => course.courseCategory === 'common');
  const elective = courses.filter((course) => !['common', 'specialized-common'].includes(course.courseCategory));
  for (const from of common) {
    for (const to of elective) {
      courseRelations.push({
        id: `kr.cr.${hash(`${from.id}|${to.id}|prepares-for`, 24)}`,
        fromCourseId: from.id,
        toCourseId: to.id,
        relationKind: 'prepares-for',
        claimStatus: 'candidate',
        reason: `${from.labelKorean}에서 ${to.labelKorean}로 이어지는 과목 선택 검토 후보 관계다.`,
        basisKind: 'repository-authored',
        basis: 'same-subject-group-course-category-candidate-v2',
        sourceRefs: [...new Set([...from.sourceRefs, ...to.sourceRefs])].sort(),
        reviewStatus: 'candidate',
      });
    }
  }
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

const middleGroupsByLabel = new Map(middle.subjectGroups.map((group) => [group.labelKorean, group]));
const highGroupsByLabel = new Map(high.subjectGroups.map((group) => [group.labelKorean, group]));
const middleCoursesByGroup = new Map();
const highTransitionCoursesByGroup = new Map();
for (const course of middle.courses) {
  if (!middleCoursesByGroup.has(course.subjectGroupId)) middleCoursesByGroup.set(course.subjectGroupId, []);
  middleCoursesByGroup.get(course.subjectGroupId).push(course);
}
for (const course of high.courses.filter((course) => ['common', 'general-elective', 'career-elective', 'convergence-elective'].includes(course.courseCategory))) {
  if (!highTransitionCoursesByGroup.has(course.subjectGroupId)) highTransitionCoursesByGroup.set(course.subjectGroupId, []);
  highTransitionCoursesByGroup.get(course.subjectGroupId).push(course);
}
const transitionAlignments = [];
for (const [label, middleGroup] of middleGroupsByLabel) {
  const highGroup = highGroupsByLabel.get(label);
  if (!highGroup) continue;
  for (const middleCourse of middleCoursesByGroup.get(middleGroup.id) ?? []) {
    for (const highCourse of highTransitionCoursesByGroup.get(highGroup.id) ?? []) {
      const sameNamedCourse = middleCourse.labelKorean.replace(/[^가-힣A-Za-z0-9]/g, '') === highCourse.labelKorean.replace(/[^가-힣A-Za-z0-9]/g, '');
      const transitionKind = sameNamedCourse ? 'continues' : highCourse.courseCategory === 'common' ? 'deepens' : 'prepares-for';
      const transitionVerb = transitionKind === 'continues' ? '이어지는' : transitionKind === 'deepens' ? '심화하는' : '준비하는';
      transitionAlignments.push({
        id: `kr.transition.${hash(`${middleCourse.id}|${highCourse.id}`, 24)}`,
        fromSchoolLevel: 'middle',
        toSchoolLevel: 'high',
        fromCourseIds: [middleCourse.id],
        fromTopicIds: [],
        toCourseIds: [highCourse.id],
        toTopicIds: [],
        transitionKind,
        reason: `${middleCourse.labelKorean}와 고등학교 ${highCourse.labelKorean}가 같은 교과군에 속한다는 구조를 바탕으로 ${transitionVerb} 과정 수준의 검토 후보 관계다.`,
        basisKind: 'repository-authored',
        basis: 'same-subject-group-course-transition-candidate-v2',
        sourceRefs: [...new Set([...middleCourse.sourceRefs, ...highCourse.sourceRefs])].sort(),
        reviewStatus: 'candidate',
      });
    }
  }
}

function envelope(profile, releaseId, recordType, records) {
  const schemaFile = profile === 'middle' ? 'middle-profile' : profile === 'high' ? 'high-profile' : 'bridge-profile';
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
    $schema: `../../../schema/${schemaFile}.schema.json#/$defs/${definition}`,
    profile,
    releaseId,
    recordType,
    recordCount: records.length,
    records,
  };
}

const middleCollections = {
  subjectGroups: middle.subjectGroups,
  courses: middle.courses,
  domains: middle.domains,
  standards: middle.standards,
  topics: middle.topics,
  clusters: middle.clusters,
  learningRelations: middle.learningRelations,
  reviewRecords: [],
  coverageGaps: [
    { id: 'gap.middle.document-rights-review-pending', description: '중학교 관련 공식 PDF의 문서별 재사용 조건 검토가 완료되지 않았다.', severity: 'high', status: 'open', sourceRefs: catalog.sources.filter((source) => source.profileScopes.includes('middle')).map((source) => source.id).sort() },
    { id: 'gap.middle.subject-expert-review-pending', description: '세부 주제는 자동 생성 후보이며 선수 관계는 근거 없는 자동 생성을 중단했다. 교과 전문가와 학교 현장 검토가 필요하다.', severity: 'high', status: 'open', sourceRefs: [] },
  ],
};
const highCollections = {
  subjectGroups: high.subjectGroups,
  courses: high.courses,
  domains: high.domains,
  standards: high.standards,
  topics: high.topics,
  clusters: high.clusters,
  learningRelations: high.learningRelations,
  courseRelations,
  creditRules,
  choiceSets,
  pathways,
  reviewRecords: [],
  coverageGaps: [
    { id: 'gap.high.document-rights-review-pending', description: '고등학교 관련 공식 PDF의 문서별 재사용 조건 검토가 완료되지 않았다.', severity: 'high', status: 'open', sourceRefs: catalog.sources.filter((source) => source.profileScopes.includes('high')).map((source) => source.id).sort() },
    { id: 'gap.high.subject-expert-review-pending', description: '세부 주제, 과목 관계, 선택 묶음과 예시 경로는 자동 생성 후보이며 교과·직업계 전문가 검토가 필요하다.', severity: 'high', status: 'open', sourceRefs: [] },
  ],
};
const bridgeCollections = {
  transitionAlignments,
  reviewRecords: [],
  coverageGaps: [
    { id: 'gap.bridges.transition-review-pending', description: '중학교→고등학교 전이 관계는 동일 교과군의 과정 수준 후보이며 주제 수준 의미를 주장하지 않는다. 교과 전문가 검토가 필요하다.', severity: 'high', status: 'open', sourceRefs: [] },
  ],
};

const fileNames = {
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

async function writeProfile(profile, collections) {
  const releaseId = releases[profile];
  for (const [recordType, profileRecords] of Object.entries(collections)) {
    await atomicJson(join(root, 'data/kr', profile, fileNames[recordType]), envelope(profile, releaseId, recordType, profileRecords));
  }
  const collectionFiles = Object.fromEntries(Object.keys(collections).map((key) => [key, fileNames[key]]));
  const counts = Object.fromEntries(Object.entries(collections).map(([key, values]) => [key, values.length]));
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
        rightsStatus: 'hold',
        collections: collectionFiles,
        counts,
      }
    : {
        $schema: `../../../schema/${profile}-profile.schema.json`,
        releaseId,
        profile,
        schoolLevel: profile,
        curriculumVersion: '2022-revised',
        status: 'candidate',
        createdDate: catalog.catalogVersion,
        sourceManifest: '../shared/source-manifest.json',
        rightsStatus: 'hold',
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
await writeProfile('bridges', bridgeCollections);

await atomicJson(join(root, 'data/kr/inventory-report.json'), {
  version: '0.2.0-candidate',
  extractedOccurrenceCount: extracted.length,
  repeatedProfessionalCommonOccurrenceCount,
  uniqueStandardCount: records.length,
  middle: Object.fromEntries(Object.entries(middleCollections).map(([key, values]) => [key, values.length])),
  high: Object.fromEntries(Object.entries(highCollections).map(([key, values]) => [key, values.length])),
  bridges: Object.fromEntries(Object.entries(bridgeCollections).map(([key, values]) => [key, values.length])),
  diagnosticCount: diagnostics.length,
  diagnostics,
});

console.log(`curriculum build passed: ${middle.standards.length} middle standards, ${high.standards.length} high standards, ${transitionAlignments.length} transitions, ${diagnostics.length} diagnostics`);
