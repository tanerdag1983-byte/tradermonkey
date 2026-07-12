from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, or_

from app.models import NewsItem, MarketBar, TradeRecord, PositionAdvice
from app.services.trade_journal import calculate_trade_stats
from app.services.llm.openrouter import OpenRouterClient
from app.services.market.technical import build_market_context
from app.services.market.data import get_bars_as_df
from app.config import get_settings


class DeepResearchAgent:
    """Multi-step research agent for comprehensive position analysis."""

    def __init__(self, db: Session, user_id: str):
        self.db = db
        self.user_id = user_id
        self.settings = get_settings()
        self.client = OpenRouterClient()

    async def research_symbol(self, symbol: str, position_data: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Comprehensive multi-step research for a symbol.
        Returns structured research report for AI advice generation.
        """
        sym = symbol.upper()
        
        # Parallel data gathering
        import asyncio
        news_task = asyncio.create_task(self._fetch_news(sym))
        technical_task = asyncio.create_task(self._fetch_technical(sym))
        fundamental_task = asyncio.create_task(self._fetch_fundamental(sym))
        trade_stats_task = asyncio.create_task(asyncio.to_thread(self._get_trade_stats))
        sentiment_task = asyncio.create_task(self._analyze_sentiment(sym))
        trend_task = asyncio.create_task(self._analyze_market_trend(sym))

        news, technical, fundamental, trade_stats, sentiment, trend = await asyncio.gather(
            news_task, technical_task, fundamental_task, 
            trade_stats_task, sentiment_task, trend_task
        )

        # Build comprehensive research report
        report = {
            "symbol": sym,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "position_data": position_data,
            "technical_analysis": technical,
            "fundamental_data": fundamental,
            "news_analysis": {
                "recent_news": news[:10],
                "sentiment_score": sentiment,
                "news_count": len(news),
            },
            "market_trend": trend,
            "trade_history": trade_stats,
            "position_context": position_data,
        }

        # Generate AI synthesis
        synthesis = await self._generate_synthesis(report)
        
        return {
            "report": report,
            "synthesis": synthesis,
            "recommendation": synthesis.get("recommendation", "NO_ADVICE"),
            "confidence": synthesis.get("confidence", 0.0),
            "reasoning": synthesis.get("reasoning", ""),
        }

    async def _fetch_news(self, symbol: str, hours: int = 168) -> List[Dict]:
        """Fetch recent + historical news for symbol (1 week)."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        news = self.db.query(NewsItem).filter(
            and_(
                NewsItem.published_at >= cutoff,
                or_(
                    NewsItem.title.ilike(f"%{symbol}%"),
                    NewsItem.body.ilike(f"%{symbol}%"),
                    NewsItem.entities.op("->>")('tickers').ilike(f"%{symbol}%")
                )
            )
        ).order_by(desc(NewsItem.published_at)).limit(50).all()

        return [
            {
                "title": n.title,
                "body": n.body[:500] if n.body else "",
                "source": n.source,
                "publisher": n.publisher,
                "published_at": n.published_at.isoformat() if n.published_at else None,
                "sentiment_score": n.sentiment_score,
                "url": n.url,
            }
            for n in news
        ]

    async def _fetch_technical(self, symbol: str) -> Dict[str, Any]:
        """Get comprehensive technical analysis."""
        try:
            df = get_bars_as_df(self.db, symbol, timeframe="1d", limit=200)
            if df.empty:
                return {"error": "No price data"}

            context = build_market_context(df)
            
            # Add more indicators
            from app.services.market.technical import (
                calculate_rsi, calculate_macd, calculate_bollinger_bands,
                calculate_atr, detect_candlestick_patterns as detect_patterns
            )
            
            close = df['close']
            high = df['high']
            low = df['low']
            
            rsi_series = calculate_rsi(close, 14)
            macd_dict = calculate_macd(close)
            bb_dict = calculate_bollinger_bands(close)
            atr_series = calculate_atr(df, 14)
            
            return {
                "current_price": float(close.iloc[-1]),
                "trend": context.get("trend"),
                "support_levels": context.get("support_levels", []),
                "resistance_levels": context.get("resistance_levels", []),
                "rsi_14": float(rsi_series.iloc[-1]) if len(rsi_series) >= 14 else None,
                "macd": {
                    "macd": float(macd_dict["macd"].iloc[-1]),
                    "signal": float(macd_dict["signal"].iloc[-1]),
                    "histogram": float(macd_dict["histogram"].iloc[-1]),
                },
                "bollinger": {
                    "upper": float(bb_dict["upper"].iloc[-1]),
                    "middle": float(bb_dict["middle"].iloc[-1]),
                    "lower": float(bb_dict["lower"].iloc[-1]),
                },
                "atr_14": float(atr_series.iloc[-1]) if len(atr_series) >= 14 else None,
                "patterns": detect_candlestick_patterns(df) if len(df) >= 20 else [],
                "volume_trend": self._analyze_volume(df),
            }
        except Exception as e:
            return {"error": str(e)}

    def _analyze_volume(self, df) -> Dict:
        """Analyze volume trends."""
        try:
            vol = df['volume'].values
            if len(vol) < 20:
                return {}
            avg_20 = float(np.mean(vol[-20:]))
            avg_50 = float(np.mean(vol[-50:])) if len(vol) >= 50 else avg_20
            current = float(vol[-1])
            return {
                "current": current,
                "avg_20": avg_20,
                "avg_50": avg_50,
                "vs_avg_20": (current / avg_20 - 1) * 100 if avg_20 > 0 else 0,
            }
        except:
            return {}

    async def _fetch_fundamental(self, symbol: str) -> Dict[str, Any]:
        """Fetch fundamental data (earnings, ratios, etc.)."""
        # Placeholder - would integrate with financial data API
        # For now, return cached/placeholder data
        return {
            "symbol": symbol,
            "note": "Fundamental data requires external API (Alpha Vantage, Polygon, etc.)",
            "placeholder": True,
        }

    async def _analyze_sentiment(self, symbol: str) -> float:
        """Calculate weighted sentiment from recent news."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        news = self.db.query(NewsItem).filter(
            and_(
                NewsItem.published_at >= cutoff,
                or_(
                    NewsItem.title.ilike(f"%{symbol}%"),
                    NewsItem.body.ilike(f"%{symbol}%"),
                )
            )
        ).all()

        if not news:
            return 0.0

        weighted = 0.0
        total_weight = 0.0
        for n in news:
            if n.sentiment_score is not None:
                # Weight by recency (newer = higher weight)
                age_hours = (datetime.now(timezone.utc) - n.published_at).total_seconds() / 3600
                weight = max(0.1, 1.0 - age_hours / 168)  # Decay over 1 week
                weighted += n.sentiment_score * weight
                total_weight += weight

        return weighted / total_weight if total_weight > 0 else 0.0

    async def _analyze_market_trend(self, symbol: str) -> Dict[str, Any]:
        """Analyze broader market trend and sector context."""
        # SPY as market proxy
        spy_df = get_bars_as_df(self.db, "SPY", timeframe="1d", limit=60)
        qqq_df = get_bars_as_df(self.db, "QQQ", timeframe="1d", limit=60)
        
        def get_trend(df):
            if df.empty or len(df) < 20:
                return "unknown"
            close = df['close'].values
            sma20 = np.mean(close[-20:])
            sma50 = np.mean(close[-50:]) if len(close) >= 50 else np.mean(close)
            if close[-1] > sma20 > sma50:
                return "bullish"
            elif close[-1] < sma20 < sma50:
                return "bearish"
            return "neutral"

        import numpy as np
        return {
            "spy_trend": get_trend(spy_df),
            "qqq_trend": get_trend(qqq_df),
            "market_breadth": "unknown",  # Would need advance/decline data
        }

    def _get_trade_stats(self) -> Dict[str, Any]:
        """Get user's historical trade stats for this symbol."""
        stats = calculate_trade_stats(self.db, self.user_id)
        return stats

    async def _generate_synthesis(self, report: Dict[str, Any]) -> Dict[str, Any]:
        """Use LLM to synthesize all research into actionable advice."""
        symbol = report["symbol"]
        position = report["position_context"]

        # Build comprehensive prompt
        prompt = self._build_synthesis_prompt(report)

        try:
            completion = await self.client.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                model="anthropic/claude-sonnet-5",
                temperature=0.1,
                max_tokens=2000,
            )
            content = completion["choices"][0]["message"]["content"]
            import json, re
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                match = re.search(r'\{.*\}', content, re.DOTALL)
                parsed = json.loads(match.group(0)) if match else {}
        except Exception as e:
            parsed = {"error": str(e)}

        # Ensure required fields
        return {
            "recommendation": parsed.get("recommendation", "NO_ADVICE"),
            "confidence": parsed.get("confidence", 0.0),
            "reasoning": parsed.get("reasoning", ""),
            "key_levels": parsed.get("key_levels", {}),
            "time_horizon": parsed.get("time_horizon", "1-5 days"),
            "risk_factors": parsed.get("risk_factors", []),
            "full_response": content if 'content' in locals() else "",
        }

    def _build_synthesis_prompt(self, report: Dict[str, Any]) -> str:
        """Build comprehensive synthesis prompt for LLM."""
        symbol = report["symbol"]
        pos = report["position_context"]
        tech = report["technical_analysis"]
        fund = report["fundamental_data"]
        news = report["news_analysis"]
        trend = report["market_trend"]
        hist = report["trade_history"]

        pos_str = ""
        if pos:
            pnl_pct = 0
            if pos.get("avg_price") and tech.get("current_price"):
                pnl_pct = (tech["current_price"] - pos["avg_price"]) / pos["avg_price"] * 100
            pos_str = (
                f"\nCURRENT POSITION:\n"
                f"- Symbol: {symbol}\n"
                f"- Direction: {pos.get('direction', 'N/A')}\n"
                f"- Quantity: {pos.get('quantity', 'N/A')}\n"
                f"- Avg Entry: ${pos.get('avg_price', 'N/A')}\n"
                f"- Current Price: ${tech.get('current_price', 'N/A')}\n"
                f"- Unrealized P&L: {pnl_pct:.2f}%\n"
            )

        news_summary = ""
        if news["recent_news"]:
            news_summary = "\nRECENT NEWS (last 7 days):\n"
            for n in news["recent_news"][:5]:
                sent = f" (sentiment: {n['sentiment_score']:.2f})" if n['sentiment_score'] else ""
                news_summary += f"- {n['title'][:100]}{sent} [{n['source']}]\n"

        return f"""Je bent een ervaren quantitative analyst. Doe diepgaande analyse voor {symbol} en geef advies in JSON.

{pos_str}

TECHNICAL ANALYSIS:
- Trend: {tech.get('trend', 'unknown')}
- Current Price: ${tech.get('current_price', 'N/A')}
- RSI(14): {tech.get('rsi_14', 'N/A')}
- MACD: {tech.get('macd', {})}
- Bollinger Bands: {tech.get('bollinger', {})}
- ATR(14): {tech.get('atr_14', 'N/A')}
- Support: {tech.get('support_levels', [])}
- Resistance: {tech.get('resistance_levels', [])}
- Patterns: {tech.get('patterns', [])}
- Volume vs 20d avg: {tech.get('volume_trend', {}).get('vs_avg_20', 'N/A')}%

MARKET CONTEXT:
- SPY Trend: {trend.get('spy_trend', 'unknown')}
- QQQ Trend: {trend.get('qqq_trend', 'unknown')}

SENTIMENT (7 dagen): {news.get('sentiment_score', 0):.2f} ({news.get('news_count', 0)} artikelen)
{news_summary}

TRADE HISTORY (jouw trades={hist.get('total_trades', 0)}):
- Win Rate: {hist.get('win_rate', 0):.1f}%
- Profit Factor: {hist.get('profit_factor', 0):.2f}
- Avg Win: ${hist.get('avg_win', 0):.2f}
- Avg Loss: ${hist.get('avg_loss', 0):.2f}
- Avg MFE: {hist.get('avg_mfe', 0):.1f}%
- Avg MAE: {hist.get('avg_mae', 0):.1f}%

FUNDAMENTALS: {fund.get('note', 'Niet beschikbaar')}

Geef JSON met EXACT deze keys:
{{
  "recommendation": "HOLD|ADD|REDUCE|EXIT|NO_ADVICE",
  "confidence": 0.0-1.0,
  "reasoning": "Korte Nederlandstalige uitleg van het advies",
  "key_levels": {{"entry": 0.0, "stop_loss": 0.0, "target_1": 0.0, "target_2": 0.0}},
  "time_horizon": "1-5 dagen / 1-4 weken / 1-3 maanden",
  "risk_factors": ["risico 1", "risico 2"],
  "position_sizing": "percentage van portfolio of absolute bedrag"
}}
Alleen JSON teruggeven, geen extra tekst.
"""

    # Public method for position advice with full research
    async def advise_position(self, symbol: str, position_data: Dict) -> Dict[str, Any]:
        """Main entry point: full research + advice for a position."""
        return await self.research_symbol(symbol, position_data)


# Convenience function for scheduler/manual triggers
async def run_deep_advice(db: Session, user_id: str, symbols: List[str]) -> List[Dict]:
    """Run deep research advice for multiple symbols."""
    agent = DeepResearchAgent(db, user_id)
    results = []
    for sym in symbols:
        try:
            result = await agent.research_symbol(sym)
            results.append(result)
        except Exception as e:
            results.append({"symbol": sym, "error": str(e)})
    return results