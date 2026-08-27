import { calculate, formatPercent, formatTry } from './calculator.js';

const ids = [
  'purchasePrice','salePrice','commissionRate','advertisingRate','returnReserveRate',
  'targetRoi','shipping','packaging','other'
];
const els = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

const out = Object.fromEntries([
  'profit','roi','margin','breakEven','maxBuy','requiredSale','decision','purchaseAdvice',
  'wfSale','wfPurchase','wfCommission','wfAdvertising','wfReturns','wfFixed','wfProfit'
].map(id => [id, document.getElementById(id)]));

const categoryDefaults = {
  general: { commissionRate: 18, advertisingRate: 2, returnReserveRate: 3, shipping: 69.9, packaging: 8 },
  electronics: { commissionRate: 12, advertisingRate: 2, returnReserveRate: 4, shipping: 69.9, packaging: 10 },
  home: { commissionRate: 17, advertisingRate: 2, returnReserveRate: 3, shipping: 79.9, packaging: 12 },
  fashion: { commissionRate: 20, advertisingRate: 3, returnReserveRate: 8, shipping: 69.9, packaging: 8 }
};

function readInput() {
  return Object.fromEntries(ids.map(id => [id, els[id].value]));
}

function render() {
  const r = calculate(readInput());
  out.profit.textContent = formatTry(r.profit);
  out.roi.textContent = formatPercent(r.roi);
  out.margin.textContent = formatPercent(r.margin);
  out.breakEven.textContent = formatTry(r.breakEvenSalePrice);
  out.maxBuy.textContent = formatTry(r.maxPurchasePrice);
  out.requiredSale.textContent = formatTry(r.requiredSalePrice);

  const labels = { excellent: 'ÇOK İYİ', good: 'ALINABİLİR', marginal: 'SINIRDA', bad: 'ALMA' };
  out.decision.className = `decision ${r.status}`;
  out.decision.textContent = labels[r.status];

  out.wfSale.textContent = formatTry(r.salePrice);
  out.wfPurchase.textContent = `− ${formatTry(r.purchasePrice)}`;
  out.wfCommission.textContent = `− ${formatTry(r.commission)}`;
  out.wfAdvertising.textContent = `− ${formatTry(r.advertising)}`;
  out.wfReturns.textContent = `− ${formatTry(r.returnReserve)}`;
  out.wfFixed.textContent = `− ${formatTry(r.shipping + r.packaging + r.other)}`;
  out.wfProfit.textContent = formatTry(r.profit);

  if (r.safetyMargin >= 0) {
    out.purchaseAdvice.textContent = `Mevcut alış fiyatı hedef ROI sınırının ${formatTry(r.safetyMargin)} altında. Bu varsayımlarla alım yapılabilir.`;
  } else {
    const discount = Math.abs(r.safetyMargin);
    const discountPct = r.purchasePrice > 0 ? (discount / r.purchasePrice) * 100 : 0;
    out.purchaseAdvice.textContent = `Hedef ROI için alış fiyatını en az ${formatTry(discount)} (${formatPercent(discountPct)}) düşür; ${formatTry(r.maxPurchasePrice)} veya altını hedefle.`;
  }
}

ids.forEach(id => els[id].addEventListener('input', render));

document.getElementById('category').addEventListener('change', (event) => {
  const defaults = categoryDefaults[event.target.value];
  if (!defaults) return;
  Object.entries(defaults).forEach(([key, value]) => { els[key].value = value; });
  render();
});

render();
