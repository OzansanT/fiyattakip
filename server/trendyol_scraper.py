#!/usr/bin/env python3
"""Public Trendyol listing scraper used by FiyatTakip.

This module does not use Trendyol's seller/integration APIs. It reads the public
listing page HTML and, when needed, renders that page with Playwright. Browser
mode blocks image, font, and media resources so product images are not pulled.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from dataclasses import dataclass, asdict
from typing import Iterable
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag

DEFAULT_URL = (
    "https://www.trendyol.com/sirali-urunler"
    "?categoryId=109664&type=bestSeller&webGenderId=0"
)
MAX_LIMIT = 200
CARD_SELECTORS = (
    "div.p-card-wrppr",
    "div.p-card-chldrn-cntnr",
    "div.product-card",
    "article.product-card",
    "[data-testid='product-card']",
    "[data-product-id]",
)
TITLE_SELECTORS = (
    ".prdct-desc-cntnr-ttl",
    ".prdct-desc-cntnr-name",
    "[data-testid='product-title']",
    ".product-name",
    "h3",
    "h2",
)
PRICE_SELECTORS = (
    ".prc-box-dscntd",
    ".prc-box-sllng",
    ".prc-box-orgnl",
    ".price-item",
    ".product-price",
    "[data-testid='price-current']",
    "[class*='price']",
)

TL_RE = re.compile(r"(?<!\d)(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:TL|₺)", re.I)
SPACE_RE = re.compile(r"\s+")


@dataclass
class Product:
    rank: int
    title: str
    url: str
    price_text: str
    price_value: float | None
    prices: list[str]
    metadata: list[str]


def clean_text(value: str | None) -> str:
    return SPACE_RE.sub(" ", value or "").strip()


def validate_url(value: str) -> str:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only http/https Trendyol URLs are supported.")
    if host != "trendyol.com" and not host.endswith(".trendyol.com"):
        raise ValueError("Only trendyol.com listing URLs are allowed.")
    return value


def normalize_limit(value: int | str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = 10
    return max(1, min(MAX_LIMIT, parsed))


def dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for raw in values:
        value = clean_text(raw)
        key = value.casefold()
        if not value or key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def parse_price_value(text: str) -> float | None:
    match = TL_RE.search(text or "")
    if not match:
        return None
    normalized = match.group(1).replace(".", "").replace(",", ".")
    try:
        return float(normalized)
    except ValueError:
        return None


def find_cards(soup: BeautifulSoup) -> list[Tag]:
    for selector in CARD_SELECTORS:
        cards = [node for node in soup.select(selector) if isinstance(node, Tag)]
        if cards:
            unique: list[Tag] = []
            seen_links: set[str] = set()
            for card in cards:
                link = card.select_one("a[href*='-p-'], a[href*='/p-'], a[href]")
                href = clean_text(link.get("href") if link else "")
                marker = href or clean_text(card.get("data-product-id")) or str(id(card))
                if marker in seen_links:
                    continue
                seen_links.add(marker)
                unique.append(card)
            if unique:
                return unique

    derived: list[Tag] = []
    seen: set[int] = set()
    for link in soup.select("a[href*='-p-'], a[href*='/p-']"):
        node: Tag | None = link if isinstance(link, Tag) else None
        for _ in range(5):
            if not node or not isinstance(node.parent, Tag):
                break
            node = node.parent
            text = clean_text(node.get_text(" ", strip=True))
            if 30 <= len(text) <= 2500:
                break
        if node and id(node) not in seen:
            seen.add(id(node))
            derived.append(node)
    return derived


def extract_title(card: Tag) -> str:
    brand_node = card.select_one(".prdct-desc-cntnr-ttl")
    name_node = card.select_one(".prdct-desc-cntnr-name")
    brand = clean_text(brand_node.get_text(" ", strip=True) if brand_node else "")
    name = clean_text(name_node.get_text(" ", strip=True) if name_node else "")
    if name:
        if brand and not name.casefold().startswith(brand.casefold()):
            return clean_text(f"{brand} {name}")
        return name

    pieces: list[str] = []
    for selector in TITLE_SELECTORS[2:]:
        for node in card.select(selector):
            text = clean_text(node.get_text(" ", strip=True))
            if text:
                pieces.append(text)
        if pieces:
            break

    if not pieces:
        link = card.select_one("a[href*='-p-'], a[href*='/p-'], a[href]")
        if link:
            pieces.append(clean_text(link.get("title")))
            pieces.append(clean_text(link.get_text(" ", strip=True)))

    pieces = dedupe(pieces)
    if not pieces:
        return "Adsız Trendyol ürünü"
    return max(pieces, key=len)


def extract_link(card: Tag, base_url: str) -> str:
    link = card.select_one("a[href*='-p-'], a[href*='/p-'], a[href]")
    href = clean_text(link.get("href") if link else "")
    return urljoin(base_url, href) if href else base_url


def extract_price_texts(card: Tag) -> list[str]:
    candidates: list[str] = []
    for selector in PRICE_SELECTORS:
        for node in card.select(selector):
            text = clean_text(node.get_text(" ", strip=True))
            if TL_RE.search(text):
                candidates.append(text)

    if not candidates:
        candidates.extend(
            clean_text(text)
            for text in card.stripped_strings
            if TL_RE.search(clean_text(text))
        )

    return dedupe(candidates)


def extract_metadata(card: Tag, title: str, prices: list[str]) -> list[str]:
    price_keys = {clean_text(value).casefold() for value in prices}
    title_key = clean_text(title).casefold()
    metadata: list[str] = []

    for raw in card.stripped_strings:
        text = clean_text(raw)
        key = text.casefold()
        if not text or key == title_key or key in price_keys:
            continue
        if len(text) >= 3 and (title_key.startswith(key) or title_key.endswith(key)):
            continue
        if TL_RE.fullmatch(text):
            continue
        if text in {"Favorilere Ekle", "Sepete Ekle", "İncele"}:
            continue
        metadata.append(text)

    return dedupe(metadata)


def parse_products(html: str, base_url: str, limit: int) -> list[Product]:
    soup = BeautifulSoup(html, "html.parser")
    products: list[Product] = []
    seen_urls: set[str] = set()

    for card in find_cards(soup):
        title = extract_title(card)
        url = extract_link(card, base_url)
        if url in seen_urls:
            continue
        seen_urls.add(url)
        prices = extract_price_texts(card)
        price_text = prices[0] if prices else "Fiyat bulunamadı"
        products.append(
            Product(
                rank=len(products) + 1,
                title=title,
                url=url,
                price_text=price_text,
                price_value=parse_price_value(price_text),
                prices=prices,
                metadata=extract_metadata(card, title, prices),
            )
        )
        if len(products) >= limit:
            break

    return products


def fetch_http(url: str, timeout: float = 20.0) -> str:
    response = requests.get(
        url,
        timeout=timeout,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/151.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.7",
        },
    )
    response.raise_for_status()
    return response.text


def fetch_browser(url: str, limit: int, timeout_ms: int = 30_000) -> str:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Rendered fallback requires Playwright. Run: pip install -r requirements.txt "
            "and python -m playwright install chromium"
        ) from exc

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            locale="tr-TR",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/151.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()

        def block_heavy(route):
            if route.request.resource_type in {"image", "font", "media"}:
                route.abort()
            else:
                route.continue_()

        page.route("**/*", block_heavy)
        page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_timeout(1200)

        previous_height = 0
        stable_rounds = 0
        for _ in range(18):
            count = page.locator(
                "div.p-card-wrppr, div.p-card-chldrn-cntnr, [data-testid='product-card'], [data-product-id]"
            ).count()
            if count >= limit:
                break
            height = page.evaluate("document.body.scrollHeight")
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(650)
            if height == previous_height:
                stable_rounds += 1
                if stable_rounds >= 2:
                    break
            else:
                stable_rounds = 0
            previous_height = height

        html = page.content()
        context.close()
        browser.close()
        return html


def scrape(url: str, limit: int) -> dict:
    url = validate_url(url)
    limit = normalize_limit(limit)
    started = time.perf_counter()
    mode = "http"
    warnings: list[str] = []

    try:
        html = fetch_http(url)
        products = parse_products(html, url, limit)
    except Exception as exc:
        products = []
        warnings.append(f"HTTP scrape failed: {exc}")

    if len(products) < limit:
        try:
            rendered = fetch_browser(url, limit)
            browser_products = parse_products(rendered, url, limit)
            if len(browser_products) >= len(products):
                products = browser_products
                mode = "browser"
        except Exception as exc:
            warnings.append(f"Browser fallback unavailable/failed: {exc}")

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    return {
        "source": "public-listing-page",
        "usesTrendyolApi": False,
        "imagesFetched": False,
        "mode": mode,
        "url": url,
        "requested": limit,
        "found": len(products),
        "elapsedMs": elapsed_ms,
        "warnings": warnings,
        "products": [asdict(item) for item in products[:limit]],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape products from a public Trendyol listing page.")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--limit", default=10, type=int)
    args = parser.parse_args()
    try:
        payload = scrape(args.url, args.limit)
        print(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
