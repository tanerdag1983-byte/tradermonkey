import email.utils
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import List, Dict, Any
import httpx


FEEDS = {
    # Existing feeds
    "yahoo_finance": {
        "url": "https://finance.yahoo.com/news/rssindex",
        "source_class": "editorial",
        "publisher": "Yahoo Finance",
        "language": "en",
    },
    "fd_feed": {
        "url": "https://fd.nl/rss",
        "source_class": "editorial",
        "publisher": "FD",
        "language": "nl",
    },
    "bnr_feed": {
        "url": "https://www.bnr.nl/rss",
        "source_class": "editorial",
        "publisher": "BNR",
        "language": "nl",
    },
    "benzinga": {
        "url": "https://www.benzinga.com/feed",
        "source_class": "news_wire",
        "publisher": "Benzinga",
        "language": "en",
    },
    "sec_newsroom": {
        "url": "https://www.sec.gov/news/pressreleases.rss",
        "source_class": "regulator_news",
        "publisher": "SEC Newsroom",
        "language": "en",
    },
    # New financial news sources (RSS)
    "tradingeconomics": {
        "url": "https://tradingeconomics.com/rss/news.aspx",
        "source_class": "editorial",
        "publisher": "Trading Economics",
        "language": "en",
    },
    "marketwatch": {
        "url": "https://feeds.marketwatch.com/marketwatch/marketpulse/",
        "source_class": "editorial",
        "publisher": "MarketWatch",
        "language": "en",
    },
    "investing_com": {
        "url": "https://www.investing.com/rss/news_285.rss",
        "source_class": "editorial",
        "publisher": "Investing.com",
        "language": "en",
    },
    "reuters_markets": {
        "url": "https://www.reuters.com/markets/rss",
        "source_class": "news_wire",
        "publisher": "Reuters Markets",
        "language": "en",
    },
    "barchart": {
        "url": "https://www.barchart.com/rss/news.xml",
        "source_class": "editorial",
        "publisher": "Barchart",
        "language": "en",
    },
    "ft_markets": {
        "url": "https://www.ft.com/markets?format=rss",
        "source_class": "editorial",
        "publisher": "Financial Times Markets",
        "language": "en",
    },
    "bloomberg_europe": {
        "url": "https://feeds.bloomberg.com/markets/news.rss",
        "source_class": "news_wire",
        "publisher": "Bloomberg Europe",
        "language": "en",
    },
    "morningstar": {
        "url": "https://www.morningstar.com/rss/market-news",
        "source_class": "editorial",
        "publisher": "Morningstar",
        "language": "en",
    },
    "marketscreener": {
        "url": "https://www.marketscreener.com/rss/news.xml",
        "source_class": "editorial",
        "publisher": "MarketScreener",
        "language": "en",
    },
}


class RSSConnector:
    async def fetch_all(self) -> List[Dict[str, Any]]:
        results = []
        for name, config in FEEDS.items():
            try:
                items = await self.fetch_feed(config)
                for item in items:
                    item["source"] = name
                    item["source_class"] = config["source_class"]
                    item["publisher"] = config["publisher"]
                    item["language"] = config["language"]
                results.extend(items)
            except Exception:
                continue
        return results

    async def fetch_feed(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        headers = {}
        if "sec." in config["url"]:
            headers["User-Agent"] = "TraderMonkeys personal app tanerdag1983@gmail.com"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(config["url"], headers=headers)
            response.raise_for_status()
            return self._parse(response.text)

    def _parse(self, xml_text: str) -> List[Dict[str, Any]]:
        items = []
        try:
            root = ET.fromstring(xml_text)
            ns = {"rss": "http://purl.org/rss/1.0/"}
            # Try RSS 2.0 format
            channel = root.find("channel")
            if channel is not None:
                for item in channel.findall("item"):
                    title = item.findtext("title", "")
                    link = item.findtext("link", "")
                    description = item.findtext("description", "")
                    pub_date = item.findtext("pubDate", "")
                    items.append({
                        "title": title.strip() if title else "",
                        "body": description.strip() if description else "",
                        "url": link.strip() if link else None,
                        "published_at": self._parse_date(pub_date),
                    })
            else:
                # Try RSS 1.0 / Atom
                for entry in root.findall(".//{http://www.w3.org/2005/Atom}entry"):
                    title = entry.findtext("{http://www.w3.org/2005/Atom}title", "")
                    link = entry.find("{http://www.w3.org/2005/Atom}link")
                    href = link.get("href") if link is not None else None
                    summary = entry.findtext("{http://www.w3.org/2005/Atom}summary", "")
                    published = entry.findtext("{http://www.w3.org/2005/Atom}published", "")
                    items.append({
                        "title": title.strip() if title else "",
                        "body": summary.strip() if summary else "",
                        "url": href,
                        "published_at": self._parse_date(published),
                    })
        except Exception:
            pass
        return items

    def _parse_date(self, value: str) -> datetime:
        if not value:
            return datetime.utcnow()
        try:
            return email.utils.parsedate_to_datetime(value)
        except Exception:
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except Exception:
                return datetime.utcnow()
