import { calculate } from './calculator.js';

export function buildOpportunity({ name, category, inputs, id, createdAt } = {}) {
  const result = calculate(inputs || {});
  return {
    id,
    createdAt,
    name: String(name || 'Adsız Ürün').trim() || 'Adsız Ürün',
    category: category || 'general',
    inputs: { ...inputs },
    purchasePrice: result.purchasePrice,
    salePrice: result.salePrice,
    profit: result.profit,
    roi: result.roi,
    margin: result.margin,
    maxPurchasePrice: result.maxPurchasePrice,
    safetyMargin: result.safetyMargin,
    status: result.status
  };
}

export function sortOpportunities(items, sortBy = 'updatedAt') {
  const copy = [...items];
  const numericDesc = key => (a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0);

  if (sortBy === 'roi') return copy.sort(numericDesc('roi'));
  if (sortBy === 'profit') return copy.sort(numericDesc('profit'));
  if (sortBy === 'safetyMargin') return copy.sort(numericDesc('safetyMargin'));
  if (sortBy === 'purchasePrice') return copy.sort((a, b) => (Number(a.purchasePrice) || 0) - (Number(b.purchasePrice) || 0));

  return copy.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}
