import logging
from typing import Annotated

from langchain_core.tools import tool

from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI, IDXRateLimitError

_DATA_UNAVAILABLE_MSG = (
    "## IDX Market Intelligence: DATA_UNAVAILABLE\n"
    "**Reason**: IDX_RAPIDAPI_KEY not configured.\n"
    "**Impact**: Bandarmology, Smart Money Flow, Pump & Dump Detection, and "
    "Foreign Ownership data are unavailable for this analysis.\n"
    "**Action Required**: Set IDX_RAPIDAPI_KEY in .env to enable IDX-exclusive features.\n"
    "**Analyst Note**: Do NOT assume market is safe or manipulation-free due to missing data. "
    "Treat IDX intelligence as UNKNOWN, not NEUTRAL."
)

_RATE_LIMITED_MSG = (
    "## IDX Market Intelligence: RATE_LIMITED\n"
    "**Warning**: IDX API monthly limit reached (1000 requests).\n"
    "**Impact**: All 5 IDX intelligence endpoints are unavailable.\n"
    "**Analyst Note**: Do NOT assume market is safe. Treat all IDX signals as UNKNOWN for this analysis."
)


def _interpret_accumulation(data: dict) -> str:
    score = data.get("accumulation_score")
    status = data.get("status", "N/A")
    confidence = data.get("confidence")

    if score is None:
        return "\n".join(f"- {k}: {v}" for k, v in data.items() if v is not None)

    if score <= 3:
        zone = "Heavy distribution zone"
        signal = "Market makers are selling aggressively. Strong bearish signal from bandar."
    elif score <= 5:
        zone = "Neutral zone"
        signal = "Market makers showing neutral behavior, no clear accumulation or distribution signal yet."
    elif score <= 7:
        zone = "Mild accumulation zone"
        signal = "Market makers starting to buy. Mild bullish signal, watch for confirmation."
    else:
        zone = "Heavy accumulation zone"
        signal = "Strong accumulation by market makers. Powerful buy signal from bandar activity."

    conf_str = f"{confidence}%" if confidence is not None else "N/A"
    return (
        f"- Score: {score}/10 ({zone})\n"
        f"- Status: {status}\n"
        f"- Confidence: {conf_str}\n"
        f"- Signal: {signal}"
    )


def _interpret_distribution(data: dict) -> str:
    score = data.get("distribution_score")
    status = data.get("status", "N/A")
    confidence = data.get("confidence")

    if score is None:
        return "\n".join(f"- {k}: {v}" for k, v in data.items() if v is not None)

    if score <= 4:
        zone = "No significant distribution"
        signal = "Market makers not distributing. Safe from selling pressure."
    elif score <= 6:
        zone = "Moderate distribution pressure"
        signal = "Some selling pressure detected. Bandar partially exiting positions."
    else:
        zone = "Heavy distribution zone"
        signal = "Bandar exiting aggressively. Danger zone — high selling pressure from market makers."

    conf_str = f"{confidence}%" if confidence is not None else "N/A"
    return (
        f"- Score: {score}/10 ({zone})\n"
        f"- Status: {status}\n"
        f"- Confidence: {conf_str}\n"
        f"- Signal: {signal}"
    )


def _interpret_smart_money(data: dict) -> str:
    score = data.get("smart_money_score")
    flow = data.get("flow_direction", "N/A")

    if score is None:
        return "\n".join(f"- {k}: {v}" for k, v in data.items() if v is not None)

    if score > 6:
        signal = "Institutional investors actively buying. Strong positive signal — smart money flowing in."
    elif score >= 4:
        signal = "Neutral institutional activity. No clear directional bias from smart money."
    else:
        signal = "Institutional investors selling. Negative signal — smart money flowing out."

    return (
        f"- Score: {score}/10\n"
        f"- Flow Direction: {flow}\n"
        f"- Signal: {signal}"
    )


def _interpret_pump_dump(data: dict) -> str:
    score = data.get("risk_score")
    status = data.get("status", "N/A")

    if score is None:
        return "\n".join(f"- {k}: {v}" for k, v in data.items() if v is not None)

    if score <= 3:
        signal = "Normal trading activity. No manipulation detected."
    elif score <= 5:
        signal = "Some unusual activity detected. Monitor closely but not alarming."
    elif score <= 7:
        signal = "Potential manipulation patterns detected. Exercise caution."
    else:
        signal = "High probability of pump & dump. Avoid entry — manipulative activity strongly indicated."

    return (
        f"- Risk Score: {score}/10\n"
        f"- Status: {status}\n"
        f"- Signal: {signal}"
    )


def _interpret_foreign_ownership(data: dict) -> str:
    pct = data.get("totalPctHeld")
    holders = data.get("holders", [])

    lines = []
    if pct is not None:
        if pct > 30:
            trend = "High foreign institutional ownership — strong foreign confidence in this stock."
        elif pct > 10:
            trend = "Moderate foreign ownership. Monitor for changes in direction."
        else:
            trend = "Low foreign ownership. Limited foreign institutional interest currently."
        lines.append(f"- Foreign Institutions Total Held: {pct}%")
        lines.append(f"- Signal: {trend}")
    else:
        for k, v in data.items():
            if v is not None:
                lines.append(f"- {k}: {v}")

    if holders:
        holder_names = ", ".join(str(h) for h in holders[:5])
        lines.append(f"- Major Holders: {holder_names}")

    return "\n".join(lines) if lines else "- No foreign ownership data available."


def _get_overall_bias(accum: dict, distrib: dict, smf: dict, pnd: dict, data_completeness: float = 1.0) -> tuple:
    if data_completeness < 0.6:
        x = round(data_completeness * 5)
        return (
            "UNKNOWN",
            f"Insufficient data for reliable bias assessment. Only {x}/5 IDX intelligence endpoints returned data.",
        )

    accum_score = accum.get("accumulation_score") or 0
    distrib_score = distrib.get("distribution_score") or 0
    smart_score = smf.get("smart_money_score") or 0
    pump_score = pnd.get("risk_score") or 0

    if accum_score > 6 and smart_score > 6 and pump_score < 4:
        bias = "BULLISH"
        reasoning = (
            f"Strong accumulation (score {accum_score}/10) combined with institutional buying "
            f"(smart money score {smart_score}/10) and low manipulation risk (pump/dump score {pump_score}/10) "
            "align for a bullish setup."
        )
    elif distrib_score > 6 or (smart_score < 4 and accum_score < 4):
        bias = "BEARISH"
        if distrib_score > 6:
            reasoning = (
                f"Heavy distribution pressure (score {distrib_score}/10) signals market makers exiting. "
                "Avoid new long positions until distribution subsides."
            )
        else:
            reasoning = (
                f"Weak accumulation (score {accum_score}/10) combined with institutional selling "
                f"(smart money score {smart_score}/10) presents a bearish outlook."
            )
    else:
        bias = "NEUTRAL"
        reasoning = (
            "Mixed or inconclusive signals across accumulation, distribution, and smart money flow. "
            "Wait for clearer confirmation before taking a directional position."
        )

    return bias, reasoning


@tool
def get_idx_market_intelligence(
    ticker: Annotated[str, "Ticker symbol of the Indonesian stock (must end with .JK, e.g. BBCA.JK)"],
) -> str:
    """
    Get exclusive IDX market intelligence for Indonesian stocks (.JK tickers).

    Provides 5 data points NOT available from yfinance:
    1. Bandar Accumulation -- detect if market makers are accumulating
    2. Bandar Distribution -- detect if market makers are distributing/selling
    3. Smart Money Flow -- track institutional and foreign investor movements
    4. Pump & Dump Detection -- identify market manipulation risk
    5. Foreign Ownership -- monitor foreign investor ownership trends

    IMPORTANT: Only call this tool for Indonesian stocks with .JK suffix
    (e.g., BBCA.JK, TLKM.JK, BBRI.JK). Returns empty string for other tickers.
    This uses a rate-limited API (1000 req/month). Use only when needed.

    DATA INTERPRETATION GUIDE:

    BANDAR ACCUMULATION (accumulation_score 0-10):
    - score 0-3: Heavy distribution (bandar selling aggressively)
    - score 3-5: Neutral/no clear signal
    - score 5-7: Mild accumulation (bandar starting to buy)
    - score 7-10: Heavy accumulation (strong buy signal from market makers)
    - status: ACCUMULATE = strong buy signal, NEUTRAL = wait, DISTRIBUTE = sell signal
    - confidence: 0-100%, higher = more reliable signal

    BANDAR DISTRIBUTION (distribution_score 0-10):
    - score 0-4: No distribution (safe)
    - score 4-6: Moderate distribution pressure (bandar partially selling)
    - score 6-10: Heavy distribution (danger zone, bandar exiting)
    - status: DISTRIBUTE = danger, NEUTRAL = ok, ACCUMULATE = bandar still buying

    SMART MONEY FLOW (smart_money_score 0-10):
    - score > 6: Smart money flowing IN (institutional buying)
    - score 4-6: Neutral smart money activity
    - score < 4: Smart money flowing OUT (institutional selling)
    - flow_direction: IN = institutions buying, OUT = institutions selling
    - Divergence from retail sentiment = strong signal

    PUMP & DUMP RISK (risk_score 0-10):
    - score 0-3: SAFE, normal trading activity
    - score 3-5: CAUTION, some unusual activity detected
    - score 5-7: WARNING, potential manipulation
    - score 7-10: DANGER, high probability of pump & dump

    FOREIGN OWNERSHIP:
    - totalPctHeld: % of shares held by foreign institutions
    - Increasing foreign ownership = positive signal (foreign confidence)
    - Decreasing foreign ownership = negative signal (foreign exit)
    - Major holders: Vanguard, BlackRock, Fidelity = quality institutional backing

    COMBINED INTERPRETATION:
    - High accumulation + high smart money + low pump dump = STRONG BUY signal
    - High distribution + smart money OUT + high pump dump = STRONG SELL/AVOID signal
    - Mixed signals = HOLD, wait for confirmation

    IMPORTANT FOR ANALYSTS:
    - DATA_UNAVAILABLE means IDX key not configured — treat all IDX signals as UNKNOWN
    - PARTIAL_DATA means some endpoints failed — only use available sections
    - RATE_LIMITED means monthly limit hit — treat all IDX signals as UNKNOWN
    - Never interpret missing data as NEUTRAL or SAFE
    - Empty or missing sections should trigger conservative analysis assumptions
    """
    if not ticker.upper().endswith(".JK"):
        return ""

    api = IDXRapidAPI()
    if not api.api_key:
        return _DATA_UNAVAILABLE_MSG

    sections = []
    succeeded = []
    failed = []
    accum, distrib, smf, pnd = {}, {}, {}, {}

    try:
        try:
            accum = api.get_bandar_accumulation(ticker)
            if accum:
                succeeded.append("Bandar Accumulation")
                sections.append(f"### Bandar Accumulation\n{_interpret_accumulation(accum)}")
            else:
                failed.append("Bandar Accumulation")
        except IDXRateLimitError:
            raise
        except Exception as e:
            failed.append("Bandar Accumulation")
            logging.warning(f"IDX Bandar Accumulation failed for {ticker}: {e}")

        try:
            distrib = api.get_bandar_distribution(ticker)
            if distrib:
                succeeded.append("Bandar Distribution")
                sections.append(f"### Bandar Distribution\n{_interpret_distribution(distrib)}")
            else:
                failed.append("Bandar Distribution")
        except IDXRateLimitError:
            raise
        except Exception as e:
            failed.append("Bandar Distribution")
            logging.warning(f"IDX Bandar Distribution failed for {ticker}: {e}")

        try:
            smf = api.get_smart_money_flow(ticker)
            if smf:
                succeeded.append("Smart Money Flow")
                sections.append(f"### Smart Money Flow\n{_interpret_smart_money(smf)}")
            else:
                failed.append("Smart Money Flow")
        except IDXRateLimitError:
            raise
        except Exception as e:
            failed.append("Smart Money Flow")
            logging.warning(f"IDX Smart Money Flow failed for {ticker}: {e}")

        try:
            pnd = api.get_pump_dump_detection(ticker)
            if pnd:
                succeeded.append("Pump & Dump Detection")
                sections.append(f"### Pump & Dump Risk Assessment\n{_interpret_pump_dump(pnd)}")
            else:
                failed.append("Pump & Dump Detection")
        except IDXRateLimitError:
            raise
        except Exception as e:
            failed.append("Pump & Dump Detection")
            logging.warning(f"IDX Pump & Dump Detection failed for {ticker}: {e}")

        try:
            foreign = api.get_foreign_ownership(ticker)
            if foreign:
                succeeded.append("Foreign Ownership")
                sections.append(f"### Foreign Ownership Trends\n{_interpret_foreign_ownership(foreign)}")
            else:
                failed.append("Foreign Ownership")
        except IDXRateLimitError:
            raise
        except Exception as e:
            failed.append("Foreign Ownership")
            logging.warning(f"IDX Foreign Ownership failed for {ticker}: {e}")

    except IDXRateLimitError:
        return _RATE_LIMITED_MSG

    if not succeeded:
        unavail = "\n".join(f"- {x}" for x in failed)
        return (
            "## IDX Market Intelligence: PARTIAL_DATA\n"
            "**Warning**: All IDX data endpoints failed to respond.\n"
            "**Available data**: None\n"
            f"**Unavailable data**:\n{unavail}\n"
            "**Analyst Note**: Make analysis decisions based only on available data. "
            "Treat missing sections as UNKNOWN, not NEUTRAL or SAFE."
        )

    if failed:
        avail = "\n".join(f"- {x}" for x in succeeded)
        unavail = "\n".join(f"- {x}" for x in failed)
        sections.append(
            "### Data Completeness Warning\n"
            "**PARTIAL_DATA**: Some IDX endpoints failed to respond.\n"
            f"**Available data**:\n{avail}\n"
            f"**Unavailable data**:\n{unavail}\n"
            "**Analyst Note**: Treat missing sections as UNKNOWN, not NEUTRAL or SAFE."
        )

    bias, reasoning = _get_overall_bias(accum, distrib, smf, pnd, data_completeness=len(succeeded) / 5)
    sections.append(
        f"### Overall IDX Signal\n"
        f"- Bias: {bias}\n"
        f"- Reasoning: {reasoning}"
    )

    usage = api.get_usage()
    header = f"## IDX Market Intelligence: {ticker}\n\n"
    footer = f"\n\n---\nIDX API Usage this month: {usage['used']}/{usage['limit']}"
    return header + "\n\n".join(sections) + footer
