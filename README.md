# FiyatTakip

Browser-first marketplace profitability and reverse-pricing calculator.

FiyatTakip helps answer a sourcing question: **is this product worth buying at this price?** It calculates net profit, ROI, margin, break-even sale price, maximum acceptable purchase price, and the sale price required to hit a target ROI.

## MVP features

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
- Sorting by ROI, profit, safety margin, capital requirement, or recent update
- Category rule seed data in JSON
- Responsive standalone UI
- Zero-dependency calculation and opportunity-model tests

## Run

The UI is plain HTML/CSS/JavaScript. Serve the repository with any static web server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Saved opportunities remain on the current browser/device through IndexedDB. No account or remote database is required.

## Test

Requires Node.js 20+.

```bash
npm test
```

## Architecture

- `index.html` — application shell and opportunity workspace
- `css/styles.css` — responsive UI styling
- `js/calculator.js` — pure calculation engine
- `js/opportunities.js` — saved-opportunity snapshots and sorting rules
- `js/storage.js` — IndexedDB persistence adapter
- `js/app.js` — browser bindings and rendering
- `data/category-rules.json` — seed marketplace/category assumptions
- `test/` — calculation and opportunity-model regression tests

The calculation engine and opportunity model are intentionally independent from the DOM so future Trendyol, Hepsiburada or other marketplace adapters can feed them without coupling marketplace API code to profitability formulas.

## Important assumption

The current category values are **seed/example rules**, not authoritative Trendyol commission tables. Future integration should fetch marketplace category identities separately and maintain commercial rules as explicit, versioned configuration.
