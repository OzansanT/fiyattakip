import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approvedProductsUrl,
  fetchProductsByCategory,
  normalizeProductCount
} from '../server/trendyol-products.js';

const config = { sellerId: '1234', apiKey: 'key', apiSecret: 'secret' };

function product(id, categoryId, title, price = 100) {
  return {
    contentId: id,
    productMainId: `P-${id}`,
    title,
    brand: { id: 1, name: 'Brand' },
    category: { id: categoryId, name: categoryId === 12 ? 'Mouse' : 'Klavye' },
    variants: [{ barcode: `B-${id}`, salePrice: price, listPrice: price + 20, quantity: 3 }]
  };
}

function pageResponse(content, page, totalPages = 3) {
  return new Response(JSON.stringify({
    totalElements: 300,
    totalPages,
    page,
    size: 100,
    content
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('normalizes requested count and builds approved-products URL', () => {
  assert.equal(normalizeProductCount(0), 1);
  assert.equal(normalizeProductCount(10), 10);
  assert.equal(normalizeProductCount(999), 100);
  const url = new URL(approvedProductsUrl(1234, 2, 100));
  assert.equal(url.pathname, '/integration/product/sellers/1234/products/approved');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('size'), '100');
});

test('scans pages only after explicit call and stops when requested category count is found', async () => {
  let calls = 0;
  const fakeFetch = async url => {
    calls += 1;
    const page = Number(new URL(url).searchParams.get('page'));
    if (page === 0) return pageResponse([product(1, 13, 'Keyboard')], 0);
    return pageResponse([product(2, 12, 'Mouse A', 799), product(3, 12, 'Mouse B', 899)], 1);
  };

  assert.equal(calls, 0);
  const result = await fetchProductsByCategory(12, 2, config, { fetchImpl: fakeFetch, pageSize: 100, maxPages: 10 });
  assert.equal(calls, 2);
  assert.equal(result.found, 2);
  assert.equal(result.pagesScanned, 2);
  assert.deepEqual(result.products.map(item => item.title), ['Mouse A', 'Mouse B']);
  assert.equal(result.products[0].salePrice, 799);
});

test('hard page cap prevents runaway category scans', async () => {
  let calls = 0;
  const fakeFetch = async url => {
    calls += 1;
    const page = Number(new URL(url).searchParams.get('page'));
    return pageResponse([product(page + 1, 13, 'Other')], page, 999);
  };
  const result = await fetchProductsByCategory(12, 10, config, { fetchImpl: fakeFetch, pageSize: 100, maxPages: 3 });
  assert.equal(calls, 3);
  assert.equal(result.found, 0);
  assert.equal(result.scanCapped, true);
});

test('concurrent same category/count requests share one scan', async () => {
  let calls = 0;
  const fakeFetch = async url => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    const page = Number(new URL(url).searchParams.get('page'));
    return pageResponse([product(1, 12, 'Mouse')], page, 1);
  };
  const [a, b] = await Promise.all([
    fetchProductsByCategory(12, 1, config, { fetchImpl: fakeFetch }),
    fetchProductsByCategory(12, 1, config, { fetchImpl: fakeFetch })
  ]);
  assert.equal(calls, 1);
  assert.equal(a.found, 1);
  assert.equal(b.found, 1);
});
