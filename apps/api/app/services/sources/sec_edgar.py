import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Dict, Any
import httpx


class SECConnector:
    URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=&company=&dateb=&owner=include&start=0&count=40&output=atom"

    async def fetch(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                self.URL,
                headers={
                    "User-Agent": "TraderMonkeys personal app tanerdag1983@gmail.com",
                },
            )
            response.raise_for_status()
            return self._parse(response.text)

    def _parse(self, xml_text: str) -> List[Dict[str, Any]]:
        items = []
        try:
            root = ET.fromstring(xml_text)
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            for entry in root.findall("atom:entry", ns):
                title = entry.findtext("atom:title", "", ns)
                link = entry.find("atom:link", ns)
                href = link.get("href") if link is not None else None
                published = entry.findtext("atom:updated", "", ns) or entry.findtext("atom:published", "", ns)
                summary = entry.findtext("atom:summary", "", ns)
                company = entry.findtext("atom:category[@term]", "", ns)

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

    def _parse_date(self, value: str) -> datetime:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return datetime.utcnow()
