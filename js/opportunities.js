import { calculate } from './calculator.js';

function normalizeTrendyolCategory(value) {
  if (!value) return null;
  const id = Number(value.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const pathIds = Array.isArray(value.pathIds)
    ? value.pathIds.map(Number).filter(Number.isFinite)
    : [];
  const pathNames = Array.isArray(value.pathNames)
    ? value.pathNames.map(name => String(name))
    : [];
  return {
    id,
    name: String(value.name || pathNames.at(-1) || `Kategori ${id}`),
    pathIds,
    pathNames
  };
}

export function buildOpportunity({ name, category, inputs, trendyolCategory, id, createdAt } = {}) {
  const result = calculate(inputs || {});
  return {
    id,
    createdAt,
    name: String(name || 'Adsız Ürün').trim() || 'Adsız Ürün',
    category: category || 'general',
    trendyolCategory: normalizeTrendyolCategory(trendyolCategory),
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

export function filterOpportunities(items, filters = {}) {
  const query = String(filters.query || '').trim().toLocaleLowerCase('tr-TR');
  const minRoiRaw = String(filters.minRoi ?? '').trim();
  const minRoi = minRoiRaw === '' ? NaN : Number(minRoiRaw);
  const status = String(filters.status || 'all');

  return [...items].filter(item => {
    if (query) {
      const trendyolPath = Array.isArray(item.trendyolCategory?.pathNames)
        ? item.trendyolCategory.pathNames.join(' ')
        : '';
      const haystack = `${item.name || ''} ${item.category || ''} ${trendyolPath}`.toLocaleLowerCase('tr-TR');
      if (!haystack.includes(query)) return false;
    }
    if (Number.isFinite(minRoi) && Number(item.roi) < minRoi) return false;
    if (status !== 'all' && item.status !== status) return false;
    return true;
  });
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
