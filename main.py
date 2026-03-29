import argparse
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

parser = argparse.ArgumentParser()
parser.add_argument('ticker', nargs='?', default='NVDA')
parser.add_argument('--deep-think-llm', default=None)
args, _ = parser.parse_known_args()

# Create a custom config
config = DEFAULT_CONFIG.copy()
if args.deep_think_llm:
    config['deep_think_llm'] = args.deep_think_llm

config["max_debate_rounds"] = 1  # Increase debate rounds

# Configure data vendors (default uses yfinance, no extra API keys needed)
config["data_vendors"] = {
    "core_stock_apis": "yfinance",           # Options: alpha_vantage, yfinance
    "technical_indicators": "yfinance",      # Options: alpha_vantage, yfinance
    "fundamental_data": "yfinance",          # Options: alpha_vantage, yfinance
    "news_data": "yfinance",                 # Options: alpha_vantage, yfinance
}

# Initialize with custom config
ta = TradingAgentsGraph(debug=True, config=config)

# forward propagate
_, decision = ta.propagate(args.ticker, "2024-05-10")
print(decision)

# Memorize mistakes and reflect
# ta.reflect_and_remember(1000) # parameter is the position returns
