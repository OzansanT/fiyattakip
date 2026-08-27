import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CATEGORY_URL = 'https://apigw.trendyol.com/integration/product/product-categories';
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CACHE_PATH = path.resolve('server/cache/trendyol-categories.json');

export function hasCredentials(config = {}) {
  return Boolean(config.sellerId && config.apiKey && config.apiSecret);
}

export function countCategoryTree(categories = []) {
  let total = 0;
  let leaves = 0;
  let maxDepth = 0;

  function visit(nodes, depth) {
    for (const node of nodes || []) {
      total += 1;
      maxDepth = Math.max(maxDepth, depth);
      const children = Array.isArray(node.subCategories) ? node.subCategories : [];
      if (children.length === 0) leaves += 1;
      else visit(children, depth + 1);
    }
  }

  visit(categories, 1);
  return { total, leaves, maxDepth };
}

export function cacheIsFresh(cache, now = Date.now(), ttlMs = CACHE_TTL_MS) {
  if (!cache?.fetchedAt) return false;
  const fetched = Date.parse(cache.fetchedAt);
  return Number.isFinite(fetched) && now - fetched < ttlMs;
}

export async function readCategoryCache(cachePath = DEFAULT_CACHE_PATH) {
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeCategoryCache(cache, cachePath = DEFAULT_CACHE_PATH) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  return cache;
}

export async function fetchTrendyolCategoryTree(config = {}, fetchImpl = fetch) {
  if (!hasCredentials(config)) {
    throw new Error('Trendyol seller ID, API key and API secret are required.');
  }

  const authorization = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64');
  const response = await fetchImpl(CATEGORY_URL, {
    headers: {
      Authorization: `Basic ${authorization}`,
      'User-Agent': `${config.sellerId} - SelfIntegration`,
      storefrontcode: 'TR',
      'Accept-Language': 'tr',
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Trendyol category request failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.categories)) {
    throw new Error('Trendyol category response did not contain a categories array.');
  }

  return payload.categories;
}

export async function refreshCategoryCache(config, options = {}) {
  const categories = await fetchTrendyolCategoryTree(config, options.fetchImpl || fetch);
  const fetchedAt = new Date(options.now ?? Date.now()).toISOString();
  const stats = countCategoryTree(categories);
  const cache = { fetchedAt, source: CATEGORY_URL, stats, categories };
  return writeCategoryCache(cache, options.cachePath || DEFAULT_CACHE_PATH);
}

export async function getCategoryCache(config, options = {}) {
  const cachePath = options.cachePath || DEFAULT_CACHE_PATH;
  const now = options.now ?? Date.now();
  const cached = await readCategoryCache(cachePath);

  if (!options.force && cacheIsFresh(cached, now, options.ttlMs ?? CACHE_TTL_MS)) {
    return { ...cached, stale: false, refreshed: false };
  }

  try {
    const fresh = await refreshCategoryCache(config, { ...options, cachePath, now });
    return { ...fresh, stale: false, refreshed: true };
  } catch (error) {
    if (cached?.categories) {
      return {
        ...cached,
        stale: true,
        refreshed: false,
        refreshError: error.message
      };
    }
    throw error;
  }
}
