import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Dict, Any
import httpx


class SECConnector:
    # SEC current filings via Atom
    FILINGS_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=&company=&dateb=&owner=include&start=0&count=40&output=atom"
    # SEC press releases (speeches, enforcement, etc.) via RSS
    PRESS_URL = "https://www.sec.gov/news/pressreleases.rss"

    async def fetch(self) -> List[Dict[str, Any]]:
        results = []
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {"User-Agent": "TraderMonkeys personal app tanerdag1983@gmail.com"}
            try:
                response = await client.get(self.FILINGS_URL, headers=headers)
                response.raise_for_status()
                results.extend(self._parse_filings(response.text))
            except Exception:
                pass

            try:
                response = await client.get(self.PRESS_URL, headers=headers)
                response.raise_for_status()
                results.extend(self._parse_rss(response.text, source="sec_press", publisher="SEC Press"))
            except Exception:
                pass

        return results

    def _parse_filings(self, xml_text: str) -> List[Dict[str, Any]]:
        items = []
        try:
            root = ET.fromstring(xml_text)
            # Try Atom with and without prefixed namespaces
            ns_map = {
                "atom": "http://www.w3.org/2005/Atom",
            }
            entries = root.findall("atom:entry", ns_map)
            if not entries:
                entries = root.findall("{http://www.w3.org/2005/Atom}entry")
            for entry in entries:
                title = self._find_text(entry, "atom:title", ns_map)
                link = entry.find("atom:link", ns_map) or entry.find("{http://www.w3.org/2005/Atom}link")
                href = link.get("href") if link is not None else None
                published = self._find_text(entry, "atom:updated", ns_map) or self._find_text(entry, "atom:published", ns_map)
                summary = self._find_text(entry, "atom:summary", ns_map)
                category = entry.find("atom:category", ns_map) or entry.find("{http://www.w3.org/2005/Atom}category")
                company = category.get("term") if category is not None else None

                items.append({
                    "source": "sec_edgar",
                    "source_class": "official_filing",
                    "publisher": "SEC",
                    "title": title.strip() if title else "",
                    "body": summary.strip() if summary else "",
                    "url": href,
                    "published_at": self._parse_date(published),
                    "language": "en",
                    "entities": {"company": company},
                })
        except Exception:
            pass
        return items

    def _parse_rss(self, xml_text: str, source: str, publisher: str) -> List[Dict[str, Any]]:
        items = []
        try:
            root = ET.fromstring(xml_text)
            channel = root.find("channel")
            if channel is not None:
                for item in channel.findall("item"):
                    title = item.findtext("title", "")
                    link = item.findtext("link", "")
                    description = item.findtext("description", "")
                    pub_date = item.findtext("pubDate", "")
                    items.append({
                        "source": source,
                        "source_class": "regulator_news",
                        "publisher": publisher,
                        "title": title.strip() if title else "",
                        "body": description.strip() if description else "",
                        "url": link.strip() if link else None,
                        "published_at": self._parse_date(pub_date),
                        "language": "en",
                        "entities": {},
                    })
        except Exception:
            pass
        return items

    def _find_text(self, element, tag: str, ns_map: Dict[str, str]) -> str:
        child = element.find(tag, ns_map)
        if child is None:
            # fallback unprefixed qualified name
            prefix, local = tag.split(":") if ":" in tag else (None, tag)
            ns = ns_map.get(prefix, "")
            child = element.find(f"{{{ns}}}{local}" if ns else local)
        if child is not None:
            return child.text or ""
        return ""

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
