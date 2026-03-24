#!/usr/bin/env python3
"""
Fake TradingAgents subprocess for CI testing.

Accepts the same positional args as the real inline script:
    ticker date root model [debate_rounds]

Optional flags:
    --fail   Print [ERROR] and exit with code 1 (simulates a failed run)

Prints deterministic marker output that the Next.js job runner expects,
then exits with code 0 (or 1 if --fail is passed).
"""
import json
import sys
import time

# Parse --fail flag (can appear anywhere in argv)
fail_mode = "--fail" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]

ticker = args[0] if len(args) > 0 else "TEST"
date = args[1] if len(args) > 1 else "2026-01-01"
# root and model are accepted but not used in fake output
# debate_rounds is accepted but not used

if fail_mode:
    print(f"[STATUS] Initializing agents for {ticker} on {date}", flush=True)
    print("[ERROR] Simulated failure: --fail flag passed", flush=True)
    sys.exit(1)

print(f"[STATUS] Initializing agents for {ticker} on {date}", flush=True)
print("[STATUS] Starting analysis...", flush=True)

t0 = time.time()

print("[MARKET_ANALYST]", flush=True)
print(f"Mock market analysis for {ticker}. Price trending up. RSI: 45. HOLD signal.", flush=True)

print("[FUNDAMENTALS_ANALYST]", flush=True)
print(f"Mock fundamentals for {ticker}. P/E: 15. Debt/Equity: 0.5. HOLD.", flush=True)

print("[SENTIMENT_ANALYST]", flush=True)
print(f"Mock sentiment for {ticker}. Neutral sentiment detected.", flush=True)

print("[NEWS_ANALYST]", flush=True)
print(f"Mock news for {ticker}. No major events found.", flush=True)

print("[BULL_RESEARCHER]", flush=True)
print(f"Bull case: {ticker} shows strong fundamentals and growth potential.", flush=True)

print("[BEAR_RESEARCHER]", flush=True)
print(f"Bear case: {ticker} faces headwinds from macro environment.", flush=True)

print("[RESEARCH_DECISION]", flush=True)
print("Research decision: HOLD based on balanced bull/bear arguments.", flush=True)

print(
    "[TOKEN_USAGE] " + json.dumps({
        "agent": "MARKET_ANALYST",
        "input": 1000,
        "output": 500,
        "total": 1500,
        "elapsed_ms": 1000,
    }),
    flush=True,
)

print("[TRADER_DECISION]", flush=True)
print("Trader decision: HOLD. Risk/reward balanced. No strong directional signal.", flush=True)

print("[RISK_AGGRESSIVE]", flush=True)
print("Aggressive: Consider small BUY position given oversold conditions.", flush=True)

print("[RISK_NEUTRAL]", flush=True)
print("Neutral: HOLD. Wait for clearer signal.", flush=True)

print("[RISK_CONSERVATIVE]", flush=True)
print("Conservative: HOLD. Preserve capital.", flush=True)

elapsed = int((time.time() - t0) * 1000)
print(
    "[TOKEN_TOTAL] " + json.dumps({
        "input": 5000,
        "output": 2000,
        "total": 7000,
        "elapsed_ms": elapsed,
    }),
    flush=True,
)

print("[FINAL_DECISION]", flush=True)
print("**Rating**: HOLD", flush=True)
print("**Executive Summary**: Balanced analysis suggests holding position.", flush=True)
print("**Investment Thesis**: No strong catalyst for a directional move at this time.", flush=True)

print("[COMPLETE]", flush=True)
sys.exit(0)
