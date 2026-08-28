# FiyatTakip

Browser-first marketplace profitability calculator with a **Python Trendyol public-listing scraper**.

## Trendyol listing scraper

The visible Trendyol workflow no longer depends on Trendyol's seller/integration API.

1. Install Node.js 20+ and Python 3.11+.
2. Install Python dependencies:

```bash
pip install -r requirements.txt
python -m playwright install chromium
```

3. Start the local app:

```bash
npm start
```

4. Open `http://localhost:8000`.
5. Paste a Trendyol listing URL, choose the product count and how many products should appear per row, then click **Ürün Getir**.

The default URL is:

```text
https://www.trendyol.com/sirali-urunler?categoryId=109664&type=bestSeller&webGenderId=0
```

### What is collected

For each visible marketplace product card the scraper returns:

- Full product title; older Trendyol cards that split brand and product name are recombined.
- Product URL.
- TL price text exactly as written on the card.
- All additional visible TL price strings when multiple prices are shown.
- Numeric current-price value for sending the product to the profitability calculator.
- Remaining visible card text in original order, including marketplace signals such as `Son 3 günde ... satıldı`, ratings, campaign copy, delivery labels and similar information when Trendyol shows them.

### No images

The scraper does not collect image URLs or render product images in FiyatTakip.

- Normal mode downloads only the listing HTML.
- If the page requires JavaScript rendering, Playwright is used as a fallback.
- In Playwright mode, `image`, `font`, and `media` requests are blocked before loading.

### Display modes

Choose **Satır başına ürün**:

- `1` — list mode. Full product title and all collected metadata are displayed without a clamp.
- `2-4` — compact grid mode. Titles and metadata remain visually limited so multiple cards can fit on the same row.
- On narrow mobile screens the layout collapses to one column and full text is shown.

The default fetch count is 10. **+10 Daha Getir** increases the requested total up to 200.

## Scraper architecture

- `server/trendyol_scraper.py` — Python public-page scraper using Requests + BeautifulSoup with an optional Playwright render fallback.
- `server/server.js` — local Node web server and Node→Python bridge for `/scrape/trendyol`.
- `js/trendyol-scraper-ui.js` — listing controls, responsive product cards and calculator transfer.
- `css/trendyol-scraper.css` — 1/2/3/4-column listing layouts.
- `test/trendyol_scraper_test.py` — parser regression tests for full titles, Turkish TL prices and metadata.

The project still contains the older seller-integration bridge files for backward compatibility with previously saved/category-related work, but that legacy bridge is hidden and is **not used by the visible listing scraper**.

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
- One-click transfer from a scraped Trendyol product into the calculator

## Tests

JavaScript:

```bash
npm test
```

Python scraper:

```bash
pip install -r requirements.txt
python -m unittest discover -s test -p '*_test.py'
```

The scraper tests use fixture HTML only and make no real Trendyol request.
