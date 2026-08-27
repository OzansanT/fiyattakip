import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalizedNumber, parseOpportunityImport } from '../js/importer.js';

test('parseLocalizedNumber supports Turkish and international price formats', () => {
  assert.equal(parseLocalizedNumber('1.250,50 ₺'), 1250.5);
  assert.equal(parseLocalizedNumber('1,250.50'), 1250.5);
  assert.equal(parseLocalizedNumber('499,90'), 499.9);
  assert.equal(parseLocalizedNumber(125), 125);
});

test('imports comma-delimited CSV with quoted product names', () => {
  const csv = 'name,purchasePrice,salePrice,category\n"Mouse, Wireless",420,799,electronics\nKeyboard,700,1299,electronics';
  const result = parseOpportunityImport(csv, 'products.csv');

  assert.equal(result.errors.length, 0);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0], {
    name: 'Mouse, Wireless',
    category: 'electronics',
    purchasePrice: 420,
    salePrice: 799
  });
});

test('imports Turkish semicolon CSV with decimal comma values', () => {
  const csv = 'Ürün adı;Alış fiyatı;Satış fiyatı;Kategori;Komisyon\nMouse;499,90;899,90;electronics;12\nKlavye;1.250,50;1.899,90;electronics;10';
  const result = parseOpportunityImport(csv, 'tedarik.csv');

  assert.equal(result.errors.length, 0);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].purchasePrice, 499.9);
  assert.equal(result.items[0].salePrice, 899.9);
  assert.equal(result.items[0].commissionRate, 12);
  assert.equal(result.items[1].purchasePrice, 1250.5);
});

test('imports JSON arrays and products wrapper', () => {
  const direct = parseOpportunityImport(JSON.stringify([
    { name: 'A', purchasePrice: 100, salePrice: 200 }
  ]), 'products.json');
  assert.equal(direct.items.length, 1);
  assert.equal(direct.items[0].name, 'A');

  const wrapped = parseOpportunityImport(JSON.stringify({ products: [
    { product: 'B', buyPrice: 200, sellPrice: 400, category: 'home' }
  ]}), 'products.json');
  assert.equal(wrapped.items.length, 1);
  assert.equal(wrapped.items[0].name, 'B');
  assert.equal(wrapped.items[0].category, 'home');
});

test('skips invalid rows while retaining valid import rows', () => {
  const csv = 'name,purchasePrice,salePrice\nValid,100,200\nMissing Buy,,300\nBad Sell,100,nope';
  const result = parseOpportunityImport(csv, 'products.csv');

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, 'Valid');
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /Satır 3/);
  assert.match(result.errors[1], /Satır 4/);
});

test('reports malformed or unsupported JSON clearly', () => {
  assert.deepEqual(parseOpportunityImport('{bad json', 'x.json').items, []);
  assert.match(parseOpportunityImport('{bad json', 'x.json').errors[0], /JSON/);

  const unsupported = parseOpportunityImport(JSON.stringify({ hello: 'world' }), 'x.json');
  assert.equal(unsupported.items.length, 0);
  assert.match(unsupported.errors[0], /products|opportunities/);
});
