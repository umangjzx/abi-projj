/**
 * Unit tests for the pure algorithm helpers -- no database required.
 * Run with: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTfidfIndex,
  searchTfidf,
  fuzzyMatch,
  tokenize,
  stem,
  trigramSimilarity,
} from '../src/lib/tfidf';
import { kmeans, standardize, logScale, silhouetteScore, chooseK } from '../src/lib/kmeans';
import { fitHoltWinters, forecastHoltWinters } from '../src/lib/holt-winters';

// --------------------------------------------------------------- tfidf / bm25 ---

test('stem folds plurals and common verb endings', () => {
  assert.equal(stem('eggs'), 'egg');
  assert.equal(stem('berries'), 'berry');
  assert.equal(stem('baking'), 'bak');
  assert.equal(stem('glasses'), 'glass');
  assert.equal(stem('milk'), 'milk');
});

test('tokenize expands domain synonyms both ways', () => {
  const tokens = tokenize('curd');
  assert.ok(tokens.includes('curd'));
  assert.ok(tokens.includes(stem('yoghurt')));
});

test('BM25 ranks the document that matches more query terms first', () => {
  const index = buildTfidfIndex([
    { id: 'a', tokens: tokenize('fresh full cream milk one litre') },
    { id: 'b', tokens: tokenize('milk chocolate bar') },
    { id: 'c', tokens: tokenize('paneer cubes') },
  ]);
  const results = searchTfidf('fresh milk', index);
  assert.equal(results[0].id, 'a');
  assert.ok(!results.some((r) => r.id === 'c')); // no term overlap -> omitted
});

test('BM25 down-weights a term that appears in every document (low IDF)', () => {
  const index = buildTfidfIndex([
    { id: 'a', tokens: tokenize('dairy milk') },
    { id: 'b', tokens: tokenize('dairy curd') },
    { id: 'c', tokens: tokenize('dairy butter') },
  ]);
  // "dairy" is in every doc, so a query for it alone should not strongly
  // separate them -- scores are near-equal.
  const results = searchTfidf('dairy', index);
  const spread = results[0].score - results[results.length - 1].score;
  assert.ok(spread < 0.2, `expected near-equal scores, spread was ${spread}`);
});

test('fuzzyMatch recovers from a typo when BM25 finds nothing', () => {
  const index = buildTfidfIndex([
    { id: 'a', tokens: tokenize('cheese cheddar block') },
    { id: 'b', tokens: tokenize('paneer fresh') },
  ]);
  assert.equal(searchTfidf('chesse', index).length, 0); // exact lexical miss
  const fuzzy = fuzzyMatch('chesse', index);
  assert.equal(fuzzy[0]?.id, 'a');
});

test('trigramSimilarity is 1 for identical strings and low for unrelated ones', () => {
  assert.equal(trigramSimilarity('cheese', 'cheese'), 1);
  assert.ok(trigramSimilarity('cheese', 'tractor') < 0.2);
});

// --------------------------------------------------------------------- kmeans ---

test('standardize gives each column mean 0 and unit variance', () => {
  const scaled = standardize([
    [1, 100],
    [2, 200],
    [3, 300],
    [4, 400],
  ]);
  const col0 = scaled.map((r) => r[0]);
  const mean = col0.reduce((a, b) => a + b, 0) / col0.length;
  assert.ok(Math.abs(mean) < 1e-9);
  const variance = col0.reduce((s, v) => s + (v - mean) ** 2, 0) / col0.length;
  assert.ok(Math.abs(variance - 1) < 1e-9);
});

test('logScale only transforms the requested columns', () => {
  const [row] = logScale([[0, 99]], [1]);
  assert.equal(row[0], 0);
  assert.equal(row[1], Math.log1p(99));
});

test('kmeans separates two obvious clusters with a high silhouette', () => {
  const points = [
    [0, 0], [0.1, 0.1], [0, 0.2], [0.2, 0],
    [10, 10], [10.1, 9.9], [9.9, 10.2], [10.2, 10],
  ];
  const result = kmeans(points, 2, { seed: 1, restarts: 5 });
  // the four low points share a cluster, the four high points share the other
  const first = result.assignments[0];
  assert.ok(result.assignments.slice(0, 4).every((a) => a === first));
  assert.ok(result.assignments.slice(4).every((a) => a !== first));
  assert.ok(result.silhouette > 0.8);
});

test('silhouetteScore is higher for the correct k', () => {
  const points = [
    [0, 0], [0.2, 0.1], [0, 0.2],
    [5, 5], [5.1, 4.9], [4.9, 5.2],
    [0, 5], [0.1, 5.1], [0.2, 4.9],
  ];
  const twoClusters = kmeans(points, 2, { seed: 3, restarts: 5 });
  const threeClusters = kmeans(points, 3, { seed: 3, restarts: 5 });
  assert.ok(threeClusters.silhouette > twoClusters.silhouette);
  assert.ok(silhouetteScore(points, threeClusters.assignments, 3) > 0.5);
});

test('chooseK lands on the natural cluster count', () => {
  const points = [
    [0, 0], [0.2, 0.1], [0.1, 0.2], [0, 0.1],
    [8, 8], [8.2, 7.9], [7.9, 8.1], [8.1, 8.2],
  ];
  const { k } = chooseK(points, { min: 2, max: 5, seed: 2 });
  assert.equal(k, 2);
});

// -------------------------------------------------------------- holt-winters ---

test('fitHoltWinters needs at least two full seasons', () => {
  assert.equal(fitHoltWinters([1, 2, 3, 4, 5, 6, 7], 7), null);
});

test('Holt-Winters projects a rising, weekly-seasonal series forward', () => {
  // 4 weeks: weekend spike, gentle upward trend
  const weekly = [10, 12, 11, 13, 12, 30, 28];
  const series = [
    ...weekly,
    ...weekly.map((v) => v + 3),
    ...weekly.map((v) => v + 6),
    ...weekly.map((v) => v + 9),
  ];
  const fit = fitHoltWinters(series, 7);
  assert.ok(fit, 'expected a fit');
  const projection = forecastHoltWinters(fit!, 7);
  assert.equal(projection.length, 7);
  // day 6 of the cycle (index 5) is the weekend spike -> clearly the largest
  const maxIdx = projection.indexOf(Math.max(...projection));
  assert.ok(maxIdx === 5 || maxIdx === 6, `weekend spike not carried forward (peak at ${maxIdx})`);
  // trend is upward, so the projected week should exceed the last observed one
  assert.ok(projection.reduce((a, b) => a + b, 0) > series.slice(-7).reduce((a, b) => a + b, 0));
});
