import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CATEGORY_URL = 'https://apigw.trendyol.com/integration/product/product-categories';
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const ATTRIBUTE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_CACHE_PATH = path.resolve('server/cache/trendyol-categories.json');
export const DEFAULT_ATTRIBUTE_CACHE_DIR = path.resolve('server/cache/category-attributes');

const categoryRefreshes = new Map();
const attributeRefreshes = new Map();
const jsonCacheMemory = new Map();
const categoryIndexMemory = new WeakMap();

export function hasCredentials(config = {}) {
  return Boolean(config.sellerId && config.apiKey && config.apiSecret);
}

function authHeaders(config = {}) {
  const authorization = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64');
  return {
    Authorization: `Basic ${authorization}`,
    'User-Agent': `${config.sellerId} - SelfIntegration`,
    storefrontcode: 'TR',
    'Accept-Language': 'tr',
    Accept: 'application/json'
  };
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

function buildCategoryIndex(categories = []) {
  if (categoryIndexMemory.has(categories)) return categoryIndexMemory.get(categories);
  const index = new Map();

  function visit(nodes, parentId = null) {
    const key = parentId === null ? 'root' : String(parentId);
    const compact = [];
    for (const node of nodes || []) {
      const children = Array.isArray(node.subCategories) ? node.subCategories : [];
      const entry = {
        id: Number(node.id),
        name: String(node.name || ''),
        parentId,
        hasChildren: children.length > 0
      };
      compact.push(entry);
      if (children.length) visit(children, entry.id);
    }
    index.set(key, compact);
  }

  visit(categories);
  categoryIndexMemory.set(categories, index);
  return index;
}

export function categoryChildren(categories = [], parentId = null) {
  const key = parentId === null || parentId === undefined || parentId === ''
    ? 'root'
    : String(Number(parentId));
  if (key !== 'root' && !Number.isFinite(Number(parentId))) return [];
  return [...(buildCategoryIndex(categories).get(key) || [])];
}

export function cacheIsFresh(cache, now = Date.now(), ttlMs = CACHE_TTL_MS) {
  if (!cache?.fetchedAt) return false;
  const fetched = Date.parse(cache.fetchedAt);
  return Number.isFinite(fetched) && now - fetched < ttlMs;
}

async function readJsonCache(cachePath) {
  if (jsonCacheMemory.has(cachePath)) return jsonCacheMemory.get(cachePath);
  try {
    const parsed = JSON.parse(await readFile(cachePath, 'utf8'));
    jsonCacheMemory.set(cachePath, parsed);
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJsonCache(cache, cachePath) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  jsonCacheMemory.set(cachePath, cache);
  return cache;
}

export function readCategoryCache(cachePath = DEFAULT_CACHE_PATH) {
  return readJsonCache(cachePath);
}

export function writeCategoryCache(cache, cachePath = DEFAULT_CACHE_PATH) {
  return writeJsonCache(cache, cachePath);
}

export async function fetchTrendyolCategoryTree(config = {}, fetchImpl = fetch) {
  if (!hasCredentials(config)) {
    throw new Error('Trendyol seller ID, API key and API secret are required.');
  }

  const response = await fetchImpl(CATEGORY_URL, { headers: authHeaders(config) });

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

async function coalescedCategoryRefresh(config, options = {}) {
  const cachePath = options.cachePath || DEFAULT_CACHE_PATH;
  if (categoryRefreshes.has(cachePath)) return categoryRefreshes.get(cachePath);

  const refresh = refreshCategoryCache(config, { ...options, cachePath })
    .finally(() => categoryRefreshes.delete(cachePath));
  categoryRefreshes.set(cachePath, refresh);
  return refresh;
}

export async function getCategoryCache(config, options = {}) {
  const cachePath = options.cachePath || DEFAULT_CACHE_PATH;
  const now = options.now ?? Date.now();
  const cached = await readCategoryCache(cachePath);

  if (!options.force && cacheIsFresh(cached, now, options.ttlMs ?? CACHE_TTL_MS)) {
    return { ...cached, stale: false, refreshed: false };
  }

  try {
    const fresh = await coalescedCategoryRefresh(config, { ...options, cachePath, now });
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

export function categoryAttributesUrl(categoryId) {
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('A valid Trendyol leaf category ID is required.');
  return `https://apigw.trendyol.com/integration/product/categories/${id}/attributes`;
}

export function categoryAttributeCachePath(categoryId, cacheDir = DEFAULT_ATTRIBUTE_CACHE_DIR) {
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('A valid Trendyol leaf category ID is required.');
  return path.join(cacheDir, `${id}.json`);
}

export async function fetchTrendyolCategoryAttributes(categoryId, config = {}, fetchImpl = fetch) {
  if (!hasCredentials(config)) {
    throw new Error('Trendyol seller ID, API key and API secret are required.');
  }

  const url = categoryAttributesUrl(categoryId);
  const response = await fetchImpl(url, { headers: authHeaders(config) });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Trendyol category attribute request failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`);
  }

  const payload = await response.json();
  const attributes = Array.isArray(payload?.categoryAttributes)
    ? payload.categoryAttributes
    : Array.isArray(payload?.attributes)
      ? payload.attributes
      : null;
  if (!attributes) throw new Error('Trendyol category attribute response did not contain an attribute list.');

  return {
    categoryId: Number(categoryId),
    categoryName: payload.name || payload.categoryName || null,
    displayName: payload.displayName || null,
    attributes
  };
}

export async function readCategoryAttributeCache(categoryId, cacheDir = DEFAULT_ATTRIBUTE_CACHE_DIR) {
  return readJsonCache(categoryAttributeCachePath(categoryId, cacheDir));
}

export async function refreshCategoryAttributeCache(categoryId, config, options = {}) {
  const data = await fetchTrendyolCategoryAttributes(categoryId, config, options.fetchImpl || fetch);
  const fetchedAt = new Date(options.now ?? Date.now()).toISOString();
  const requiredCount = data.attributes.filter(attribute => attribute?.required === true).length;
  const cache = {
    categoryId: data.categoryId,
    categoryName: data.categoryName,
    displayName: data.displayName,
    fetchedAt,
    source: categoryAttributesUrl(categoryId),
    stats: { total: data.attributes.length, required: requiredCount },
    attributes: data.attributes
  };
  const cachePath = categoryAttributeCachePath(categoryId, options.cacheDir || DEFAULT_ATTRIBUTE_CACHE_DIR);
  return writeJsonCache(cache, cachePath);
}

async function coalescedAttributeRefresh(categoryId, config, options = {}) {
  const cacheDir = options.cacheDir || DEFAULT_ATTRIBUTE_CACHE_DIR;
  const key = categoryAttributeCachePath(categoryId, cacheDir);
  if (attributeRefreshes.has(key)) return attributeRefreshes.get(key);

  const refresh = refreshCategoryAttributeCache(categoryId, config, { ...options, cacheDir })
    .finally(() => attributeRefreshes.delete(key));
  attributeRefreshes.set(key, refresh);
  return refresh;
}

export async function getCategoryAttributeCache(categoryId, config, options = {}) {
  const cacheDir = options.cacheDir || DEFAULT_ATTRIBUTE_CACHE_DIR;
  const now = options.now ?? Date.now();
  const cached = await readCategoryAttributeCache(categoryId, cacheDir);

  if (!options.force && cacheIsFresh(cached, now, options.ttlMs ?? ATTRIBUTE_CACHE_TTL_MS)) {
    return { ...cached, stale: false, refreshed: false };
  }

  try {
    const fresh = await coalescedAttributeRefresh(categoryId, config, { ...options, cacheDir, now });
    return { ...fresh, stale: false, refreshed: true };
  } catch (error) {
    if (cached?.attributes) {
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
