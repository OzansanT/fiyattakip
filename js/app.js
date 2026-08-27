import { calculate, formatPercent, formatTry } from './calculator.js';
import { buildOpportunity, sortOpportunities } from './opportunities.js';
import { deleteOpportunity, listOpportunities, saveOpportunity } from './storage.js';

const ids = [
  'purchasePrice','salePrice','commissionRate','advertisingRate','returnReserveRate',
  'targetRoi','shipping','packaging','other'
];
const els = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

const out = Object.fromEntries([
  'profit','roi','margin','breakEven','maxBuy','requiredSale','decision','purchaseAdvice',
  'wfSale','wfPurchase','wfCommission','wfAdvertising','wfReturns','wfFixed','wfProfit'
].map(id => [id, document.getElementById(id)]));

const productName = document.getElementById('productName');
const category = document.getElementById('category');
const saveButton = document.getElementById('saveOpportunity');
const saveStatus = document.getElementById('saveStatus');
const sortSelect = document.getElementById('opportunitySort');
const table = document.getElementById('opportunityTable');
const rows = document.getElementById('opportunityRows');
const emptyState = document.getElementById('opportunityEmpty');

const categoryDefaults = {
  general: { commissionRate: 18, advertisingRate: 2, returnReserveRate: 3, shipping: 69.9, packaging: 8 },
  electronics: { commissionRate: 12, advertisingRate: 2, returnReserveRate: 4, shipping: 69.9, packaging: 10 },
  home: { commissionRate: 17, advertisingRate: 2, returnReserveRate: 3, shipping: 79.9, packaging: 12 },
  fashion: { commissionRate: 20, advertisingRate: 3, returnReserveRate: 8, shipping: 69.9, packaging: 8 }
};

let opportunities = [];

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

function statusLabel(status) {
  return { excellent: 'ÇOK İYİ', good: 'ALINABİLİR', marginal: 'SINIRDA', bad: 'ALMA' }[status] || '—';
}

function renderOpportunities() {
  const sorted = sortOpportunities(opportunities, sortSelect.value);
  rows.replaceChildren();
  table.hidden = sorted.length === 0;
  emptyState.hidden = sorted.length > 0;

  sorted.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong></strong><small></small></td>
      <td>${formatTry(item.purchasePrice)}</td>
      <td>${formatTry(item.salePrice)}</td>
      <td>${formatTry(item.profit)}</td>
      <td>${formatPercent(item.roi)}</td>
      <td>${formatTry(item.maxPurchasePrice)}</td>
      <td><span class="decision ${item.status}">${statusLabel(item.status)}</span></td>
      <td><div class="row-actions"><button type="button" data-action="load">Yükle</button><button type="button" data-action="delete" class="danger">Sil</button></div></td>`;
    tr.dataset.id = item.id;
    tr.querySelector('strong').textContent = item.name;
    tr.querySelector('small').textContent = item.category;
    rows.appendChild(tr);
  });
}

async function refreshOpportunities() {
  opportunities = await listOpportunities();
  renderOpportunities();
}

async function handleSave() {
  saveButton.disabled = true;
  try {
    const opportunity = buildOpportunity({
      name: productName.value,
      category: category.value,
      inputs: readInput()
    });
    await saveOpportunity(opportunity);
    saveStatus.textContent = 'Fırsat cihazında kaydedildi.';
    await refreshOpportunities();
  } catch (error) {
    console.error(error);
    saveStatus.textContent = 'Fırsat kaydedilemedi. Tarayıcı depolaması kullanılamıyor olabilir.';
  } finally {
    saveButton.disabled = false;
  }
}

function loadOpportunity(item) {
  productName.value = item.name;
  category.value = item.category;
  Object.entries(item.inputs || {}).forEach(([key, value]) => {
    if (els[key]) els[key].value = value;
  });
  render();
  saveStatus.textContent = 'Kayıt hesaplayıcıya yüklendi.';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

ids.forEach(id => els[id].addEventListener('input', render));

category.addEventListener('change', (event) => {
  const defaults = categoryDefaults[event.target.value];
  if (!defaults) return;
  Object.entries(defaults).forEach(([key, value]) => { els[key].value = value; });
  render();
});

saveButton.addEventListener('click', handleSave);
sortSelect.addEventListener('change', renderOpportunities);

rows.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const tr = button.closest('tr');
  const item = opportunities.find(entry => entry.id === tr?.dataset.id);
  if (!item) return;

  if (button.dataset.action === 'load') {
    loadOpportunity(item);
    return;
  }

  if (button.dataset.action === 'delete') {
    button.disabled = true;
    try {
      await deleteOpportunity(item.id);
      await refreshOpportunities();
      saveStatus.textContent = 'Kayıt silindi.';
    } catch (error) {
      console.error(error);
      button.disabled = false;
      saveStatus.textContent = 'Kayıt silinemedi.';
    }
  }
});

render();
refreshOpportunities().catch(error => {
  console.error(error);
  emptyState.textContent = 'Tarayıcı yerel veritabanı kullanılamıyor.';
});
