import logging
from typing import Annotated

from langchain_core.tools import tool

from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI, IDXRateLimitError


@tool
def get_idx_market_intelligence(
    ticker: Annotated[str, "Ticker symbol of the Indonesian stock (must end with .JK, e.g. BBCA.JK)"],
) -> str:
    """
    Get exclusive IDX market intelligence data for Indonesian stocks.

    Provides 5 data points NOT available from yfinance:
    1. Bandar Accumulation -- detect if market makers are accumulating
    2. Bandar Distribution -- detect if market makers are distributing/selling
    3. Smart Money Flow -- track institutional and foreign investor movements
    4. Pump & Dump Detection -- identify market manipulation risk
    5. Foreign Ownership -- monitor foreign investor ownership trends

    IMPORTANT: Only call this tool for Indonesian stocks with .JK suffix
    (e.g., BBCA.JK, TLKM.JK, BBRI.JK). Returns empty string for other tickers.
    This uses a rate-limited API (1000 req/month). Use only when needed.
    """
    if not ticker.upper().endswith(".JK"):
        return ""

    api = IDXRapidAPI()
    sections = []

    try:
        accum = api.get_bandar_accumulation(ticker)
        if accum:
            lines = "\n".join(
                f"- {k}: {v}" for k, v in accum.items() if v is not None
            )
            sections.append(f"## Bandar Accumulation (Market Maker Activity)\n{lines}")

        distrib = api.get_bandar_distribution(ticker)
        if distrib:
            lines = "\n".join(
                f"- {k}: {v}" for k, v in distrib.items() if v is not None
            )
            sections.append(f"## Bandar Distribution (Selling Pressure)\n{lines}")

        smf = api.get_smart_money_flow(ticker)
        if smf:
            lines = "\n".join(
                f"- {k}: {v}" for k, v in smf.items() if v is not None
            )
            sections.append(f"## Smart Money Flow\n{lines}")

        pnd = api.get_pump_dump_detection(ticker)
        if pnd:
            lines = "\n".join(
                f"- {k}: {v}" for k, v in pnd.items() if v is not None
            )
            sections.append(f"## Pump & Dump Risk Assessment\n{lines}")

        foreign = api.get_foreign_ownership(ticker)
        if foreign:
            lines = "\n".join(
                f"- {k}: {v}" for k, v in foreign.items() if v is not None
            )
            sections.append(f"## Foreign Ownership Trends\n{lines}")

    except IDXRateLimitError as e:
        return f"IDX API rate limit reached: {e}"
    except Exception as e:
        logging.warning(f"IDX market intelligence error for {ticker}: {e}")
        return ""

    if not sections:
        return ""

    usage = api.get_usage()
    footer = f"\n\n---\nIDX API Usage this month: {usage['used']}/{usage['limit']}"
    return "\n\n".join(sections) + footer
