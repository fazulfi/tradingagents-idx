# Research Workflow

A complete example of using TradingAgents as a research tool — from ticker selection to post-analysis review.

## Step-by-Step Workflow

### 1. Pick a ticker

Choose any ticker supported by yfinance:
- **IDX**: `BBCA.JK`, `TLKM.JK`, `ASII.JK`
- **US**: `AAPL`, `NVDA`, `MSFT`
- **Japan**: `7203.T` (Toyota)
- **Hong Kong**: `0700.HK` (Tencent)
- **Canada**: `CNQ.TO`

For IDX tickers, the system automatically injects Indonesian market context (currency IDR, regulator OJK, settlement T+2).

### 2. Run the analysis

Open the dashboard (`http://localhost:3000`) and enter:
- **Ticker**: e.g. `BBCA.JK`
- **Analysis date**: a recent trading day (YYYY-MM-DD)
- **Model**: any model available via OpenRouter, e.g. `google/gemini-2.0-flash-001`
- **Debate rounds**: 1–5 (more rounds = deeper bull/bear debate, higher token cost)

Click **Run Analysis** and wait for the job to complete (typically 2–10 minutes depending on model speed).

### 3. Export the result

Once the job shows **COMPLETE**, click **Export JSON** in the dashboard. The file contains the full structured output:

```json
{
  "id": "...",
  "ticker": "BBCA.JK",
  "date": "2026-03-24",
  "model": "google/gemini-2.0-flash-001",
  "status": "complete",
  "verdict": "HOLD",
  "sections": {
    "market_analyst": ["..."],
    "fundamentals_analyst": ["..."],
    "sentiment_analyst": ["..."],
    "news_analyst": ["..."],
    "bull_researcher": ["..."],
    "bear_researcher": ["..."],
    "research_decision": ["..."],
    "trader_decision": ["..."],
    "risk_aggressive": ["..."],
    "risk_neutral": ["..."],
    "risk_conservative": ["..."],
    "final_decision": ["..."]
  },
  "tokenUsage": { "input": 0, "output": 0, "total": 0, "elapsed_ms": 0, "byAgent": {} }
}
```

### 4. Load the JSON in a Python notebook

```python
import json

with open("BBCA.JK_2026-03-24.json") as f:
    result = json.load(f)

# Quick summary
print("Ticker:", result["ticker"])
print("Date:", result["date"])
print("Verdict:", result["verdict"])
print()

# Print each section
sections = result["sections"]
for section_name, lines in sections.items():
    if lines:
        print(f"=== {section_name.upper()} ===")
        print("\n".join(lines))
        print()
```

### 5. Compare verdict to realized returns

```python
import yfinance as yf

ticker = result["ticker"]
analysis_date = result["date"]

# Fetch price data around the analysis date
hist = yf.download(ticker, start=analysis_date, period="1mo")

entry_price = hist["Close"].iloc[0]
exit_price = hist["Close"].iloc[-1]
return_pct = (exit_price - entry_price) / entry_price * 100

print(f"Entry: {entry_price:.2f}  Exit: {exit_price:.2f}  Return: {return_pct:.1f}%")
print(f"Agent verdict: {result['verdict']}")
```

## Sample Follow-Up Questions

After reviewing the analysis, consider asking these questions to deepen your research:

**On the bull/bear debate:**
- What specific data did the bull researcher cite that the bear researcher did not rebut?
- Does the research manager's decision align more with the bull or bear case?

**On the final decision:**
- Does the `**Rating**` keyword match `verdict` in the JSON? (It should — if not, check `detectVerdict()` in `frontend/lib/utils.ts`.)
- Does the risk management team's consensus align with the trader decision?

**On data quality:**
- Is the analysis date a trading day for this exchange?
- Does the fundamentals section contain meaningful data, or mostly "N/A"? (Common for smaller IDX tickers.)

## IDX Data Limitations

Yahoo Finance (`yfinance`) is the default data provider. For IDX tickers:

- **Price data**: Generally reliable for large-cap stocks (LQ45 index members).
- **Fundamentals**: P/E, EPS, and balance sheet data may be delayed by one quarter or missing for smaller companies.
- **News**: English-language news is limited; sentiment may reflect global rather than domestic market mood.
- **Indicators**: Technical indicators (RSI, MACD, Bollinger Bands) are computed from yfinance OHLCV data and are reliable for liquid tickers.

For deeper IDX fundamental data, consider subscribing to a local data vendor (e.g. IDX official API, Stockbit, or Investabook) and implementing a custom `DataProvider` — see [ARCHITECTURE.md](ARCHITECTURE.md#plug-in-a-new-data-vendor).

## Token Cost Reference

Approximate token usage per full analysis run (1 debate round):

| Model | Input tokens | Output tokens | Approx. cost |
|-------|-------------|---------------|-------------|
| `google/gemini-2.0-flash-001` | ~40k | ~8k | ~$0.05 |
| `openai/gpt-4o-mini` | ~40k | ~8k | ~$0.10 |
| `openai/gpt-4o` | ~40k | ~8k | ~$0.80 |

Costs scale roughly linearly with debate rounds. The token HUD in the dashboard shows live usage.
