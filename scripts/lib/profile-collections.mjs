import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// The high-school product ships as two releases. `high` carries the 231 courses every high school
// can offer; `high-vocational` carries the 528 specialised vocational subjects that are 93.8% of
// the high-school records and outside the tutor product scope. Ids are minted once in the `high`
// namespace and never change, so a record only moves between files.
export const profileNames = ['middle', 'high', 'high-vocational', 'bridges'];

export const releaseIds = {
  middle: 'kr-2022-middle-v0.6.0-candidate',
  high: 'kr-2022-high-v0.6.0-candidate',
  'high-vocational': 'kr-2022-high-vocational-v0.6.0-candidate',
  bridges: 'kr-2022-middle-high-bridge-v0.6.0-candidate',
};

export const profileSchemaNames = {
  middle: 'middle-profile',
  high: 'high-profile',
  'high-vocational': 'high-vocational-profile',
  bridges: 'bridge-profile',
};

// `high-vocational` standards and topics exceed the 25 MB per-file limit as one document, so they
// are sharded by subject group. The slug is part of the published path and must stay stable.
export const vocationalSubjectGroupSlugs = {
  '건축·토목': 'construction',
  '경영·금융': 'business-finance',
  '관광·레저': 'tourism-leisure',
  '기계': 'machinery',
  '농림·축산': 'agriculture',
  '문화·예술·디자인·방송': 'culture-art-media',
  '미용': 'beauty',
  '보건·복지': 'health-welfare',
  '섬유·의류': 'textile-fashion',
  '수산·해운': 'fisheries-shipping',
  '식품·조리': 'food-cooking',
  '융복합·지식재산': 'convergence-ip',
  '재료': 'materials',
  '전기·전자': 'electric-electronics',
  '전문 공통': 'specialized-common',
  '정보·통신': 'it-telecom',
  '화학공업': 'chemical',
  '환경·안전·소방': 'env-safety-fire',
};

export const shardedCollections = { 'high-vocational': ['standards', 'topics'] };

export const shardDirectories = { standards: 'standards', topics: 'topics' };

/** A release collection entry is either one filename or an ordered list of shard paths. */
export const collectionFiles = (entry) => (Array.isArray(entry) ? entry : [entry]);

export async function readRelease(root, profile) {
  return JSON.parse(await readFile(join(root, 'data/kr', profile, 'release.json'), 'utf8'));
}

/** Concatenates the records of a single-file or sharded collection in release order. */
export async function readCollectionRecords(root, profile, entry) {
  const records = [];
  for (const file of collectionFiles(entry)) {
    records.push(...JSON.parse(await readFile(join(root, 'data/kr', profile, file), 'utf8')).records);
  }
  return records;
}

/** Resolves a collection through the profile release so callers never hard-code shard paths. */
export async function readProfileCollection(root, profile, collectionName, release) {
  const resolved = release ?? await readRelease(root, profile);
  const entry = resolved.collections[collectionName];
  if (!entry) throw new Error(`${profile}/release.json has no collection ${collectionName}`);
  return readCollectionRecords(root, profile, entry);
}
