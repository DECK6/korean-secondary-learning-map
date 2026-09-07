import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RDF, classifyTerm, iriToHostedPath, literal, pathExists, resolveIriCoverage, scanTurtle } from '../scripts/lib/iri-hosting.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('iri hosting', () => {
  test('IRIs map to GitHub Pages paths the way the site serves them', () => {
    expect(iriToHostedPath('https://dexa.art/learnmap/secondary/ontology#LearningRelation')).toBe('learnmap/secondary/ontology/index.html');
    expect(iriToHostedPath('https://dexa.art/learnmap/secondary/ontology/0.6.0-candidate')).toBe('learnmap/secondary/ontology/0.6.0-candidate/index.html');
    expect(iriToHostedPath('https://dexa.art/learnmap/schema/secondary/core.schema.json')).toBe('learnmap/schema/secondary/core.schema.json');
    expect(iriToHostedPath('https://dexa.art/learnmap/secondary/resource/x%3Ay')).toBe('learnmap/secondary/resource/x:y/index.html');
    expect(iriToHostedPath('https://dexa.art/learnmap/#/topic/kr.mt.x')).toBe('learnmap/index.html');
  });

  test('the Turtle scanner reads the one-line TBox style completely', async () => {
    const tbox = scanTurtle(await readFile(path.join(ROOT, 'ontology', 'learning-map.ttl'), 'utf8'));
    const kinds = {};
    for (const term of tbox.terms) kinds[classifyTerm(term)] = (kinds[classifyTerm(term)] ?? 0) + 1;
    expect(kinds.class).toBe(23);
    expect(kinds.objectProperty).toBe(24);
    expect(kinds.datatypeProperty).toBe(50);
    const series = tbox.terms.find((term) => term.iri === 'https://dexa.art/learnmap/secondary/ontology');
    expect(literal(series, RDF.versionInfo)).toBe('0.6.0-candidate');
    const candidate = tbox.terms.find((term) => term.iri === 'https://dexa.art/learnmap/secondary/ontology#CandidateLearningRelation');
    expect(literal(candidate, RDF.comment, 'ko')).toContain('권장 순서');
  });

  test('resource IRIs are covered by the prefix landing document', () => {
    const coverage = resolveIriCoverage(new Set(['https://dexa.art/learnmap/secondary/resource/a', 'https://dexa.art/learnmap/vocab/facet/concept']), {
      hostedPaths: ['learnmap/secondary/resource/index.html'],
      assumedPrefixes: ['learnmap/vocab/'],
      prefixLandings: [{ iriPrefix: 'https://dexa.art/learnmap/secondary/resource/', path: 'learnmap/secondary/resource/index.html' }],
    });
    expect(coverage.uncovered).toEqual([]);
    expect(coverage.covered.map((entry) => entry.coveredBy)).toEqual(['prefix-landing', 'assumed']);
  });

  test('the sibling repository carries the same iri-hosting module', async () => {
    const sibling = path.join(ROOT, '..', 'korean-elementary-learning-map', 'scripts', 'lib', 'iri-hosting.mjs');
    if (!(await pathExists(sibling))) return;
    const [ours, theirs] = await Promise.all([readFile(path.join(ROOT, 'scripts', 'lib', 'iri-hosting.mjs')), readFile(sibling)]);
    expect(ours.equals(theirs)).toBe(true);
  });
});
