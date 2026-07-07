from typing import Dict, List, Set

# A simple, opinionated sector mapping for the tickers the engine supports well.
# These are tradable US-listed stocks (and a few ADRs) for which we can fetch
# daily market data and news.
SECTOR_SYMBOLS: Dict[str, List[str]] = {
    "technology": [
        "AAPL", "MSFT", "NVDA", "AMD", "INTC", "META", "NFLX", "CRM",
        "AVGO", "QCOM", "AMAT", "TXN", "ADI", "MU", "LRCX", "KLAC",
    ],
    "healthcare": [
        "JNJ", "PFE", "UNH", "ABBV", "MRK", "TMO", "ABT", "DHR",
        "LLY", "BMY", "AMGN", "GILD", "VRTX", "REGN",
    ],
    "financials": [
        "JPM", "V", "MA", "BAC", "GS", "MS", "WFC", "C", "BLK",
        "SCHW", "AXP", "PNC", "USB", "TFC",
    ],
    "consumer_discretionary": [
        "AMZN", "TSLA", "HD", "MCD", "NKE", "SBUX", "TJX", "LOW",
        "DIS", "BABA", "BKNG", "MAR", "ABNB", "LULU",
    ],
    "communication_services": [
        "GOOGL", "META", "NFLX", "CMCSA", "VZ", "T", "TMUS", "DIS",
        "CHTR", "WMG",
    ],
    "energy": [
        "XOM", "CVX", "COP", "EOG", "SLB", "OXY", "PSX", "MPC",
        "VLO", "KMI",
    ],
    "industrials": [
        "BA", "CAT", "HON", "UPS", "GE", "LMT", "RTX", "UNP",
        "DE", "MMM", "CSX", "NSC", "FDX", "ITW",
    ],
    "utilities": [
        "NEE", "SO", "DUK", "D", "AEP", "EXC", "SRE", "XEL",
        "ED", "PEG",
    ],
    "materials": [
        "LIN", "SHW", "FCX", "NEM", "ECL", "DOW", "NUE", "APD",
        "PPG", "IFF",
    ],
    "real_estate": [
        "PLD", "AMT", "EQIX", "CCI", "PSA", "O", "DLR", "WELL",
        "SPG", "AVB",
    ],
}


# Default universe used when the user has not picked sectors or provided a watchlist.
DEFAULT_UNIVERSE: List[str] = [
    "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "NVDA", "AMD",
    "JPM", "V", "MA", "DIS", "NFLX", "CRM", "BABA", "INTC",
    "JNJ", "UNH", "XOM", "CVX", "BA", "CAT", "HD", "NKE",
    "PFE", "ABBV", "LLY", "BAC", "GS", "MS", "AVGO", "QCOM",
    "WMT", "KO", "PEP", "MCD", "ABT", "TMO", "COST", "ADBE",
    "ORCL", "IBM", "GE", "HON", "UPS", "LMT", "RTX", "UNP",
    "NEE", "PM",
]


def list_sectors() -> List[str]:
    return sorted(SECTOR_SYMBOLS.keys())


def get_symbols_for_sectors(sectors: List[str]) -> List[str]:
    symbols: Set[str] = set()
    for sector in sectors:
        for symbol in SECTOR_SYMBOLS.get(sector, []):
            symbols.add(symbol)
    return sorted(symbols)


def resolve_research_universe(
    explicit_watchlist: List[str],
    selected_sectors: List[str],
) -> List[str]:
    """Build the final watchlist from explicit input, sectors, or fallback to default universe."""
    watchlist = [str(s).strip().upper() for s in explicit_watchlist if str(s).strip()]
    if watchlist:
        return list(dict.fromkeys(watchlist))  # preserve order, remove duplicates

    sector_symbols = get_symbols_for_sectors(selected_sectors)
    if sector_symbols:
        return sector_symbols

    return list(DEFAULT_UNIVERSE)
