# FiyatTakip

Browser-first marketplace profitability and reverse-pricing calculator with a local Trendyol API bridge.

## Trendyol flow

FiyatTakip now uses an explicit, low-traffic workflow:

1. Start the local app with `npm start`.
2. Click **Kategori Adlarını Getir**. No Trendyol request is made automatically on page load.
3. Search and select one Trendyol leaf category.
4. Enter how many products you want (`1-100`).
5. Click **Ürünleri Getir**.
6. Optionally send a returned product to the profitability calculator and enter its purchase cost manually.

### Category names

The official category endpoint returns the complete nested category tree:

```text
GET https://apigw.trendyol.com/integration/product/product-categories
```

The Node bridge caches that response for 24 hours, flattens only leaf categories, and sends the browser compact records containing category ID, category name and full path. A fresh cache causes no upstream Trendyol request. **Kategori Adlarını Yenile** forces a refresh.

There is no automatic category request at server startup or browser startup.

### Products for a selected category

FiyatTakip uses the Product V2 approved-products endpoint for the configured seller:

```text
GET https://apigw.trendyol.com/integration/product/sellers/{sellerId}/products/approved
```

Trendyol's documented V2 approved-products filters do not include `categoryId`. Therefore FiyatTakip cannot ask the official API for “only category X” in one call. Instead, after the user explicitly clicks **Ürünleri Getir**, it scans approved-product pages and keeps only products whose returned `category.id` equals the selected category ID.

Performance safeguards:

- No product request until the user clicks **Ürünleri Getir**.
- Requested result count is limited to 1-100.
- API page size is at most 100.
- The scanner stops immediately when the requested number of category matches is found.
- The scanner stops after 10 pages (maximum 1,000 approved contents checked) even if fewer matches were found.
- Concurrent requests for the same category/count share one in-flight scan.
- The UI reports how many pages and store products were checked and whether the safety cap was reached.

This endpoint lists products from **your configured Trendyol seller store**. It is not a general Trendyol marketplace catalog/search API.

## Setup

Requires Node.js 20+.

```bash
cp .env.example .env
```

Fill `.env` with your Trendyol integration credentials:

```env
TRENDYOL_SELLER_ID=123456
TRENDYOL_API_KEY=your_api_key
TRENDYOL_API_SECRET=your_api_secret
PORT=8000
```

Then:

```bash
npm start
```

Open `http://localhost:8000`.

The API key and secret stay in the local Node process and are never exposed to browser JavaScript or committed to Git.

## Profitability features

- Purchase and expected sale price entry
- Commission, advertising and return-reserve percentages
- Shipping, packaging and other fixed costs
- Net profit, ROI and margin
- Break-even sale price
- Maximum purchase price for target ROI
- Required sale price for target ROI
- Saved opportunities in IndexedDB
- CSV/JSON bulk opportunity import
- Opportunity search, filters and sorting
- Saved Trendyol leaf category identity/path

## Architecture

- `server/server.js` — local HTTP/API bridge; makes no Trendyol call at startup
- `server/trendyol-categories.js` — secure category client, 24-hour cache and leaf-name flattening
- `server/trendyol-products.js` — bounded approved-product page scanner
- `js/trendyol-categories.js` — browser API client for explicit category/product requests
- `js/app.js` — UI bindings, calculator and opportunity workspace
- `js/calculator.js` — pure profitability engine
- `js/importer.js` — CSV/JSON importer
- `js/opportunities.js` — saved-opportunity model, filtering and sorting
- `js/storage.js` — IndexedDB persistence
- `test/` — regression tests; no real Trendyol calls are made during tests

## Test

```bash
npm test
```

The test suite verifies category cache behavior, no implicit browser bulk route, explicit category/count product requests, bounded page scanning, request coalescing, calculator behavior and imports.
