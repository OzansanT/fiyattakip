import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ATTRIBUTE_CACHE_TTL_MS,
  CACHE_TTL_MS,
  cacheIsFresh,
  countCategoryTree,
  fetchTrendyolCategoryAttributes,
  fetchTrendyolCategoryTree,
  getCategoryAttributeCache,
  getCategoryCache,
  writeCategoryCache
} from '../server/trendyol-categories.js';
import {
  categoryLevels,
  findCategoryPath,
  isLeafCategory,
  loadTrendyolCategoryAttributes,
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

const config = { sellerId: '1234', apiKey: 'key', apiSecret: 'secret' };

function categoryResponse() {
  return new Response(JSON.stringify({ categories: tree }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function attributeResponse(categoryId = 12) {
  return new Response(JSON.stringify({
    id: categoryId,
    name: categoryId === 12 ? 'Mouse' : 'Klavye',
    categoryAttributes: [
      { categoryId, attribute: { id: 1, name: 'Marka' }, required: true, allowCustom: false },
      { categoryId, attribute: { id: 2, name: 'Renk' }, required: false, allowCustom: true }
    ]
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

test('counts all categories, leaves and tree depth', () => {
  assert.deepEqual(countCategoryTree(tree), { total: 5, leaves: 3, maxDepth: 3 });
});

test('cache freshness uses configurable TTL values', () => {
  const now = Date.parse('2026-08-27T12:00:00.000Z');
  assert.equal(cacheIsFresh({ fetchedAt: '2026-08-27T11:00:00.000Z' }, now), true);
  assert.equal(cacheIsFresh({ fetchedAt: new Date(now - CACHE_TTL_MS).toISOString() }, now), false);
  assert.equal(cacheIsFresh({ fetchedAt: new Date(now - 2 * CACHE_TTL_MS).toISOString() }, now, ATTRIBUTE_CACHE_TTL_MS), true);
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

test('Trendyol category client sends Basic Auth and required user agent', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options };
    return categoryResponse();
  };

  const categories = await fetchTrendyolCategoryTree(config, fakeFetch);

  assert.equal(categories.length, 2);
  assert.equal(request.options.headers.Authorization, `Basic ${Buffer.from('key:secret').toString('base64')}`);
  assert.equal(request.options.headers['User-Agent'], '1234 - SelfIntegration');
  assert.equal(request.options.headers.storefrontcode, 'TR');
});

test('fresh category cache avoids a network request', async () => {
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

test('concurrent category consumers share one upstream tree fetch', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fiyattakip-'));
  const cachePath = path.join(dir, 'categories.json');
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 15));
    return categoryResponse();
  };

  const [a, b, c] = await Promise.all([
    getCategoryCache(config, { cachePath, fetchImpl: fakeFetch }),
    getCategoryCache(config, { cachePath, fetchImpl: fakeFetch }),
    getCategoryCache(config, { cachePath, fetchImpl: fakeFetch })
  ]);

  assert.equal(calls, 1);
  assert.equal(a.categories.length, 2);
  assert.equal(b.categories.length, 2);
  assert.equal(c.categories.length, 2);
  await rm(dir, { recursive: true, force: true });
});

test('stale category cache remains available when refresh fails', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fiyattakip-'));
  const cachePath = path.join(dir, 'categories.json');
  const now = Date.parse('2026-08-27T12:00:00.000Z');
  await writeCategoryCache({
    fetchedAt: '2026-08-25T11:00:00.000Z',
    stats: countCategoryTree(tree),
    categories: tree
  }, cachePath);

  const result = await getCategoryCache(config, {
    cachePath,
    now,
    fetchImpl: async () => { throw new Error('network down'); }
  });

  assert.equal(result.stale, true);
  assert.match(result.refreshError, /network down/);
  assert.equal(result.categories[0].name, 'Elektronik');
  await rm(dir, { recursive: true, force: true });
});

test('leaf attribute client uses only the requested V2 category endpoint', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options };
    return attributeResponse(12);
  };

  const result = await fetchTrendyolCategoryAttributes(12, config, fakeFetch);
  assert.equal(result.categoryId, 12);
  assert.equal(result.attributes.length, 2);
  assert.equal(request.url, 'https://apigw.trendyol.com/integration/product/categories/12/attributes');
  assert.equal(request.options.headers.Authorization, `Basic ${Buffer.from('key:secret').toString('base64')}`);
});

test('leaf attributes are cached per category and do not refetch while fresh', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fiyattakip-'));
  const now = Date.parse('2026-08-27T12:00:00.000Z');
  let calls = 0;
  const fakeFetch = async url => {
    calls += 1;
    assert.match(url, /\/categories\/12\/attributes$/);
    return attributeResponse(12);
  };

  const first = await getCategoryAttributeCache(12, config, { cacheDir: dir, now, fetchImpl: fakeFetch });
  const second = await getCategoryAttributeCache(12, config, { cacheDir: dir, now: now + 1000, fetchImpl: fakeFetch });

  assert.equal(calls, 1);
  assert.equal(first.refreshed, true);
  assert.equal(second.refreshed, false);
  assert.deepEqual(second.stats, { total: 2, required: 1 });
  await rm(dir, { recursive: true, force: true });
});

test('concurrent requests for the same leaf attributes share one upstream call', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fiyattakip-'));
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 15));
    return attributeResponse(12);
  };

  const [a, b] = await Promise.all([
    getCategoryAttributeCache(12, config, { cacheDir: dir, fetchImpl: fakeFetch }),
    getCategoryAttributeCache(12, config, { cacheDir: dir, fetchImpl: fakeFetch })
  ]);

  assert.equal(calls, 1);
  assert.equal(a.attributes.length, 2);
  assert.equal(b.attributes.length, 2);
  await rm(dir, { recursive: true, force: true });
});

test('browser attribute client requests one selected leaf and never a bulk endpoint', async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ categoryId: 12, attributes: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  await loadTrendyolCategoryAttributes(12, fakeFetch);
  assert.equal(request.url, '/api/trendyol/categories/12/attributes');
  assert.equal(request.options.method, 'GET');
});
