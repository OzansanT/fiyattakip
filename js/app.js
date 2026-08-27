import { calculate, formatPercent, formatTry } from './calculator.js';
import { parseOpportunityImport } from './importer.js';
import { buildOpportunity, filterOpportunities, sortOpportunities } from './opportunities.js';
import { deleteOpportunity, listOpportunities, saveOpportunity, saveOpportunities } from './storage.js';
import {
  categoryLevels,
  isLeafCategory,
  loadTrendyolCategories,
  refreshTrendyolCategories,
  selectedCategory,
  selectedCategoryPath
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

const trendyolRefreshButton = document.getElementById('refreshTrendyolCategories');
const trendyolStatus = document.getElementById('trendyolCategoryStatus');
const trendyolStats = document.getElementById('trendyolCategoryStats');
const trendyolLevels = document.getElementById('trendyolCategoryLevels');
const trendyolPath = document.getElementById('trendyolCategoryPath');
const trendyolId = document.getElementById('trendyolCategoryId');

const categoryDefaults = {
  general: { commissionRate: 18, advertisingRate: 2, returnReserveRate: 3, shipping: 69.9, packaging: 8 },
  electronics: { commissionRate: 12, advertisingRate: 2, returnReserveRate: 4, shipping: 69.9, packaging: 10 },
  home: { commissionRate: 17, advertisingRate: 2, returnReserveRate: 3, shipping: 79.9, packaging: 12 },
  fashion: { commissionRate: 20, advertisingRate: 3, returnReserveRate: 8, shipping: 69.9, packaging: 8 }
};

let opportunities = [];
let trendyolCategories = [];
let selectedTrendyolIds = loadSavedTrendyolPath();

function loadSavedTrendyolPath() {
  try {
    const parsed = JSON.parse(localStorage.getItem('fiyattakip.trendyolCategoryPath') || '[]');
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function saveTrendyolPath() {
  try {
    localStorage.setItem('fiyattakip.trendyolCategoryPath', JSON.stringify(selectedTrendyolIds));
  } catch {
    // Category browsing still works when localStorage is unavailable.
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

function renderTrendyolSelection() {
  const current = selectedCategory(trendyolCategories, selectedTrendyolIds);
  const names = selectedCategoryPath(trendyolCategories, selectedTrendyolIds);

  trendyolPath.textContent = names.length ? names.join(' → ') : 'Henüz kategori seçilmedi';
  if (!current) {
    trendyolId.textContent = 'En alt seviyeye kadar ilerle.';
    return;
  }

  if (isLeafCategory(current)) {
    trendyolId.textContent = `Yaprak kategori ID: ${current.id} — ürün eşleştirmesi için kullanılabilir.`;
  } else {
    trendyolId.textContent = `Kategori ID: ${current.id} — ${current.subCategories.length} alt kategori var; bir alt seviyeye devam et.`;
  }
}

function renderTrendyolLevels() {
  trendyolLevels.replaceChildren();
  const levels = categoryLevels(trendyolCategories, selectedTrendyolIds);

  levels.forEach((nodes, levelIndex) => {
    const label = document.createElement('label');
    label.className = 'category-level';
    const title = document.createElement('span');
    title.textContent = `Seviye ${levelIndex + 1}`;
    const select = document.createElement('select');
    select.dataset.level = String(levelIndex);

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Kategori seç';
    select.appendChild(placeholder);

    [...nodes]
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'))
      .forEach(node => {
        const option = document.createElement('option');
        option.value = String(node.id);
        option.textContent = node.name;
        select.appendChild(option);
      });

    if (selectedTrendyolIds[levelIndex] !== undefined) {
      select.value = String(selectedTrendyolIds[levelIndex]);
    }
    label.append(title, select);
    trendyolLevels.appendChild(label);
  });

  renderTrendyolSelection();
}

function updateTrendyolMeta(payload) {
  const fetched = payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleString('tr-TR') : 'bilinmiyor';
  trendyolStatus.className = `sync-badge ${payload.stale ? 'stale' : 'fresh'}`;
  trendyolStatus.textContent = payload.stale
    ? `Önbellek eski — son başarılı: ${fetched}`
    : `Güncel — ${fetched}`;

  const stats = payload.stats || {};
  const pieces = [];
  if (Number.isFinite(stats.total)) pieces.push(`${stats.total} kategori`);
  if (Number.isFinite(stats.leaves)) pieces.push(`${stats.leaves} yaprak`);
  if (Number.isFinite(stats.maxDepth)) pieces.push(`${stats.maxDepth} seviye`);
  if (payload.refreshed) pieces.push('Trendyol’dan yenilendi');
  if (payload.refreshError) pieces.push(`yenileme hatası: ${payload.refreshError}`);
  trendyolStats.textContent = pieces.join(' · ') || 'Kategori ağacı hazır.';
}

async function syncTrendyolCategories(force = false) {
  trendyolRefreshButton.disabled = true;
  trendyolStatus.className = 'sync-badge';
  trendyolStatus.textContent = force ? 'Trendyol’dan yenileniyor…' : 'Kategori verisi kontrol ediliyor…';

  try {
    const payload = force
      ? await refreshTrendyolCategories()
      : await loadTrendyolCategories();
    trendyolCategories = payload.categories;
    updateTrendyolMeta(payload);
    renderTrendyolLevels();
  } catch (error) {
    console.error(error);
    trendyolStatus.className = 'sync-badge error';
    trendyolStatus.textContent = 'Kategori bağlantısı kurulamadı';
    trendyolStats.textContent = `${error.message} Uygulamayı npm start ile çalıştır ve .env dosyasını yapılandır.`;
  } finally {
    trendyolRefreshButton.disabled = false;
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

trendyolLevels.addEventListener('change', event => {
  const select = event.target.closest('select[data-level]');
  if (!select) return;
  const level = Number(select.dataset.level);
  selectedTrendyolIds = selectedTrendyolIds.slice(0, level);
  if (select.value) selectedTrendyolIds.push(Number(select.value));
  saveTrendyolPath();
  renderTrendyolLevels();
});

trendyolRefreshButton.addEventListener('click', () => syncTrendyolCategories(true));
saveButton.addEventListener('click', handleSave);
importButton.addEventListener('click', handleImport);
[sortSelect, statusSelect].forEach(element => element.addEventListener('change', renderOpportunities));
[searchInput, minRoiInput].forEach(element => element.addEventListener('input', renderOpportunities));

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
syncTrendyolCategories(false);
refreshOpportunities().catch(error => {
  console.error(error);
  emptyState.textContent = 'Tarayıcı yerel veritabanı kullanılamıyor.';
});
