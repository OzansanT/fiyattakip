const listingUrl = document.getElementById('trendyolListingUrl');
const listingCount = document.getElementById('trendyolListingCount');
const listingColumns = document.getElementById('trendyolListingColumns');
const fetchButton = document.getElementById('scrapeTrendyolListing');
const moreButton = document.getElementById('scrapeTrendyolMore');
const status = document.getElementById('trendyolListingStatus');
const results = document.getElementById('trendyolListingProducts');
const empty = document.getElementById('trendyolListingEmpty');

const productName = document.getElementById('productName');
const salePrice = document.getElementById('salePrice');
const calculatorGrid = document.querySelector('.grid');

let lastPayload = null;

function setStatus(message, tone = '') {
  status.textContent = message;
  status.className = `sync-badge${tone ? ` ${tone}` : ''}`;
}

function productMetadata(item) {
  return Array.isArray(item.metadata) ? item.metadata.filter(Boolean) : [];
}

function productPrices(item) {
  const values = Array.isArray(item.prices) ? item.prices.filter(Boolean) : [];
  if (!values.length && item.price_text) values.push(item.price_text);
  return [...new Set(values)];
}

function makeProductCard(item, index) {
  const article = document.createElement('article');
  article.className = 'listing-product-card';

  const head = document.createElement('div');
  head.className = 'listing-product-head';

  const rank = document.createElement('span');
  rank.className = 'listing-rank';
  rank.textContent = `#${item.rank || index + 1}`;

  const title = document.createElement('a');
  title.className = 'listing-product-title';
  title.href = item.url || '#';
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  title.textContent = item.title || 'Adsız Trendyol ürünü';
  title.title = item.title || '';

  head.append(rank, title);
  article.appendChild(head);

  const prices = productPrices(item);
  const priceBox = document.createElement('div');
  priceBox.className = 'listing-prices';
  if (prices.length) {
    prices.forEach((text, priceIndex) => {
      const price = document.createElement('span');
      price.className = priceIndex === 0 ? 'listing-price primary' : 'listing-price';
      price.textContent = text;
      priceBox.appendChild(price);
    });
  } else {
    const price = document.createElement('span');
    price.className = 'listing-price missing';
    price.textContent = 'TL fiyatı bulunamadı';
    priceBox.appendChild(price);
  }
  article.appendChild(priceBox);

  const metadata = productMetadata(item);
  const meta = document.createElement('div');
  meta.className = 'listing-product-meta';
  if (metadata.length) {
    metadata.forEach(text => {
      const line = document.createElement('span');
      line.textContent = text;
      meta.appendChild(line);
    });
  } else {
    const line = document.createElement('span');
    line.className = 'muted';
    line.textContent = 'Başlık ve fiyat dışında ek kart bilgisi bulunamadı.';
    meta.appendChild(line);
  }
  article.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'listing-product-actions';

  const open = document.createElement('a');
  open.className = 'secondary-action listing-link-button';
  open.href = item.url || '#';
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.textContent = 'Trendyol’da Aç';

  const use = document.createElement('button');
  use.type = 'button';
  use.className = 'primary-action';
  use.textContent = 'Hesaplayıcıya Al';
  use.addEventListener('click', () => {
    productName.value = item.title || '';
    if (Number.isFinite(Number(item.price_value))) {
      salePrice.value = String(item.price_value);
      salePrice.dispatchEvent(new Event('input', { bubbles: true }));
    }
    calculatorGrid?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  actions.append(open, use);
  article.appendChild(actions);
  return article;
}

function applyColumns() {
  const columns = Math.max(1, Math.min(4, Number.parseInt(listingColumns.value, 10) || 1));
  results.dataset.columns = String(columns);
}

function render(payload) {
  lastPayload = payload;
  results.replaceChildren();
  applyColumns();

  const products = Array.isArray(payload?.products) ? payload.products : [];
  empty.hidden = products.length > 0;
  results.hidden = products.length === 0;
  moreButton.disabled = products.length === 0 || Number(payload.requested) >= 200;

  products.forEach((item, index) => results.appendChild(makeProductCard(item, index)));

  if (!products.length) {
    empty.textContent = 'Ürün bulunamadı. Trendyol sayfa yapısı değişmiş veya sayfa erişimi engellenmiş olabilir.';
  }

  const mode = payload.mode === 'browser' ? 'tarayıcı render' : 'HTML';
  const warning = Array.isArray(payload.warnings) && payload.warnings.length
    ? ` · ${payload.warnings[payload.warnings.length - 1]}`
    : '';
  setStatus(
    `${payload.requested} istendi · ${payload.found} bulundu · ${mode} · resim indirilmedi${warning}`,
    payload.found ? 'fresh' : 'stale'
  );
}

async function scrape(limitOverride = null) {
  const limit = Math.max(1, Math.min(200, Number.parseInt(limitOverride ?? listingCount.value, 10) || 10));
  listingCount.value = String(limit);
  fetchButton.disabled = true;
  moreButton.disabled = true;
  setStatus(`${limit} ürün için Trendyol liste sayfası okunuyor…`);
  empty.hidden = false;
  empty.textContent = 'Metin, TL fiyatları ve ürün kartı bilgileri getiriliyor. Görseller istenmiyor.';

  try {
    const response = await fetch('/scrape/trendyol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: listingUrl.value.trim(), limit })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    render(payload);
  } catch (error) {
    console.error(error);
    results.replaceChildren();
    results.hidden = true;
    empty.hidden = false;
    empty.textContent = 'Liste alınamadı.';
    setStatus(`Hata: ${error.message}`, 'error');
  } finally {
    fetchButton.disabled = false;
    if (lastPayload?.products?.length && Number(listingCount.value) < 200) moreButton.disabled = false;
  }
}

fetchButton.addEventListener('click', () => scrape());
moreButton.addEventListener('click', () => scrape(Math.min(200, (Number.parseInt(listingCount.value, 10) || 10) + 10)));
listingColumns.addEventListener('change', applyColumns);
listingUrl.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    scrape();
  }
});

applyColumns();
