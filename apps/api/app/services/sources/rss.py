import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Dict, Any
import httpx


FEEDS = {
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
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(config["url"])
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
            return datetime.strptime(value, "%a, %d %b %Y %H:%M:%S %Z")
        except Exception:
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except Exception:
                return datetime.utcnow()
