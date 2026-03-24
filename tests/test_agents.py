import os
import unittest

from tradingagents.agents.utils.agent_utils import build_instrument_context

ENV_KEYS = ("EXCHANGE_CONTEXT", "DATE_CONTEXT", "ANALYST_PERSONA", "LANGUAGE_INSTRUCTION")


def _clear_env():
    for k in ENV_KEYS:
        os.environ.pop(k, None)


class BuildInstrumentContextTests(unittest.TestCase):
    def setUp(self):
        _clear_env()

    def tearDown(self):
        _clear_env()

    def test_contains_exact_ticker(self):
        ctx = build_instrument_context("BBCA.JK")
        self.assertIn("BBCA.JK", ctx)

    def test_contains_ticker_with_numeric_suffix(self):
        ctx = build_instrument_context("7203.T")
        self.assertIn("7203.T", ctx)

    def test_base_mentions_exchange_suffix(self):
        ctx = build_instrument_context("CNQ.TO")
        self.assertIn("exchange suffix", ctx)

    def test_no_extra_sections_without_env_vars(self):
        ctx = build_instrument_context("NVDA")
        # Without env vars the result is a single block (no double newline separator)
        self.assertNotIn("\n\n", ctx)

    def test_exchange_context_injected(self):
        os.environ["EXCHANGE_CONTEXT"] = "TEST_EXCHANGE_CTX"
        ctx = build_instrument_context("NVDA")
        self.assertIn("TEST_EXCHANGE_CTX", ctx)

    def test_date_context_injected(self):
        os.environ["DATE_CONTEXT"] = "TEST_DATE_CTX"
        ctx = build_instrument_context("NVDA")
        self.assertIn("TEST_DATE_CTX", ctx)

    def test_analyst_persona_injected(self):
        os.environ["ANALYST_PERSONA"] = "TEST_PERSONA"
        ctx = build_instrument_context("NVDA")
        self.assertIn("TEST_PERSONA", ctx)

    def test_language_instruction_injected(self):
        os.environ["LANGUAGE_INSTRUCTION"] = "TEST_LANG"
        ctx = build_instrument_context("NVDA")
        self.assertIn("TEST_LANG", ctx)

    def test_all_env_vars_present(self):
        for k in ENV_KEYS:
            os.environ[k] = f"VAL_{k}"
        ctx = build_instrument_context("NVDA")
        for k in ENV_KEYS:
            self.assertIn(f"VAL_{k}", ctx)

    def test_empty_env_vars_not_appended(self):
        for k in ENV_KEYS:
            os.environ[k] = "   "  # whitespace only
        ctx = build_instrument_context("NVDA")
        self.assertNotIn("\n\n", ctx)


if __name__ == "__main__":
    unittest.main()
