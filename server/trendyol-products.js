import { hasCredentials, trendyolAuthHeaders } from './trendyol-categories.js';

export const APPROVED_PRODUCTS_BASE = 'https://apigw.trendyol.com/integration/product/sellers';
export const MAX_PRODUCT_COUNT = 100;
export const PRODUCT_PAGE_SIZE = 100;
export const MAX_PRODUCT_SCAN_PAGES = 10;

const inFlightProductRequests = new Map();

export function normalizeProductCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(MAX_PRODUCT_COUNT, Math.max(1, parsed));
}

export function approvedProductsUrl(sellerId, page = 0, size = PRODUCT_PAGE_SIZE) {
  const seller = Number(sellerId);
  if (!Number.isInteger(seller) || seller <= 0) throw new Error('A valid Trendyol seller ID is required.');
  const safePage = Math.max(0, Number.parseInt(page, 10) || 0);
  const safeSize = Math.min(100, Math.max(1, Number.parseInt(size, 10) || PRODUCT_PAGE_SIZE));
  const url = new URL(`${APPROVED_PRODUCTS_BASE}/${seller}/products/approved`);
  url.searchParams.set('page', String(safePage));
  url.searchParams.set('size', String(safeSize));
  url.searchParams.set('orderByDirection', 'DESC');
  return url.toString();
}

function compactProduct(content = {}) {
  const variants = Array.isArray(content.variants) ? content.variants : [];
  const salePrices = variants.map(item => Number(item.salePrice)).filter(Number.isFinite);
  const listPrices = variants.map(item => Number(item.listPrice)).filter(Number.isFinite);
  const quantity = variants.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  return {
    contentId: content.contentId ?? null,
    productMainId: content.productMainId ?? null,
    title: String(content.title || 'Adsız Trendyol Ürünü'),
    brand: content.brand?.name || content.brand || '',
    category: {
      id: Number(content.category?.id) || null,
      name: content.category?.name || ''
    },
    image: content.images?.[0]?.url || null,
    variantCount: variants.length,
    salePrice: salePrices.length ? Math.min(...salePrices) : (Number(content.salePrice) || null),
    listPrice: listPrices.length ? Math.min(...listPrices) : (Number(content.listPrice) || null),
    quantity,
    variants: variants.slice(0, 20).map(item => ({
      barcode: item.barcode || null,
      salePrice: Number(item.salePrice) || null,
      listPrice: Number(item.listPrice) || null,
      quantity: Number(item.quantity) || 0,
      stockCode: item.stockCode || null
    }))
  };
}

export async function fetchApprovedProductPage(config, page = 0, size = PRODUCT_PAGE_SIZE, fetchImpl = fetch) {
  if (!hasCredentials(config)) throw new Error('Trendyol seller credentials are required.');
  const url = approvedProductsUrl(config.sellerId, page, size);
  const response = await fetchImpl(url, { headers: trendyolAuthHeaders(config) });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Trendyol approved products request failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload?.content)) throw new Error('Trendyol approved products response did not contain content.');
  return payload;
}

async function scanProductsByCategory(categoryId, limit, config, options = {}) {
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('A valid Trendyol category ID is required.');
  const requested = normalizeProductCount(limit);
  const maxPages = Math.min(50, Math.max(1, Number.parseInt(options.maxPages, 10) || MAX_PRODUCT_SCAN_PAGES));
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(options.pageSize, 10) || PRODUCT_PAGE_SIZE));
  const fetchImpl = options.fetchImpl || fetch;
  const products = [];
  let pagesScanned = 0;
  let contentsScanned = 0;
  let totalElements = null;
  let reachedEnd = false;

  for (let page = 0; page < maxPages && products.length < requested; page += 1) {
    const payload = await fetchApprovedProductPage(config, page, pageSize, fetchImpl);
    pagesScanned += 1;
    const content = payload.content;
    contentsScanned += content.length;
    if (Number.isFinite(Number(payload.totalElements))) totalElements = Number(payload.totalElements);

    for (const item of content) {
      if (Number(item?.category?.id) !== id) continue;
      products.push(compactProduct(item));
      if (products.length >= requested) break;
    }

    const totalPages = Number(payload.totalPages);
    const hasTotalPages = Number.isFinite(totalPages) && totalPages >= 0;
    if ((hasTotalPages && page + 1 >= totalPages) || (!hasTotalPages && content.length < pageSize)) {
      reachedEnd = true;
      break;
    }
  }

  return {
    categoryId: id,
    requested,
    found: products.length,
    pagesScanned,
    contentsScanned,
    maxPages,
    scanCapped: !reachedEnd && products.length < requested && pagesScanned >= maxPages,
    totalElements,
    products
  };
}

export function fetchProductsByCategory(categoryId, limit, config, options = {}) {
  const id = Number(categoryId);
  const requested = normalizeProductCount(limit);
  const key = `${config?.sellerId || ''}:${id}:${requested}`;
  if (inFlightProductRequests.has(key)) return inFlightProductRequests.get(key);
  const request = scanProductsByCategory(id, requested, config, options)
    .finally(() => inFlightProductRequests.delete(key));
  inFlightProductRequests.set(key, request);
  return request;
}
