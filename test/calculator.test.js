import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../js/calculator.js';

test('calculates profit, ROI and margin', () => {
  const result = calculate({
    salePrice: 1000,
    purchasePrice: 500,
    commissionRate: 10,
    advertisingRate: 2,
    returnReserveRate: 3,
    shipping: 50,
    packaging: 10,
    other: 0,
    targetRoi: 25
  });

  assert.equal(result.commission, 100);
  assert.equal(result.advertising, 20);
  assert.equal(result.returnReserve, 30);
  assert.equal(result.marketplaceAndOperatingCosts, 210);
  assert.equal(result.profit, 290);
  assert.equal(result.roi, 58);
  assert.equal(result.margin, 29);
});

test('reverse calculation returns maximum buy price for target ROI', () => {
  const result = calculate({
    salePrice: 1000,
    purchasePrice: 500,
    commissionRate: 10,
    advertisingRate: 0,
    returnReserveRate: 0,
    shipping: 50,
    packaging: 0,
    other: 0,
    targetRoi: 25
  });

  assert.equal(result.maxPurchasePrice, 680);
  assert.equal(result.requiredSalePrice, 750);
});

test('break-even price accounts for percentage and fixed costs', () => {
  const result = calculate({
    salePrice: 800,
    purchasePrice: 400,
    commissionRate: 20,
    shipping: 80,
    packaging: 0,
    advertisingRate: 0,
    returnReserveRate: 0,
    targetRoi: 0
  });

  assert.equal(result.breakEvenSalePrice, 600);
});

test('invalid and negative inputs are safely normalized', () => {
  const result = calculate({
    salePrice: 'not-a-number',
    purchasePrice: -5,
    commissionRate: -10,
    shipping: -100
  });

  assert.equal(result.salePrice, 0);
  assert.equal(result.purchasePrice, 0);
  assert.equal(result.profit, 0);
  assert.equal(result.maxPurchasePrice, 0);
});
