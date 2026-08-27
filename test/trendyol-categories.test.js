import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CACHE_TTL_MS,
  cacheIsFresh,
  countCategoryTree,
  fetchTrendyolCategoryTree,
  getCategoryCache,
  writeCategoryCache
} from '../server/trendyol-categories.js';
import {
  categoryLevels,
  findCategoryPath,
  isLeafCategory,
  selectedCategory,
  selectedCategoryPath
} from '../js/trendyol-categories.js';

const tree = [
  {
    id: 10,
    name: 'Elektronik',
    subCategories: [
      {
        id: 11,
        name: 'Bilgisayar',
        parentId: 10,
        subCategories: [
          { id: 12, name: 'Mouse', parentId: 11, subCategories: [] },
          { id: 13, name: 'Klavye', parentId: 11, subCategories: [] }
        ]
      }
    ]
  },
  { id: 20, name: 'Ev', subCategories: [] }
];

test('counts all categories, leaves and tree depth', () => {
  assert.deepEqual(countCategoryTree(tree), { total: 5, leaves: 3, maxDepth: 3 });
});

test('cache freshness uses the 24-hour TTL', () => {
  const now = Date.parse('2026-08-27T12:00:00.000Z');
  assert.equal(cacheIsFresh({ fetchedAt: '2026-08-27T11:00:00.000Z' }, now), true);
  assert.equal(cacheIsFresh({ fetchedAt: new Date(now - CACHE_TTL_MS).toISOString() }, now), false);
});

test('navigates Trendyol categories level by level and identifies leaves', () => {
  const levels = categoryLevels(tree, [10, 11, 12]);
  assert.equal(levels.length, 3);
  assert.deepEqual(levels[0].map(x => x.id), [10, 20]);
  assert.deepEqual(levels[1].map(x => x.id), [11]);
  assert.deepEqual(levels[2].map(x => x.id), [12, 13]);
  assert.equal(selectedCategory(tree, [10, 11, 12]).name, 'Mouse');
  assert.deepEqual(selectedCategoryPath(tree, [10, 11, 12]), ['Elektronik', 'Bilgisayar', 'Mouse']);
  assert.equal(isLeafCategory(selectedCategory(tree, [10, 11, 12])), true);
  assert.deepEqual(findCategoryPath(tree, 13), [10, 11, 13]);
});

test('Trendyol client sends Basic Auth and required user agent', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ categories: tree }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const categories = await fetchTrendyolCategoryTree({
    sellerId: '1234',
    apiKey: 'key',
    apiSecret: 'secret'
  }, fakeFetch);

  assert.equal(categories.length, 2);
  assert.equal(request.options.headers.Authorization, `Basic ${Buffer.from('key:secret').toString('base64')}`);
  assert.equal(request.options.headers['User-Agent'], '1234 - SelfIntegration');
  assert.equal(request.options.headers.storefrontcode, 'TR');
});

test('fresh cache avoids a network request', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fiyattakip-'));
  const cachePath = path.join(dir, 'categories.json');
  const now = Date.parse('2026-08-27T12:00:00.000Z');
  await writeCategoryCache({
    fetchedAt: '2026-08-27T11:00:00.000Z',
    stats: countCategoryTree(tree),
    categories: tree
  }, cachePath);

  let called = false;
  const result = await getCategoryCache({}, {
    cachePath,
    now,
    fetchImpl: async () => { called = true; throw new Error('should not fetch'); }
  });

  assert.equal(called, false);
  assert.equal(result.refreshed, false);
  assert.equal(result.stale, false);
  await rm(dir, { recursive: true, force: true });
});

test('stale cache remains available when refresh fails', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fiyattakip-'));
  const cachePath = path.join(dir, 'categories.json');
  const now = Date.parse('2026-08-27T12:00:00.000Z');
  await writeCategoryCache({
    fetchedAt: '2026-08-25T11:00:00.000Z',
    stats: countCategoryTree(tree),
    categories: tree
  }, cachePath);

  const result = await getCategoryCache({ sellerId: '1', apiKey: 'x', apiSecret: 'y' }, {
    cachePath,
    now,
    fetchImpl: async () => { throw new Error('network down'); }
  });

  assert.equal(result.stale, true);
  assert.match(result.refreshError, /network down/);
  assert.equal(result.categories[0].name, 'Elektronik');
  await rm(dir, { recursive: true, force: true });
});
