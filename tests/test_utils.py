import re
import unittest
from datetime import datetime

from cli.utils import normalize_ticker_symbol

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Inline the alias dict from tradingagents/dataflows/y_finance.py and
# alpha_vantage_indicator.py (both define identical mappings).
INDICATOR_ALIASES = {
    "macd signal": "macds",
    "macd_signal": "macds",
    "signal line": "macds",
    "macd histogram": "macdh",
    "macd_histogram": "macdh",
    "histogram": "macdh",
    "bollinger": "boll",
    "bollinger middle": "boll",
    "bollinger upper": "boll_ub",
    "bollinger upper band": "boll_ub",
    "bollinger lower": "boll_lb",
    "bollinger lower band": "boll_lb",
    "sma50": "close_50_sma",
    "sma200": "close_200_sma",
    "ema10": "close_10_ema",
    "50 sma": "close_50_sma",
    "200 sma": "close_200_sma",
    "10 ema": "close_10_ema",
}


class TickerNormalizationTests(unittest.TestCase):
    def test_us_ticker(self):
        self.assertEqual(normalize_ticker_symbol(" nvda "), "NVDA")

    def test_idx_ticker(self):
        self.assertEqual(normalize_ticker_symbol("bbca.jk"), "BBCA.JK")

    def test_tse_ticker(self):
        self.assertEqual(normalize_ticker_symbol(" 7203.t "), "7203.T")

    def test_hkex_ticker(self):
        self.assertEqual(normalize_ticker_symbol("0700.hk"), "0700.HK")

    def test_tsx_ticker(self):
        self.assertEqual(normalize_ticker_symbol("cnq.to"), "CNQ.TO")


class DateValidationTests(unittest.TestCase):
    def test_valid_date_matches_regex(self):
        self.assertRegex("2026-03-24", DATE_RE)

    def test_invalid_calendar_date_raises(self):
        # Matches regex format but is not a real date
        self.assertRegex("9999-99-99", DATE_RE)
        with self.assertRaises(ValueError):
            datetime.strptime("9999-99-99", "%Y-%m-%d")

    def test_non_date_string_does_not_match_regex(self):
        self.assertNotRegex("abc", DATE_RE)

    def test_partial_date_does_not_match_regex(self):
        self.assertNotRegex("2026-03", DATE_RE)


class IndicatorAliasTests(unittest.TestCase):
    def _resolve(self, name: str) -> str:
        return INDICATOR_ALIASES.get(name.lower(), name)

    def test_macd_signal(self):
        self.assertEqual(self._resolve("macd signal"), "macds")

    def test_bollinger(self):
        self.assertEqual(self._resolve("bollinger"), "boll")

    def test_bollinger_upper_band(self):
        self.assertEqual(self._resolve("bollinger upper band"), "boll_ub")

    def test_50_sma(self):
        self.assertEqual(self._resolve("50 sma"), "close_50_sma")

    def test_10_ema(self):
        self.assertEqual(self._resolve("10 ema"), "close_10_ema")

    def test_unknown_passthrough(self):
        self.assertEqual(self._resolve("rsi"), "rsi")


if __name__ == "__main__":
    unittest.main()
