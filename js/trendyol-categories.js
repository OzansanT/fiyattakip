async function parseResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${fallbackMessage} (${response.status}).`);
  return payload;
}

async function requestCategoryNames(force, fetchImpl) {
  const url = force ? '/api/trendyol/category-names/refresh' : '/api/trendyol/category-names';
  const payload = await parseResponse(
    await fetchImpl(url, { method: force ? 'POST' : 'GET' }),
    'Category names request failed'
  );
  if (!Array.isArray(payload.categories)) throw new Error('Category names response is missing categories.');
  return payload;
}

export function loadTrendyolCategoryNames(fetchImpl = fetch) {
  return requestCategoryNames(false, fetchImpl);
}

export function refreshTrendyolCategoryNames(fetchImpl = fetch) {
  return requestCategoryNames(true, fetchImpl);
}

export async function loadTrendyolCategoryProducts(categoryId, limit, fetchImpl = fetch) {
  const id = Number(categoryId);
  const count = Number.parseInt(limit, 10);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Geçerli bir Trendyol kategorisi seç.');
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Ürün sayısı 1 ile 100 arasında olmalı.');
  const payload = await parseResponse(
    await fetchImpl(`/api/trendyol/categories/${id}/products?limit=${count}`, { method: 'GET' }),
    'Category products request failed'
  );
  if (!Array.isArray(payload.products)) throw new Error('Category products response is missing products.');
  return payload;
}
