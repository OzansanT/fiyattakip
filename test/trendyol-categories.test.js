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
  flattenLeafCategories,
  getCategoryCache,
  writeCategoryCache
} from '../server/trendyol-categories.js';
import {
  loadTrendyolCategoryNames,
  loadTrendyolCategoryProducts,
  refreshTrendyolCategoryNames
} from '../js/trendyol-categories.js';

const tree = [
  {
    id: 10,
    name: 'Elektronik',
    subCategories: [
      { id: 11, name: 'Bilgisayar', parentId: 10, subCategories: [
        { id: 12, name: 'Mouse', parentId: 11, subCategories: [] },
        { id: 13, name: 'Klavye', parentId: 11, subCategories: [] }
      ] }
    ]
  },
  { id: 20, name: 'Ev', subCategories: [] }
];
const config = { sellerId: '1234', apiKey: 'key', apiSecret: 'secret' };

function categoryResponse() {
  return new Response(JSON.stringify({ categories: tree }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

test('flattens only leaf category names with full paths', () => {
  const leaves = flattenLeafCategories(tree);
  assert.deepEqual(leaves.map(item => item.id).sort((a, b) => a - b), [12, 13, 20]);
  assert.equal(leaves.find(item => item.id === 12).path, 'Elektronik → Bilgisayar → Mouse');
  assert.equal(leaves.find(item => item.id === 12).pathIds.join(','), '10,11,12');
});

test('counts categories and cache freshness', () => {
  assert.deepEqual(countCategoryTree(tree), { total: 5, leaves: 3, maxDepth: 3 });
  const now = Date.parse('2026-08-27T12:00:00.000Z');
  assert.equal(cacheIsFresh({ fetchedAt: '2026-08-27T11:00:00.000Z' }, now), true);
  assert.equal(cacheIsFresh({ fetchedAt: new Date(now - CACHE_TTL_MS).toISOString() }, now), false);
});

test('category client sends secure Trendyol headers', async () => {
  let request;
  const categories = await fetchTrendyolCategoryTree(config, async (url, options) => {
    request = { url, options };
    return categoryResponse();
  });
  assert.equal(categories.length, 2);
  assert.equal(request.options.headers.Authorization, `Basic ${Buffer.from('key:secret').toString('base64')}`);
  assert.equal(request.options.headers['User-Agent'], '1234 - SelfIntegration');
});

test('fresh cache avoids network and concurrent stale consumers share one fetch', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fiyattakip-'));
  const freshPath = path.join(dir, 'fresh.json');
  const now = Date.parse('2026-08-27T12:00:00.000Z');
  await writeCategoryCache({ fetchedAt: '2026-08-27T11:00:00.000Z', stats: countCategoryTree(tree), categories: tree }, freshPath);
  let called = false;
  await getCategoryCache({}, { cachePath: freshPath, now, fetchImpl: async () => { called = true; throw new Error('no'); } });
  assert.equal(called, false);

  const stalePath = path.join(dir, 'stale.json');
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return categoryResponse();
  };
  await Promise.all([
    getCategoryCache(config, { cachePath: stalePath, fetchImpl: fakeFetch }),
    getCategoryCache(config, { cachePath: stalePath, fetchImpl: fakeFetch })
  ]);
  assert.equal(calls, 1);
  await rm(dir, { recursive: true, force: true });
});

test('browser category names are explicit requests, not automatic bulk routes', async () => {
  const requests = [];
  const fakeFetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ categories: [{ id: 12, name: 'Mouse', path: 'Elektronik → Mouse' }] }), { status: 200 });
  };
  await loadTrendyolCategoryNames(fakeFetch);
  await refreshTrendyolCategoryNames(fakeFetch);
  assert.deepEqual(requests.map(item => item.url), [
    '/api/trendyol/category-names',
    '/api/trendyol/category-names/refresh'
  ]);
  assert.deepEqual(requests.map(item => item.options.method), ['GET', 'POST']);
});

test('browser product request includes only selected category and requested count', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ products: [] }), { status: 200 });
  };
  await loadTrendyolCategoryProducts(12, 25, fakeFetch);
  assert.equal(request.url, '/api/trendyol/categories/12/products?limit=25');
  assert.equal(request.options.method, 'GET');
});
