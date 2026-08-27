import { calculate, formatPercent, formatTry } from './calculator.js';
import { parseOpportunityImport } from './importer.js';
import { buildOpportunity, filterOpportunities, sortOpportunities } from './opportunities.js';
import { deleteOpportunity, listOpportunities, saveOpportunity, saveOpportunities } from './storage.js';
import {
  loadTrendyolCategoryNames,
  loadTrendyolCategoryProducts,
  refreshTrendyolCategoryNames
} from './trendyol-categories.js';

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
const searchInput = document.getElementById('opportunitySearch');
const minRoiInput = document.getElementById('opportunityMinRoi');
const statusSelect = document.getElementById('opportunityStatus');
const countLabel = document.getElementById('opportunityCount');
const fileInput = document.getElementById('opportunityFile');
const importButton = document.getElementById('importOpportunities');
const importStatus = document.getElementById('importStatus');
const table = document.getElementById('opportunityTable');
const rows = document.getElementById('opportunityRows');
const emptyState = document.getElementById('opportunityEmpty');

const categoryFetchButton = document.getElementById('fetchTrendyolCategoryNames');
const categoryRefreshButton = document.getElementById('refreshTrendyolCategoryNames');
const trendyolStatus = document.getElementById('trendyolCategoryStatus');
const trendyolStats = document.getElementById('trendyolCategoryStats');
const trendyolSearch = document.getElementById('trendyolCategorySearch');
const trendyolSelect = document.getElementById('trendyolCategorySelect');
const trendyolSelected = document.getElementById('trendyolSelectedCategory');
const productCountInput = document.getElementById('trendyolProductCount');
const productFetchButton = document.getElementById('fetchTrendyolProducts');
const productStatus = document.getElementById('trendyolProductStatus');
const productTable = document.getElementById('trendyolProductTable');
const productRows = document.getElementById('trendyolProductRows');
const productEmpty = document.getElementById('trendyolProductEmpty');

const categoryDefaults = {
  general: { commissionRate: 18, advertisingRate: 2, returnReserveRate: 3, shipping: 69.9, packaging: 8 },
  electronics: { commissionRate: 12, advertisingRate: 2, returnReserveRate: 4, shipping: 69.9, packaging: 10 },
  home: { commissionRate: 17, advertisingRate: 2, returnReserveRate: 3, shipping: 79.9, packaging: 12 },
  fashion: { commissionRate: 20, advertisingRate: 3, returnReserveRate: 8, shipping: 69.9, packaging: 8 }
};

let opportunities = [];
let trendyolCategories = [];
let selectedTrendyolCategory = loadSavedCategory();
let trendyolProducts = [];

function loadSavedCategory() {
  try {
    const value = JSON.parse(localStorage.getItem('fiyattakip.trendyolSelectedCategory') || 'null');
    return value && Number.isInteger(Number(value.id)) ? value : null;
  } catch {
    return null;
  }
}

function saveSelectedCategory() {
  try {
    if (selectedTrendyolCategory) {
      localStorage.setItem('fiyattakip.trendyolSelectedCategory', JSON.stringify(selectedTrendyolCategory));
    } else {
      localStorage.removeItem('fiyattakip.trendyolSelectedCategory');
    }
  } catch {
    // Selection still works without localStorage.
  }
}

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

function selectedTrendyolSnapshot() {
  if (!selectedTrendyolCategory) return null;
  const pathNames = Array.isArray(selectedTrendyolCategory.pathNames)
    ? selectedTrendyolCategory.pathNames
    : String(selectedTrendyolCategory.path || selectedTrendyolCategory.name || '').split(' → ').filter(Boolean);
  return {
    id: Number(selectedTrendyolCategory.id),
    name: selectedTrendyolCategory.name,
    pathIds: Array.isArray(selectedTrendyolCategory.pathIds) ? [...selectedTrendyolCategory.pathIds] : [],
    pathNames,
    path: selectedTrendyolCategory.path || pathNames.join(' → ')
  };
}

function renderSelectedCategory() {
  const selected = selectedTrendyolSnapshot();
  if (!selected) {
    trendyolSelected.textContent = 'Kategori seçilmedi.';
    productFetchButton.disabled = true;
    return;
  }
  trendyolSelected.textContent = `${selected.path || selected.name} · ID ${selected.id}`;
  productFetchButton.disabled = false;
  if (trendyolCategories.length) trendyolSelect.value = String(selected.id);
}

function renderCategoryOptions() {
  const query = trendyolSearch.value.trim().toLocaleLowerCase('tr-TR');
  const filtered = trendyolCategories.filter(item => {
    if (!query) return true;
    return `${item.name} ${item.path}`.toLocaleLowerCase('tr-TR').includes(query);
  });
  const visible = filtered.slice(0, 250);
  trendyolSelect.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = filtered.length > visible.length
    ? `${filtered.length} eşleşme — aramayı daralt`
    : 'Kategori seç';
  trendyolSelect.appendChild(placeholder);

  for (const item of visible) {
    const option = document.createElement('option');
    option.value = String(item.id);
    option.textContent = item.path || item.name;
    trendyolSelect.appendChild(option);
  }
  if (selectedTrendyolCategory && visible.some(item => Number(item.id) === Number(selectedTrendyolCategory.id))) {
    trendyolSelect.value = String(selectedTrendyolCategory.id);
  }
}

function updateCategoryMeta(payload) {
  const fetched = payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleString('tr-TR') : 'bilinmiyor';
  trendyolStatus.className = `sync-badge ${payload.stale ? 'stale' : 'fresh'}`;
  trendyolStatus.textContent = payload.stale ? `Eski önbellek · ${fetched}` : `Kategori adları hazır · ${fetched}`;
  const pieces = [`${payload.categories.length} yaprak kategori adı`];
  if (payload.refreshed) pieces.push('Trendyol’dan yenilendi');
  if (payload.refreshError) pieces.push(`yenileme hatası: ${payload.refreshError}`);
  pieces.push('ürün isteği yapılmadı');
  trendyolStats.textContent = pieces.join(' · ');
}

async function fetchCategoryNames(force = false) {
  categoryFetchButton.disabled = true;
  categoryRefreshButton.disabled = true;
  trendyolStatus.className = 'sync-badge';
  trendyolStatus.textContent = force ? 'Kategori adları yenileniyor…' : 'Kategori adları alınıyor…';
  try {
    const payload = force ? await refreshTrendyolCategoryNames() : await loadTrendyolCategoryNames();
    trendyolCategories = payload.categories;
    if (selectedTrendyolCategory) {
      const updated = trendyolCategories.find(item => Number(item.id) === Number(selectedTrendyolCategory.id));
      if (updated) selectedTrendyolCategory = { ...updated, pathNames: updated.path.split(' → ') };
    }
    updateCategoryMeta(payload);
    renderCategoryOptions();
    renderSelectedCategory();
  } catch (error) {
    console.error(error);
    trendyolStatus.className = 'sync-badge error';
    trendyolStatus.textContent = 'Kategori adları alınamadı';
    trendyolStats.textContent = `${error.message} · npm start ve .env ayarlarını kontrol et.`;
  } finally {
    categoryFetchButton.disabled = false;
    categoryRefreshButton.disabled = false;
  }
}

function renderProducts() {
  productRows.replaceChildren();
  productTable.hidden = trendyolProducts.length === 0;
  productEmpty.hidden = trendyolProducts.length > 0;

  trendyolProducts.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong></strong><small></small></td>
      <td></td><td></td><td></td><td></td>
      <td><button type="button" class="secondary-action" data-product-index="${index}">Hesaplayıcıya Al</button></td>`;
    tr.querySelector('strong').textContent = item.title;
    tr.querySelector('small').textContent = item.brand || item.productMainId || '—';
    const cells = tr.querySelectorAll('td');
    cells[1].textContent = item.category?.name || '—';
    cells[2].textContent = formatTry(item.salePrice);
    cells[3].textContent = String(item.quantity ?? 0);
    cells[4].textContent = String(item.variantCount ?? 0);
    productRows.appendChild(tr);
  });
}

async function fetchCategoryProducts() {
  const selected = selectedTrendyolSnapshot();
  const count = Number.parseInt(productCountInput.value, 10);
  if (!selected) {
    productStatus.textContent = 'Önce bir Trendyol kategorisi seç.';
    return;
  }
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    productStatus.textContent = 'Ürün sayısı 1 ile 100 arasında olmalı.';
    return;
  }

  productFetchButton.disabled = true;
  productStatus.textContent = `${selected.name} kategorisinden ${count} ürün aranıyor…`;
  productEmpty.textContent = 'Trendyol mağaza ürünleri taranıyor…';
  try {
    const payload = await loadTrendyolCategoryProducts(selected.id, count);
    trendyolProducts = payload.products;
    renderProducts();
    const cap = payload.scanCapped ? ' · güvenlik tarama sınırına ulaşıldı' : '';
    productStatus.textContent = `${payload.requested} istendi · ${payload.found} bulundu · ${payload.contentsScanned} mağaza ürünü / ${payload.pagesScanned} sayfa kontrol edildi${cap}.`;
    if (!trendyolProducts.length) productEmpty.textContent = 'Bu kategori için taranan mağaza ürünlerinde eşleşme bulunamadı.';
  } catch (error) {
    console.error(error);
    trendyolProducts = [];
    renderProducts();
    productStatus.textContent = `Ürünler alınamadı: ${error.message}`;
    productEmpty.textContent = 'Ürün isteği başarısız.';
  } finally {
    productFetchButton.disabled = false;
  }
}

function statusLabel(status) {
  return { excellent: 'ÇOK İYİ', good: 'ALINABİLİR', marginal: 'SINIRDA', bad: 'ALMA' }[status] || '—';
}

function renderOpportunities() {
  const filtered = filterOpportunities(opportunities, {
    query: searchInput.value,
    minRoi: minRoiInput.value,
    status: statusSelect.value
  });
  const sorted = sortOpportunities(filtered, sortSelect.value);
  rows.replaceChildren();
  table.hidden = sorted.length === 0;
  emptyState.hidden = sorted.length > 0;
  countLabel.textContent = `${sorted.length} / ${opportunities.length} ürün gösteriliyor`;

  if (opportunities.length > 0 && sorted.length === 0) {
    emptyState.textContent = 'Filtrelerle eşleşen fırsat bulunamadı.';
  } else if (opportunities.length === 0) {
    emptyState.textContent = 'Henüz kayıtlı fırsat yok. Hesaplayıcıdan ilk ürünü kaydet veya CSV/JSON içe aktar.';
  }

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
    tr.querySelector('small').textContent = item.trendyolCategory?.pathNames?.length
      ? item.trendyolCategory.pathNames.join(' → ')
      : item.category;
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
      trendyolCategory: selectedTrendyolSnapshot(),
      inputs: readInput()
    });
    await saveOpportunity(opportunity);
    saveStatus.textContent = opportunity.trendyolCategory
      ? `Fırsat kaydedildi · Trendyol kategori ID ${opportunity.trendyolCategory.id}.`
      : 'Fırsat cihazında kaydedildi.';
    await refreshOpportunities();
  } catch (error) {
    console.error(error);
    saveStatus.textContent = 'Fırsat kaydedilemedi. Tarayıcı depolaması kullanılamıyor olabilir.';
  } finally {
    saveButton.disabled = false;
  }
}

function importedInputs(item) {
  const defaults = categoryDefaults[item.category] || categoryDefaults.general;
  const inputs = {
    ...defaults,
    purchasePrice: item.purchasePrice,
    salePrice: item.salePrice,
    targetRoi: item.targetRoi ?? 25,
    other: item.other ?? 0
  };
  ['commissionRate','advertisingRate','returnReserveRate','shipping','packaging'].forEach(key => {
    if (item[key] !== undefined) inputs[key] = item[key];
  });
  return inputs;
}

async function handleImport() {
  const file = fileInput.files?.[0];
  if (!file) {
    importStatus.textContent = 'Önce bir CSV veya JSON dosyası seç.';
    return;
  }
  importButton.disabled = true;
  try {
    const parsed = parseOpportunityImport(await file.text(), file.name);
    if (!parsed.items.length) {
      importStatus.textContent = parsed.errors[0] || 'İçe aktarılabilecek geçerli kayıt bulunamadı.';
      return;
    }
    const records = parsed.items.map(item => buildOpportunity({
      name: item.name,
      category: item.category,
      inputs: importedInputs(item)
    }));
    await saveOpportunities(records);
    await refreshOpportunities();
    const skipped = parsed.errors.length;
    const errorPreview = skipped ? ` Atlanan: ${parsed.errors.slice(0, 2).join(' | ')}${skipped > 2 ? ' …' : ''}` : '';
    importStatus.textContent = `${records.length} ürün içe aktarıldı.${skipped ? ` ${skipped} kayıt atlandı.` : ''}${errorPreview}`;
    fileInput.value = '';
  } catch (error) {
    console.error(error);
    importStatus.textContent = 'Dosya içe aktarılamadı. Dosya biçimini ve tarayıcı depolamasını kontrol et.';
  } finally {
    importButton.disabled = false;
  }
}

function loadOpportunity(item) {
  productName.value = item.name;
  category.value = item.category;
  Object.entries(item.inputs || {}).forEach(([key, value]) => {
    if (els[key]) els[key].value = value;
  });
  if (item.trendyolCategory) {
    selectedTrendyolCategory = {
      ...item.trendyolCategory,
      path: item.trendyolCategory.path || item.trendyolCategory.pathNames?.join(' → ') || item.trendyolCategory.name
    };
    saveSelectedCategory();
    renderSelectedCategory();
  }
  render();
  saveStatus.textContent = 'Kayıt hesaplayıcıya yüklendi.';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

ids.forEach(id => els[id].addEventListener('input', render));
category.addEventListener('change', event => {
  const defaults = categoryDefaults[event.target.value];
  if (!defaults) return;
  Object.entries(defaults).forEach(([key, value]) => { els[key].value = value; });
  render();
});

categoryFetchButton.addEventListener('click', () => fetchCategoryNames(false));
categoryRefreshButton.addEventListener('click', () => fetchCategoryNames(true));
trendyolSearch.addEventListener('input', renderCategoryOptions);
trendyolSelect.addEventListener('change', () => {
  const id = Number(trendyolSelect.value);
  const item = trendyolCategories.find(entry => Number(entry.id) === id) || null;
  selectedTrendyolCategory = item ? { ...item, pathNames: item.path.split(' → ') } : null;
  saveSelectedCategory();
  renderSelectedCategory();
  trendyolProducts = [];
  renderProducts();
  productStatus.textContent = item ? 'Kategori seçildi. Kaç ürün istediğini gir ve Ürünleri Getir’e bas.' : 'Kategori seçilmedi.';
});
productFetchButton.addEventListener('click', fetchCategoryProducts);
productRows.addEventListener('click', event => {
  const button = event.target.closest('button[data-product-index]');
  if (!button) return;
  const item = trendyolProducts[Number(button.dataset.productIndex)];
  if (!item) return;
  productName.value = item.title;
  if (Number.isFinite(Number(item.salePrice))) els.salePrice.value = item.salePrice;
  render();
  saveStatus.textContent = 'Trendyol ürünü hesaplayıcıya aktarıldı. Alış fiyatını manuel gir.';
  window.scrollTo({ top: document.querySelector('.grid').offsetTop - 16, behavior: 'smooth' });
});

saveButton.addEventListener('click', handleSave);
importButton.addEventListener('click', handleImport);
[sortSelect, statusSelect].forEach(element => element.addEventListener('change', renderOpportunities));
[searchInput, minRoiInput].forEach(element => element.addEventListener('input', renderOpportunities));
rows.addEventListener('click', async event => {
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
renderSelectedCategory();
renderProducts();
refreshOpportunities().catch(error => {
  console.error(error);
  emptyState.textContent = 'Tarayıcı yerel veritabanı kullanılamıyor.';
});
