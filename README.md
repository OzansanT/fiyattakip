# FiyatTakip

Browser-first marketplace profitability and reverse-pricing calculator with a local Trendyol API bridge.

FiyatTakip helps answer a sourcing question: **is this product worth buying at this price?** It calculates net profit, ROI, margin, break-even sale price, maximum acceptable purchase price, and the sale price required to hit a target ROI.

## MVP features

- Secure Trendyol category-tree synchronization through a local Node bridge
- 24-hour local category cache with automatic refresh while the bridge is running
- Manual **Şimdi Yenile** category refresh
- In-flight request coalescing so concurrent callers share one full-tree download
- Stale-cache fallback if Trendyol is temporarily unavailable
- Parent → child → leaf category navigation with Trendyol category IDs
- Lazy category-attribute loading for one selected leaf only
- Per-leaf attribute cache; there is no bulk attribute crawler
- Saved opportunities retain Trendyol leaf ID and full category path
- Manual purchase and expected sale price entry
- Marketplace commission, advertising and return-reserve percentages
- Shipping, packaging and other fixed costs
- Live net-profit, ROI and margin calculation
- Reverse maximum-buy-price calculation for a target ROI
- Required sale price for a target ROI
- Break-even sale price
- Purchase/negotiation guidance
- Profit waterfall
- Saved sourcing opportunities persisted locally with IndexedDB
- Opportunity table with reload/delete actions
- CSV and JSON bulk opportunity import
- Batch IndexedDB persistence for imports
- Search and filters for product/category, minimum ROI and decision status
- Sorting by ROI, profit, safety margin, capital requirement, or recent update
- Category rule seed data in JSON
- Responsive UI
- Zero-dependency calculation, import, category and opportunity-model tests

## Run with Trendyol categories

Requires Node.js 20+.

1. Copy `.env.example` to `.env`.
2. Fill in the credentials from Trendyol Seller Panel → Hesap Bilgilerim → Entegrasyon Bilgileri.
3. Never commit or share `.env`; it is ignored by Git.
4. Start FiyatTakip:

```bash
npm start
```

Then open `http://localhost:8000`.

Example local configuration:

```env
TRENDYOL_SELLER_ID=123456
TRENDYOL_API_KEY=your_api_key
TRENDYOL_API_SECRET=your_api_secret
PORT=8000
```

The browser never receives the API key or API secret. The local Node bridge calls Trendyol with Basic Authentication and the required seller `User-Agent`.

## Category refresh behavior

Trendyol category data is fetched from:

```text
GET https://apigw.trendyol.com/integration/product/product-categories
```

The response already contains the complete nested tree. FiyatTakip performs one category-tree request and lets the browser navigate its cached parent/child levels locally instead of making separate network requests for subcategories.

FiyatTakip considers the tree cache stale after **24 hours**. A normal page load uses the fresh cache immediately or refreshes it when stale. While the Node bridge remains running, it also schedules a refresh every 24 hours. The **Şimdi Yenile** button forces an immediate request at any time.

### Duplicate-fetch protection

The Node bridge coalesces concurrent tree refreshes. For example, if server startup begins a refresh and the browser opens immediately, both callers await the same in-flight request instead of starting two full Trendyol downloads. The same protection applies if a scheduled/manual request overlaps an existing refresh.

If a refresh fails but a previous category cache exists, FiyatTakip returns the previous tree and labels it as stale rather than removing category access.

Runtime category data is stored locally in `server/cache/trendyol-categories.json` and is ignored by Git.

## Lazy leaf attributes — no bulk crawl

Category attributes use Trendyol Product V2:

```text
GET https://apigw.trendyol.com/integration/product/categories/{categoryId}/attributes
```

FiyatTakip does **not** loop through the category tree and does **not** fetch attributes for every leaf. Selecting a leaf category only enables the **Özellikleri Yükle** button. No attribute request happens until that button is clicked.

When clicked:

1. Only the currently selected leaf category ID is requested.
2. Its attribute metadata is cached under `server/cache/category-attributes/{categoryId}.json`.
3. Reopening the same leaf uses the fresh cache instead of Trendyol.
4. Concurrent requests for the same leaf are coalesced into one upstream request.
5. **Özellikleri Yenile** can force a refresh for that single leaf.

Attribute caches use a **7-day TTL** because Trendyol recommends refreshing category attributes weekly. This is intentionally separate from the daily category-tree refresh. The daily tree job never walks leaves and never downloads attributes.

The UI renders attribute metadata only (for example required/optional flags). It does not prefetch every possible attribute value. Product V2 exposes attribute values separately, which can be added later with the same per-attribute lazy strategy.

## Saved Trendyol category identity

When a leaf category is selected and an opportunity is saved, the record stores a snapshot similar to:

```json
{
  "trendyolCategory": {
    "id": 12,
    "name": "Mouse",
    "pathIds": [10, 11, 12],
    "pathNames": ["Elektronik", "Bilgisayar", "Mouse"]
  }
}
```

Loading that opportunity restores its category path when the current category tree contains those IDs. Opportunity search also matches the Trendyol path.

## Category identity vs. profitability rules

A real Trendyol category ID is not currently treated as proof of a specific commission rate. The existing `general`, `electronics`, `home`, and `fashion` values are still local example profitability profiles. This separation prevents the app from assigning unsupported commercial terms to a Trendyol category. Category-to-commercial-rule mapping can be developed after the category/attribute layer is stable.

## Saved opportunities

Saved opportunities remain on the current browser/device through IndexedDB. No account or remote database is required.

## Bulk import

CSV requires at least a product name, purchase price and sale price. English and common Turkish column aliases are supported. Example:

```csv
name,purchasePrice,salePrice,category
Mouse A,420,799,electronics
Keyboard,700,1299,electronics
```

Turkish semicolon-delimited CSV with decimal commas is also accepted:

```csv
Ürün adı;Alış fiyatı;Satış fiyatı;Kategori
Mouse;499,90;899,90;electronics
```

JSON may be a direct array or contain a `products` / `opportunities` array:

```json
{
  "products": [
    {"name":"Mouse A","purchasePrice":420,"salePrice":799,"category":"electronics"}
  ]
}
```

Optional imported fields include commission, advertising, return reserve, target ROI, shipping, packaging and other costs. Missing cost fields inherit the app's current category seed assumptions.

## Test

```bash
npm test
```

Tests do not call the real Trendyol API; category and attribute clients use injected mock responses.

## Architecture

- `server/server.js` — local HTTP server, static app host and Trendyol category/attribute API routes
- `server/trendyol-categories.js` — authenticated clients, request coalescing, tree cache and per-leaf attribute cache
- `server/cache/` — local runtime caches; JSON files are not committed
- `index.html` — application shell, category explorer, lazy attribute panel, scanner filters and opportunity workspace
- `css/styles.css` — core responsive UI styling
- `css/trendyol-attributes.css` — lazy category-attribute panel styling
- `js/trendyol-categories.js` — pure tree navigation plus browser category/attribute API clients
- `js/calculator.js` — pure calculation engine
- `js/importer.js` — CSV/JSON parsing, header aliases and localized number parsing
- `js/opportunities.js` — saved-opportunity snapshots, Trendyol leaf identity, filtering and sorting rules
- `js/storage.js` — IndexedDB single-record and batch persistence adapter
- `js/app.js` — browser bindings and rendering
- `data/category-rules.json` — seed marketplace/category assumptions
- `test/` — calculation, import, category and opportunity-model regression tests
