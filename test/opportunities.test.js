import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpportunity, filterOpportunities, sortOpportunities } from '../js/opportunities.js';

const sampleInputs = {
  salePrice: 1000,
  purchasePrice: 500,
  commissionRate: 10,
  advertisingRate: 2,
  returnReserveRate: 3,
  shipping: 50,
  packaging: 10,
  other: 0,
  targetRoi: 25
};

test('buildOpportunity snapshots calculator inputs and derived metrics', () => {
  const item = buildOpportunity({ name: '  Test Product  ', category: 'electronics', inputs: sampleInputs });
  assert.equal(item.name, 'Test Product');
  assert.equal(item.category, 'electronics');
  assert.equal(item.purchasePrice, 500);
  assert.equal(item.salePrice, 1000);
  assert.equal(item.profit, 290);
  assert.ok(Math.abs(item.roi - 58) < 1e-9);
  assert.notEqual(item.inputs, sampleInputs);
  assert.deepEqual(item.inputs, sampleInputs);
});

test('buildOpportunity falls back to a safe product name', () => {
  const item = buildOpportunity({ name: '   ', inputs: {} });
  assert.equal(item.name, 'Adsız Ürün');
});

test('filterOpportunities searches name/category and combines ROI/status filters', () => {
  const items = [
    { id: 'a', name: 'Mouse A', category: 'electronics', roi: 35, status: 'good' },
    { id: 'b', name: 'Koltuk', category: 'home', roi: 12, status: 'bad' },
    { id: 'c', name: 'Mouse Pad', category: 'electronics', roi: 45, status: 'excellent' }
  ];

  assert.deepEqual(filterOpportunities(items, { query: 'mouse' }).map(x => x.id), ['a', 'c']);
  assert.deepEqual(filterOpportunities(items, { query: 'HOME' }).map(x => x.id), ['b']);
  assert.deepEqual(filterOpportunities(items, { minRoi: 30 }).map(x => x.id), ['a', 'c']);
  assert.deepEqual(filterOpportunities(items, { minRoi: '', status: 'bad' }).map(x => x.id), ['b']);
  assert.deepEqual(filterOpportunities(items, { minRoi: 40, status: 'excellent' }).map(x => x.id), ['c']);
});

test('empty ROI filter does not hide negative-ROI opportunities', () => {
  const items = [{ id: 'loss', name: 'Loss', roi: -5, status: 'bad' }];
  assert.deepEqual(filterOpportunities(items, { minRoi: '' }).map(x => x.id), ['loss']);
});

test('sortOpportunities supports ROI, profit, safety margin and capital order', () => {
  const items = [
    { id: 'a', roi: 10, profit: 300, safetyMargin: 20, purchasePrice: 900 },
    { id: 'b', roi: 35, profit: 100, safetyMargin: 50, purchasePrice: 400 },
    { id: 'c', roi: 20, profit: 500, safetyMargin: -10, purchasePrice: 600 }
  ];

  assert.deepEqual(sortOpportunities(items, 'roi').map(x => x.id), ['b', 'c', 'a']);
  assert.deepEqual(sortOpportunities(items, 'profit').map(x => x.id), ['c', 'a', 'b']);
  assert.deepEqual(sortOpportunities(items, 'safetyMargin').map(x => x.id), ['b', 'a', 'c']);
  assert.deepEqual(sortOpportunities(items, 'purchasePrice').map(x => x.id), ['b', 'c', 'a']);
  assert.deepEqual(items.map(x => x.id), ['a', 'b', 'c']);
});

test('default sort uses most recent timestamp first', () => {
  const items = [
    { id: 'old', updatedAt: '2026-08-20T10:00:00.000Z' },
    { id: 'new', updatedAt: '2026-08-27T10:00:00.000Z' }
  ];
  assert.deepEqual(sortOpportunities(items).map(x => x.id), ['new', 'old']);
});
