#!/usr/bin/env bun
/**
 * STAS (KICE 학생평가지원포털, https://stas.moe.go.kr) research collector.
 *
 * Read-only reconnaissance + collection of the 2022 개정 교육과정 성취기준 /
 * 평가기준 / 성취수준 exposed by the portal's unauthenticated `/rest` API.
 *
 * No login, no session reuse, no bypass of any access control. Every endpoint
 * used here answers anonymously to a plain GET. Requests are serialized with a
 * >= 500ms delay (<= 2 req/s) and retried at most 3 times.
 *
 * Usage:
 *   bun scripts/dev/collect-stas.mjs --discover
 *   bun scripts/dev/collect-stas.mjs --collect [--out sources/stas] [--delay 550]
 *   bun scripts/dev/collect-stas.mjs --match [--raw sources/stas/raw]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ELEMENTARY_REPO = resolve(REPO_ROOT, '..', 'korean-elementary-learning-map');

const BASE_URL = 'https://stas.moe.go.kr';
const REST = '/rest';
const CURRICULUM = '2022';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const DEFAULT_DELAY_MS = 550;
const MAX_RETRIES = 3;

const TERMS_NOTICE =
  'KICE 학생평가지원포털 이용약관 제10조①2(회원이 서비스에서 얻은 정보를 KICE 사전승낙 없이 본래 이용 이외의 목적으로 복제·제공하는 행위 금지), ' +
  '제16조②(게시자 사전 동의 없는 가공·판매 등 영리 목적 이용 금지). 공공누리(KOGL) 유형 표시는 사이트 어디에도 게시되어 있지 않음. ' +
  '푸터 고지: "학생평가지원포털 및 모든 학생평가 관련 탑재 자료는 학생평가 지원 사업의 일환으로 16개 시도교육청의 지원을 받아 수업 지원 목적으로 개발되었습니다." ' +
  '따라서 본 수집물은 비영리 연구·대조 검증 목적의 로컬 캐시로만 보관하며 재배포하지 않는다(sources/stas/raw/ 는 .gitignore 처리).';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...args) {
  process.stderr.write(`${args.join(' ')}\n`);
}

/** Serialized, retrying GET against the STAS REST API. */
async function getJson(path, { delayMs = DEFAULT_DELAY_MS } = {}) {
  const url = `${BASE_URL}${path}`;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: `${BASE_URL}/cmn/main`,
        },
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      if (res.status >= 500 || res.status === 429) {
        throw new Error(`HTTP ${res.status}`);
      }
      return { status: res.status, json, text };
    } catch (error) {
      lastError = error;
      log(`  retry ${attempt}/${MAX_RETRIES} ${path}: ${error.message}`);
      await sleep(delayMs * attempt * 2);
    }
  }
  throw lastError ?? new Error(`failed: ${path}`);
}

/* ------------------------------------------------------------------ */
/* discover                                                            */
/* ------------------------------------------------------------------ */

const CANDIDATE_PATHS = [
  // confirmed working
  `${REST}/cmn/clsfc/eduCurclmList:combo`,
  `${REST}/cmn/clsfc/schlClsList:combo?sEduCurclmCd=${CURRICULUM}`,
  `${REST}/cmn/clsfc/grdGrpList:combo?sEduCurclmCd=${CURRICULUM}&sSchlClsCd=s2`,
  `${REST}/cmn/clsfc/eduCurclmCorsSbjt?sEduCurclmCd=${CURRICULUM}&sSchlClsCd=s2`,
  `${REST}/acvmt/acvmtStd/acvmtStdList?sEduCurclmCd=${CURRICULUM}&page=0&size=1`,
  `${REST}/acvmt/acvmtStd/acvmtStd?sAcvmtStdSeq=3000722`,
  `${REST}/cmn/cmn/pageContById?sPageContId=AGREEMENT`,
  `${REST}/cmn/cmn/pageContById?sPageContId=FOOTER`,
  // probed and rejected — kept so the negative result is reproducible
  `${REST}`,
  `${REST}/acvmt/acvmtStd/acvmtStdDtl?sAcvmtStdSeq=3000722`,
  `${REST}/acvmt/acvmtStd/acvmtStdList:excel?sEduCurclmCd=${CURRICULUM}`,
  `${REST}/acvmt/acvmtStdEval/acvmtStdEvalList?sAcvmtStdSeq=3000722`,
  `${REST}/scrng/scrngStdTyp/scrngStdTypClsList:s2`,
  `${REST}/assmt/assmtEvalTask/assmtEvalTaskList?sSchlClsCd=s2&page=0&size=1`,
];

export async function discoverEndpoints({ delayMs = DEFAULT_DELAY_MS } = {}) {
  const results = [];
  for (const path of CANDIDATE_PATHS) {
    const { status, json, text } = await getJson(path, { delayMs });
    let shape = 'non-json';
    if (Array.isArray(json)) shape = `array[${json.length}]`;
    else if (json && typeof json === 'object') {
      shape = Array.isArray(json.content)
        ? `page{content[${json.content.length}], totalElements=${json.totalElements}}`
        : `object{${Object.keys(json).slice(0, 8).join(',')}}`;
    }
    const ok = status === 200 && json !== null && !json?.error && json?.status !== 404;
    results.push({ path, status, ok, shape, sample: text.slice(0, 160) });
    log(`${ok ? 'OK  ' : 'FAIL'} ${status} ${path} -> ${shape}`);
    await sleep(delayMs);
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* collect                                                             */
/* ------------------------------------------------------------------ */

const SCHOOL_LEVELS = [
  { code: 's1', key: 'elementary', label: '초등학교' },
  { code: 's2', key: 'middle', label: '중학교' },
  { code: 's3', key: 'high', label: '고등학교' },
];

/** Drop the null-heavy Spring base-DTO noise from a STAS record. */
const NOISE_KEYS = new Set([
  'regDttm', 'regtrId', 'regtrNm', 'regIp', 'modDttm', 'modfrId', 'modfrNm', 'modIp',
  'status', 'message', 'add', 'edit', 'selected', 'regUserNm', 'modUserNm',
  'rowSpan', 'rowSn', 'flagNew', 'new', 'delYn', 'goodPnt', 'badPnt', 'totalCnt',
]);

function slim(record) {
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (NOISE_KEYS.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      out[k] = v.map((item) => (item && typeof item === 'object' ? slim(item) : item));
    } else if (v && typeof v === 'object') {
      out[k] = slim(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function collectStandards({ out = 'sources/stas', delayMs = DEFAULT_DELAY_MS } = {}) {
  const outDir = resolve(REPO_ROOT, out);
  const rawDir = join(outDir, 'raw');
  mkdirSync(rawDir, { recursive: true });
  const effectiveDelay = Math.max(500, delayMs);

  const endpoints = [];
  const recordCountBySchoolLevel = {};
  let recordCount = 0;

  // 0. taxonomy combos (cheap, documents the code vocabulary)
  const curriculaPath = `${REST}/cmn/clsfc/eduCurclmList:combo`;
  const curricula = await getJson(curriculaPath, { delayMs: effectiveDelay });
  writeFileSync(join(rawDir, 'curricula.json'), JSON.stringify(curricula.json, null, 1));
  endpoints.push(curriculaPath);
  await sleep(effectiveDelay);

  const schoolsPath = `${REST}/cmn/clsfc/schlClsList:combo?sEduCurclmCd=${CURRICULUM}`;
  const schools = await getJson(schoolsPath, { delayMs: effectiveDelay });
  writeFileSync(join(rawDir, 'school-levels.json'), JSON.stringify(schools.json, null, 1));
  endpoints.push(schoolsPath);
  await sleep(effectiveDelay);

  const listPathTemplate = `${REST}/acvmt/acvmtStd/acvmtStdList?sEduCurclmCd=${CURRICULUM}&sSchlClsCd={level}&page=0&size=5000`;
  const detailPathTemplate = `${REST}/acvmt/acvmtStd/acvmtStd?sAcvmtStdSeq={seq}`;
  endpoints.push(listPathTemplate, detailPathTemplate);

  for (const level of SCHOOL_LEVELS) {
    // 1. list page (one request returns every standard for the level)
    const listPath = listPathTemplate.replace('{level}', level.code);
    const listRes = await getJson(listPath, { delayMs: effectiveDelay });
    const content = listRes.json?.content ?? [];
    const listFile = join(rawDir, `standards-${CURRICULUM}-${level.key}-list.json`);
    writeFileSync(
      listFile,
      JSON.stringify(
        {
          fetchedAt: new Date().toISOString(),
          endpoint: listPath,
          totalElements: listRes.json?.totalElements ?? content.length,
          records: content.map(slim),
        },
        null,
        1,
      ),
    );
    recordCountBySchoolLevel[level.key] = content.length;
    recordCount += content.length;
    log(`[list] ${level.key} (${level.label}) -> ${content.length} records`);
    await sleep(effectiveDelay);

    // 2. per-standard detail (평가기준 / 성취수준 / 해설 / 관련 성취기준)
    const detailFile = join(rawDir, `standards-${CURRICULUM}-${level.key}-detail.json`);
    const details = existsSync(detailFile)
      ? JSON.parse(readFileSync(detailFile, 'utf8')).records ?? []
      : [];
    const done = new Set(details.map((d) => d.acvmtStdSeq));
    let since = Date.now();
    for (const [index, row] of content.entries()) {
      if (done.has(row.acvmtStdSeq)) continue;
      const detailPath = detailPathTemplate.replace('{seq}', String(row.acvmtStdSeq));
      const res = await getJson(detailPath, { delayMs: effectiveDelay });
      if (res.status === 200 && res.json && !res.json.error) {
        details.push(slim(res.json));
      } else {
        details.push({ acvmtStdSeq: row.acvmtStdSeq, acvmtStdCd: row.acvmtStdCd, _error: res.status });
      }
      if (details.length % 100 === 0 || index === content.length - 1) {
        writeFileSync(
          detailFile,
          JSON.stringify(
            { fetchedAt: new Date().toISOString(), endpoint: detailPathTemplate, records: details },
            null,
            1,
          ),
        );
        log(`[detail] ${level.key} ${details.length}/${content.length} (${((Date.now() - since) / 1000).toFixed(0)}s)`);
        since = Date.now();
      }
      await sleep(effectiveDelay);
    }
    writeFileSync(
      detailFile,
      JSON.stringify(
        { fetchedAt: new Date().toISOString(), endpoint: detailPathTemplate, records: details },
        null,
        1,
      ),
    );
    log(`[detail] ${level.key} done -> ${details.length}`);
  }

  // 3. terms of use snapshot
  const termsPath = `${REST}/cmn/cmn/pageContById?sPageContId=AGREEMENT`;
  const terms = await getJson(termsPath, { delayMs: effectiveDelay });
  writeFileSync(join(rawDir, 'terms-agreement.json'), JSON.stringify(terms.json, null, 1));
  endpoints.push(termsPath);

  // 4. receipt
  const filesSha256 = {};
  for (const name of readdirSync(rawDir).sort()) {
    filesSha256[name] = createHash('sha256')
      .update(readFileSync(join(rawDir, name)))
      .digest('hex');
  }
  const receipt = {
    collectedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    curriculum: `${CURRICULUM}년 개정`,
    endpoints,
    recordCount,
    recordCountBySchoolLevel,
    filesSha256,
    termsNotice: TERMS_NOTICE,
  };
  writeFileSync(join(outDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  log(`receipt written: ${recordCount} records`);
  return receipt;
}

/* ------------------------------------------------------------------ */
/* match                                                               */
/* ------------------------------------------------------------------ */

/** Strict form: brackets and whitespace removed, everything else verbatim. */
const strictCode = (code) => String(code ?? '').replace(/[[\]\s]/g, '');

/**
 * Lenient form: also folds the notation differences observed between STAS and
 * this repo — fullwidth Roman numerals (STAS 「12미적Ⅰ-01-01」 vs repo
 * 「12미적I-01-01」) and en/em dashes used in place of the ASCII hyphen.
 */
const ROMAN = { 'Ⅰ': 'I', 'Ⅱ': 'II', 'Ⅲ': 'III', 'Ⅳ': 'IV', 'Ⅴ': 'V' };
const normalizeCode = (code) =>
  strictCode(code)
    .replace(/[Ⅰ-Ⅴ]/g, (c) => ROMAN[c])
    .replace(/[‐-―−]/g, '-');

function readRepoCodes() {
  const middle = JSON.parse(readFileSync(join(REPO_ROOT, 'data/kr/middle/standards.json'), 'utf8'));
  // Both high-school releases are read: `high` carries the 231 academic courses and
  // `high-vocational` the 528 specialised subjects (standards sharded by subject group).
  const readProfile = (profile, collection) => {
    const entry = JSON.parse(readFileSync(join(REPO_ROOT, `data/kr/${profile}/release.json`), 'utf8')).collections[collection];
    return (Array.isArray(entry) ? entry : [entry])
      .flatMap((file) => JSON.parse(readFileSync(join(REPO_ROOT, `data/kr/${profile}/${file}`), 'utf8')).records);
  };
  const highStandards = { records: [...readProfile('high', 'standards'), ...readProfile('high-vocational', 'standards')] };
  const highCourses = { records: [...readProfile('high', 'courses'), ...readProfile('high-vocational', 'courses')] };
  const generalCourseIds = new Set(
    highCourses.records
      .filter((c) => (c.programScopes ?? []).includes('all-high-schools'))
      .map((c) => c.id),
  );

  const sets = {
    middle: middle.records.map((r) => r.code),
    high: highStandards.records
      .filter((r) => generalCourseIds.has(r.courseId))
      .map((r) => r.code),
  };

  const elementaryFile = join(ELEMENTARY_REPO, 'data/kr/curriculum-standards.json');
  sets.elementary = existsSync(elementaryFile)
    ? JSON.parse(readFileSync(elementaryFile, 'utf8')).curricula.flatMap((c) =>
        c.standards.map((s) => s.code),
      )
    : [];
  return sets;
}

function compare(stasRaw, repoRaw, fold) {
  const stas = new Set(stasRaw.map(fold));
  const repo = new Set(repoRaw.map(fold));
  const matched = [...stas].filter((c) => repo.has(c));
  return {
    stasUnique: stas.size,
    repoUnique: repo.size,
    matched: matched.length,
    matchRateVsRepo: repo.size ? +((matched.length / repo.size) * 100).toFixed(2) : null,
    matchRateVsStas: stas.size ? +((matched.length / stas.size) * 100).toFixed(2) : null,
    stasOnly: [...stas].filter((c) => !repo.has(c)),
    repoOnly: [...repo].filter((c) => !stas.has(c)),
  };
}

export function matchAgainstRepos(rawDir = 'sources/stas/raw') {
  const dir = resolve(REPO_ROOT, rawDir);
  const repo = readRepoCodes();
  const report = {};
  for (const level of SCHOOL_LEVELS) {
    const file = join(dir, `standards-${CURRICULUM}-${level.key}-list.json`);
    if (!existsSync(file)) continue;
    const stasRaw = JSON.parse(readFileSync(file, 'utf8')).records.map((r) => r.acvmtStdCd);
    const repoRaw = repo[level.key] ?? [];
    const strict = compare(stasRaw, repoRaw, strictCode);
    const normalized = compare(stasRaw, repoRaw, normalizeCode);
    report[level.key] = {
      stasRecords: stasRaw.length,
      repoRecords: repoRaw.length,
      strict: { ...strict, stasOnly: strict.stasOnly.length, repoOnly: strict.repoOnly.length },
      normalized: {
        ...normalized,
        stasOnlyCount: normalized.stasOnly.length,
        repoOnlyCount: normalized.repoOnly.length,
        stasOnlySample: normalized.stasOnly.slice(0, 12),
        repoOnlySample: normalized.repoOnly.slice(0, 12),
        stasOnly: undefined,
        repoOnly: undefined,
      },
    };
  }
  return report;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv.includes('--discover')) {
    const results = await discoverEndpoints({ delayMs: Number(argValue('--delay', DEFAULT_DELAY_MS)) });
    console.log(JSON.stringify(results, null, 2));
  } else if (argv.includes('--collect')) {
    const receipt = await collectStandards({
      out: argValue('--out', 'sources/stas'),
      delayMs: Number(argValue('--delay', DEFAULT_DELAY_MS)),
    });
    console.log(JSON.stringify({ recordCount: receipt.recordCount, byLevel: receipt.recordCountBySchoolLevel }, null, 2));
  } else if (argv.includes('--match')) {
    console.log(JSON.stringify(matchAgainstRepos(argValue('--raw', 'sources/stas/raw')), null, 2));
  } else {
    console.log('usage: bun scripts/dev/collect-stas.mjs --discover | --collect [--out DIR] [--delay MS] | --match [--raw DIR]');
    process.exit(1);
  }
}
