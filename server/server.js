import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CACHE_TTL_MS,
  flattenLeafCategories,
  getCategoryCache,
  hasCredentials,
  readCategoryCache
} from './trendyol-categories.js';
import { fetchProductsByCategory, normalizeProductCount } from './trendyol-products.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');
const SCRAPER_PATH = path.join(ROOT, 'server', 'trendyol_scraper.py');
const MAX_BODY_BYTES = 32 * 1024;
const MAX_SCRAPER_OUTPUT_BYTES = 8 * 1024 * 1024;

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

function normalizeListingCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(200, Math.max(1, parsed));
}

function validateListingUrl(value) {
  const url = new URL(String(value || ''));
  const hostname = url.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https URLs are supported.');
  if (hostname !== 'trendyol.com' && !hostname.endsWith('.trendyol.com')) {
    throw new Error('Only trendyol.com listing URLs are allowed.');
  }
  return url.toString();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function runPython(command, url, limit) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [SCRAPER_PATH, '--url', url, '--limit', String(limit)], {
      cwd: ROOT,
      env: process.env,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('Trendyol scraping timed out after 75 seconds.'));
    }, 75_000);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > MAX_SCRAPER_OUTPUT_BYTES && !settled) {
        settled = true;
        clearTimeout(timer);
        child.kill('SIGKILL');
        reject(new Error('Scraper output exceeded the safety limit.'));
      }
    });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let payload;
      try {
        payload = JSON.parse(stdout || '{}');
      } catch {
        return reject(new Error(`Python scraper returned invalid JSON${stderr ? `: ${stderr.slice(0, 400)}` : ''}`));
      }
      if (code !== 0 || payload.error) {
        return reject(new Error(payload.error || stderr.trim() || `Python scraper exited with code ${code}.`));
      }
      resolve(payload);
    });
  });
}

async function runListingScraper(url, limit) {
  const preferred = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
  try {
    return await runPython(preferred, url, limit);
  } catch (error) {
    if (process.env.PYTHON_BIN || error?.code !== 'ENOENT') throw error;
    const fallback = preferred === 'python' ? 'python3' : 'python';
    return runPython(fallback, url, limit);
  }
}

async function categoryNamesPayload(force = false) {
  const cache = await getCategoryCache(trendyolConfig, { force, ttlMs: CACHE_TTL_MS });
  return {
    configured: hasCredentials(trendyolConfig),
    fetchedAt: cache.fetchedAt,
    stale: Boolean(cache.stale),
    refreshed: Boolean(cache.refreshed),
    refreshError: cache.refreshError || null,
    stats: cache.stats,
    categories: flattenLeafCategories(cache.categories)
  };
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/trendyol/category-names' && req.method === 'GET') {
    try {
      json(res, 200, await categoryNamesPayload(false));
    } catch (error) {
      json(res, 503, {
        configured: hasCredentials(trendyolConfig),
        error: error.message,
        hint: 'Copy .env.example to .env and enter Trendyol seller credentials.'
      });
    }
    return true;
  }

  if (url.pathname === '/api/trendyol/category-names/refresh' && req.method === 'POST') {
    if (!hasCredentials(trendyolConfig)) {
      json(res, 503, { configured: false, error: 'Trendyol credentials are not configured.' });
      return true;
    }
    try {
      json(res, 200, await categoryNamesPayload(true));
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

  const productMatch = url.pathname.match(/^\/api\/trendyol\/categories\/(\d+)\/products$/);
  if (productMatch && req.method === 'GET') {
    const categoryId = Number(productMatch[1]);
    const limit = normalizeProductCount(url.searchParams.get('limit'));
    if (!hasCredentials(trendyolConfig)) {
      json(res, 503, { configured: false, error: 'Trendyol credentials are not configured.' });
      return true;
    }
    try {
      json(res, 200, await fetchProductsByCategory(categoryId, limit, trendyolConfig));
    } catch (error) {
      json(res, 502, { configured: true, categoryId, requested: limit, error: error.message });
    }
    return true;
  }

  return false;
}

async function handleScrape(req, res, url) {
  if (url.pathname !== '/scrape/trendyol' || req.method !== 'POST') return false;
  try {
    const body = await readJsonBody(req);
    const listingUrl = validateListingUrl(body.url);
    const limit = normalizeListingCount(body.limit);
    const payload = await runListingScraper(listingUrl, limit);
    json(res, 200, payload);
  } catch (error) {
    json(res, 502, {
      error: error.message,
      hint: 'Install Python dependencies with: pip install -r requirements.txt. For rendered fallback also run: python -m playwright install chromium'
    });
  }
  return true;
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
    if (await handleScrape(req, res, url)) return;
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
  console.log('Public listing scraper: Python, no Trendyol API, image/font/media requests blocked in browser fallback.');
  console.log(`Legacy seller bridge: ${hasCredentials(trendyolConfig) ? 'configured' : 'credentials missing'} (not used by the listing scraper).`);
});
