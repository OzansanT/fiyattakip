import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))

from trendyol_scraper import parse_products, parse_price_value, validate_url  # noqa: E402


class TrendyolScraperTests(unittest.TestCase):
    def test_full_title_tl_prices_and_card_metadata(self):
        html = """
        <div class="p-card-wrppr">
          <a href="/brand/full-product-name-p-123">
            <span class="prdct-desc-cntnr-ttl">BrandX</span>
            <span class="prdct-desc-cntnr-name">Very Long Full Product Name 500 ml Special Edition</span>
            <div class="social-proof">Son 3 günde 120+ satıldı</div>
            <div class="rating-score">4.8 (230)</div>
            <div class="prc-box-dscntd">1.249,90 TL</div>
            <div class="prc-box-orgnl">1.499 TL</div>
          </a>
        </div>
        """
        product = parse_products(html, "https://www.trendyol.com/test", 10)[0]

        self.assertEqual(
            product.title,
            "BrandX Very Long Full Product Name 500 ml Special Edition",
        )
        self.assertEqual(product.price_text, "1.249,90 TL")
        self.assertEqual(product.price_value, 1249.90)
        self.assertIn("1.499 TL", product.prices)
        self.assertEqual(product.metadata, ["Son 3 günde 120+ satıldı", "4.8 (230)"])
        self.assertEqual(product.url, "https://www.trendyol.com/brand/full-product-name-p-123")

    def test_turkish_price_parsing(self):
        self.assertEqual(parse_price_value("2.345 TL"), 2345.0)
        self.assertEqual(parse_price_value("Sepette 999,95 TL"), 999.95)

    def test_only_trendyol_hosts_are_allowed(self):
        self.assertEqual(validate_url("https://www.trendyol.com/sirali-urunler"), "https://www.trendyol.com/sirali-urunler")
        with self.assertRaises(ValueError):
            validate_url("https://example.com/products")


if __name__ == "__main__":
    unittest.main()
