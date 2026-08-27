import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CACHE_TTL_MS,
  getCategoryCache,
  hasCredentials,
  readCategoryCache,
  refreshCategoryCache
} from './trendyol-categories.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');
const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;

async function loadDotEnv() {
  try {
    const text = await readFile(ENV_PATH, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

await loadDotEnv();

const PORT = Number(process.env.PORT) || 8000;
const trendyolConfig = {
  sellerId: process.env.TRENDYOL_SELLER_ID,
  apiKey: process.env.TRENDYOL_API_KEY,
  apiSecret: process.env.TRENDYOL_API_SECRET
};

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};
const publicPrefixes = ['/css/', '/js/', '/data/'];

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

async function categoryPayload(force = false) {
  const cache = await getCategoryCache(trendyolConfig, { force, ttlMs: CACHE_TTL_MS });
  return {
    configured: hasCredentials(trendyolConfig),
    fetchedAt: cache.fetchedAt,
    stale: Boolean(cache.stale),
    refreshed: Boolean(cache.refreshed),
    refreshError: cache.refreshError || null,
    stats: cache.stats,
    categories: cache.categories
  };
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/trendyol/categories' && req.method === 'GET') {
    try {
      json(res, 200, await categoryPayload(false));
    } catch (error) {
      json(res, 503, {
        configured: hasCredentials(trendyolConfig),
        error: error.message,
        hint: 'Copy .env.example to .env and enter Trendyol seller credentials.'
      });
    }
    return true;
  }

  if (url.pathname === '/api/trendyol/categories/refresh' && req.method === 'POST') {
    if (!hasCredentials(trendyolConfig)) {
      json(res, 503, {
        configured: false,
        error: 'Trendyol credentials are not configured.'
      });
      return true;
    }
    try {
      json(res, 200, await categoryPayload(true));
    } catch (error) {
      json(res, 502, { configured: true, error: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/trendyol/categories/status' && req.method === 'GET') {
    const cache = await readCategoryCache();
    json(res, 200, {
      configured: hasCredentials(trendyolConfig),
      cached: Boolean(cache?.categories),
      fetchedAt: cache?.fetchedAt || null,
      stale: cache?.fetchedAt ? Date.now() - Date.parse(cache.fetchedAt) >= CACHE_TTL_MS : true,
      stats: cache?.stats || null
    });
    return true;
  }

  return false;
}

async function serveStatic(res, url) {
  const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const allowed = pathname === '/index.html' || publicPrefixes.some(prefix => pathname.startsWith(prefix));
  if (!allowed || pathname.split('/').some(segment => segment.startsWith('.'))) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const requested = path.resolve(ROOT, `.${pathname}`);
  if (!requested.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const data = await readFile(requested);
    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(requested).toLowerCase()] || 'application/octet-stream'
    });
    res.end(data);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      if (await handleApi(req, res, url)) return;
      json(res, 404, { error: 'API route not found.' });
      return;
    }
    await serveStatic(res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: 'Internal server error.' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`FiyatTakip running at http://localhost:${PORT}`);
  console.log(`Trendyol category sync: ${hasCredentials(trendyolConfig) ? 'configured' : 'credentials missing'}`);
});

if (hasCredentials(trendyolConfig)) {
  getCategoryCache(trendyolConfig).catch(error => console.error('Initial Trendyol category sync failed:', error.message));
  const timer = setInterval(() => {
    refreshCategoryCache(trendyolConfig)
      .then(cache => console.log(`Trendyol categories refreshed: ${cache.fetchedAt}`))
      .catch(error => console.error('Scheduled Trendyol category refresh failed:', error.message));
  }, DAILY_REFRESH_MS);
  timer.unref();
}
