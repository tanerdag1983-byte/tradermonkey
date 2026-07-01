import hashlib
from typing import Optional


def normalize_symbol(symbol: Optional[str]) -> Optional[str]:
    if not symbol:
        return None
    symbol = symbol.strip().upper()
    # Remove common suffixes and prefixes
    replacements = {
        ".AS": "_NL_EQ",
        ".BR": "_BE_EQ",
        ".PA": "_FR_EQ",
        ".DE": "_DE_EQ",
        ".MI": "_IT_EQ",
        ".MC": "_ES_EQ",
        ".LS": "_PT_EQ",
        ".HE": "_FI_EQ",
        ".ST": "_SE_EQ",
        ".OL": "_NO_EQ",
        ".CO": "_DK_EQ",
        " US": "_US_EQ",
        "-US": "_US_EQ",
        ".US": "_US_EQ",
    }
    for old, new in replacements.items():
        if symbol.endswith(old):
            symbol = symbol.replace(old, new)
            break
    else:
        # Default to US equity if no exchange suffix and looks like a ticker
        if symbol.isalpha() and len(symbol) <= 5:
            symbol = f"{symbol}_US_EQ"
    return symbol


def dedupe_key(title: str, published_at: Optional[str] = None) -> str:
    base = (title or "").strip().lower()
    return hashlib.sha256(f"{base}:{published_at or ''}".encode()).hexdigest()
