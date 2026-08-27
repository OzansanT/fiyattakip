const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const pct = (value) => num(value) / 100;

export function calculate(input = {}) {
  const salePrice = Math.max(0, num(input.salePrice));
  const purchasePrice = Math.max(0, num(input.purchasePrice));
  const commissionRate = Math.max(0, pct(input.commissionRate));
  const advertisingRate = Math.max(0, pct(input.advertisingRate));
  const returnReserveRate = Math.max(0, pct(input.returnReserveRate));
  const shipping = Math.max(0, num(input.shipping));
  const packaging = Math.max(0, num(input.packaging));
  const other = Math.max(0, num(input.other));
  const targetRoiRate = Math.max(0, pct(input.targetRoi));

  const variableRate = commissionRate + advertisingRate + returnReserveRate;
  const commission = salePrice * commissionRate;
  const advertising = salePrice * advertisingRate;
  const returnReserve = salePrice * returnReserveRate;
  const fixedCosts = shipping + packaging + other;
  const marketplaceAndOperatingCosts = commission + advertising + returnReserve + fixedCosts;
  const profit = salePrice - purchasePrice - marketplaceAndOperatingCosts;
  const roi = purchasePrice > 0 ? (profit / purchasePrice) * 100 : 0;
  const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0;

  const denominator = 1 - variableRate;
  const breakEvenSalePrice = denominator > 0
    ? (purchasePrice + fixedCosts) / denominator
    : Infinity;

  const maxPurchasePrice = denominator > 0
    ? (salePrice * denominator - fixedCosts) / (1 + targetRoiRate)
    : 0;

  const requiredSalePrice = denominator > 0
    ? (purchasePrice * (1 + targetRoiRate) + fixedCosts) / denominator
    : Infinity;

  const safetyMargin = maxPurchasePrice - purchasePrice;
  const status = roi >= 40 ? 'excellent' : roi >= 25 ? 'good' : roi >= 15 ? 'marginal' : 'bad';

  return {
    salePrice,
    purchasePrice,
    commission,
    advertising,
    returnReserve,
    shipping,
    packaging,
    other,
    marketplaceAndOperatingCosts,
    profit,
    roi,
    margin,
    breakEvenSalePrice,
    maxPurchasePrice: Math.max(0, maxPurchasePrice),
    requiredSalePrice,
    safetyMargin,
    status
  };
}

export function formatTry(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2
  }).format(value);
}

export function formatPercent(value) {
  return `${Number.isFinite(value) ? value.toFixed(1) : '0.0'}%`;
}
