"""
Tests for IDX RapidAPI integration.
Zero real API calls — all httpx.get calls are mocked.
"""
import json
import os
import time
import unittest
from unittest.mock import MagicMock, patch, call

import httpx


class TestIDXRapidAPICleanTicker(unittest.TestCase):
    def _make_api(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            api = IDXRapidAPI()
        return api

    def test_clean_ticker_removes_jk_suffix(self):
        api = self._make_api()
        self.assertEqual(api._clean_ticker("BBCA.JK"), "BBCA")

    def test_clean_ticker_preserves_non_jk(self):
        api = self._make_api()
        self.assertEqual(api._clean_ticker("NVDA"), "NVDA")

    def test_clean_ticker_uppercases(self):
        api = self._make_api()
        self.assertEqual(api._clean_ticker("bbca.jk"), "BBCA")


class TestIDXRapidAPINoKey(unittest.TestCase):
    def test_no_api_key_returns_empty_dict(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("IDX_RAPIDAPI_KEY", None)
            api = IDXRapidAPI()
        with patch("httpx.get") as mock_get:
            result = api._call("/api/emiten/BBCA/bandar/accumulation", "BBCA.JK")
            mock_get.assert_not_called()
            self.assertEqual(result, {})


class TestIDXRapidAPICache(unittest.TestCase):
    def _make_api_with_key(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            api = IDXRapidAPI()
        return api

    def test_cache_hit_skips_api_call(self):
        api = self._make_api_with_key()
        # Wipe both caches so the first call is guaranteed to hit the API
        api._cache = {}
        api._mem_cache = {}
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"signal": "accumulate"}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.get", return_value=mock_response) as mock_get, \
             patch.object(api, "_save_cache"), \
             patch.object(api, "_save_usage"):
            # First call — hits the API
            result1 = api.get_bandar_accumulation("BBCA.JK")
            # Second call — should be served from in-memory cache
            result2 = api.get_bandar_accumulation("BBCA.JK")
            self.assertEqual(mock_get.call_count, 1)
            self.assertEqual(result1, {"signal": "accumulate"})
            self.assertEqual(result2, {"signal": "accumulate"})


class TestIDXRapidAPIRateLimit(unittest.TestCase):
    def _make_api_with_key(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            api = IDXRapidAPI()
        return api

    def test_rate_limit_enforced(self):
        api = self._make_api_with_key()
        api.last_request_time = time.time()  # Set last request to now

        with patch("time.sleep") as mock_sleep, patch("time.time", side_effect=[
            api.last_request_time + 0.3,  # elapsed = 0.3s (< 1.0s)
            api.last_request_time + 0.3,  # second time.time() call in _rate_limit
        ]):
            api._rate_limit()
            mock_sleep.assert_called_once()
            sleep_arg = mock_sleep.call_args[0][0]
            self.assertAlmostEqual(sleep_arg, 0.7, places=1)


class TestIDXRapidAPIUsage(unittest.TestCase):
    def _make_api_with_key(self, count=0):
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            api = IDXRapidAPI()
        api._usage = {"month": "2026-03", "count": count}
        return api

    def test_usage_increments_on_each_call(self):
        api = self._make_api_with_key(count=5)
        # Clear caches to prevent disk cache hits from other tests
        api._cache = {}
        api._mem_cache = {}
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": "value"}
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.get", return_value=mock_response), \
             patch.object(api, "_rate_limit"), \
             patch.object(api, "_save_usage"), \
             patch.object(api, "_save_cache"):
            api.get_bandar_accumulation("BBCA.JK")
            api.get_bandar_distribution("BBCA.JK")

        self.assertEqual(api._usage["count"], 7)

    def test_monthly_reset_when_month_changes(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            api = IDXRapidAPI()

        # Simulate stored data from a previous month
        stale_data = {"month": "2025-01", "count": 999}
        with patch("builtins.open", unittest.mock.mock_open(read_data=json.dumps(stale_data))), \
             patch("json.load", return_value=stale_data):
            usage = api._load_usage()

        # Should reset because month differs from current month
        from datetime import datetime
        current_month = datetime.now().strftime("%Y-%m")
        self.assertEqual(usage["count"], 0)
        self.assertEqual(usage["month"], current_month)

    def test_check_usage_raises_at_limit(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRateLimitError
        api = self._make_api_with_key(count=1000)
        with self.assertRaises(IDXRateLimitError):
            api._check_usage()


class TestIDXRapidAPIHTTPErrors(unittest.TestCase):
    def _make_api_with_key(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            api = IDXRapidAPI()
        return api

    def test_429_raises_rate_limit_error(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRateLimitError
        api = self._make_api_with_key()
        # Clear caches to prevent disk cache hits from other tests
        api._cache = {}
        api._mem_cache = {}
        mock_response = MagicMock()
        mock_response.status_code = 429

        with patch("httpx.get", return_value=mock_response), \
             patch.object(api, "_rate_limit"):
            with self.assertRaises(IDXRateLimitError):
                api._call("/api/emiten/BBCA/bandar/accumulation", "BBCA.JK")

    def test_404_returns_empty_dict(self):
        api = self._make_api_with_key()
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("httpx.get", return_value=mock_response), \
             patch.object(api, "_rate_limit"):
            result = api._call("/api/emiten/INVALID/bandar/accumulation", "INVALID.JK")
            self.assertEqual(result, {})

    def test_network_error_returns_partial_data(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence

        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            with patch("httpx.get", side_effect=httpx.ConnectError("Network error")):
                result = get_idx_market_intelligence.invoke({"ticker": "BBCA.JK"})
        self.assertIn("PARTIAL_DATA", result)


class TestIDXMarketIntelligenceTool(unittest.TestCase):
    def test_non_jk_ticker_returns_empty_string(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        result = get_idx_market_intelligence.invoke({"ticker": "NVDA"})
        self.assertEqual(result, "")

    def test_non_jk_ticker_lowercase_returns_empty_string(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        result = get_idx_market_intelligence.invoke({"ticker": "nvda"})
        self.assertEqual(result, "")

    def test_tool_combines_all_5_sections(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI

        sample_data = {"signal": "positive", "value": 100}

        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            with patch.object(IDXRapidAPI, "get_bandar_accumulation", return_value=sample_data), \
                 patch.object(IDXRapidAPI, "get_bandar_distribution", return_value=sample_data), \
                 patch.object(IDXRapidAPI, "get_smart_money_flow", return_value=sample_data), \
                 patch.object(IDXRapidAPI, "get_pump_dump_detection", return_value=sample_data), \
                 patch.object(IDXRapidAPI, "get_foreign_ownership", return_value=sample_data):
                result = get_idx_market_intelligence.invoke({"ticker": "BBCA.JK"})

        self.assertIn("Bandar Accumulation", result)
        self.assertIn("Bandar Distribution", result)
        self.assertIn("Smart Money Flow", result)
        self.assertIn("Pump & Dump Risk Assessment", result)
        self.assertIn("Foreign Ownership Trends", result)

    def test_tool_shows_usage_footer(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI

        sample_data = {"signal": "positive"}

        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            with patch.object(IDXRapidAPI, "get_bandar_accumulation", return_value=sample_data), \
                 patch.object(IDXRapidAPI, "get_bandar_distribution", return_value={}), \
                 patch.object(IDXRapidAPI, "get_smart_money_flow", return_value={}), \
                 patch.object(IDXRapidAPI, "get_pump_dump_detection", return_value={}), \
                 patch.object(IDXRapidAPI, "get_foreign_ownership", return_value={}), \
                 patch.object(IDXRapidAPI, "get_usage", return_value={"used": 42, "limit": 1000, "remaining": 958, "month": "2026-03"}):
                result = get_idx_market_intelligence.invoke({"ticker": "BBCA.JK"})

        self.assertIn("IDX API Usage this month: 42/1000", result)

    def test_no_api_key_returns_data_unavailable(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence

        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("IDX_RAPIDAPI_KEY", None)
            result = get_idx_market_intelligence.invoke({"ticker": "BBCA.JK"})

        self.assertIn("DATA_UNAVAILABLE", result)
        self.assertIn("IDX_RAPIDAPI_KEY not configured", result)
        self.assertIn("UNKNOWN", result)

    def test_all_endpoints_fail_returns_partial_data(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI

        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            with patch.object(IDXRapidAPI, "get_bandar_accumulation", return_value={}), \
                 patch.object(IDXRapidAPI, "get_bandar_distribution", return_value={}), \
                 patch.object(IDXRapidAPI, "get_smart_money_flow", return_value={}), \
                 patch.object(IDXRapidAPI, "get_pump_dump_detection", return_value={}), \
                 patch.object(IDXRapidAPI, "get_foreign_ownership", return_value={}):
                result = get_idx_market_intelligence.invoke({"ticker": "BBCA.JK"})

        self.assertIn("PARTIAL_DATA", result)
        self.assertIn("UNKNOWN", result)

    def test_some_endpoints_fail_returns_partial_with_warning(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI

        sample_data = {"accumulation_score": 7, "distribution_score": 3,
                       "smart_money_score": 7, "risk_score": 2, "status": "ACCUMULATE",
                       "confidence": 80, "flow_direction": "IN"}

        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            with patch.object(IDXRapidAPI, "get_bandar_accumulation", return_value=sample_data), \
                 patch.object(IDXRapidAPI, "get_bandar_distribution", return_value=sample_data), \
                 patch.object(IDXRapidAPI, "get_smart_money_flow", return_value=sample_data), \
                 patch.object(IDXRapidAPI, "get_pump_dump_detection", return_value={}), \
                 patch.object(IDXRapidAPI, "get_foreign_ownership", return_value={}), \
                 patch.object(IDXRapidAPI, "get_usage", return_value={"used": 3, "limit": 1000, "remaining": 997, "month": "2026-03"}):
                result = get_idx_market_intelligence.invoke({"ticker": "BBCA.JK"})

        self.assertIn("Bandar Accumulation", result)
        self.assertIn("Bandar Distribution", result)
        self.assertIn("Smart Money Flow", result)
        self.assertIn("PARTIAL_DATA", result)
        self.assertIn("Pump & Dump Detection", result)
        self.assertIn("Foreign Ownership", result)

    def test_rate_limit_returns_rate_limited_message(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI, IDXRateLimitError

        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            with patch.object(IDXRapidAPI, "get_bandar_accumulation",
                              side_effect=IDXRateLimitError("Monthly limit reached")):
                result = get_idx_market_intelligence.invoke({"ticker": "BBCA.JK"})

        self.assertIn("RATE_LIMITED", result)
        self.assertIn("UNKNOWN", result)

    def test_non_jk_still_returns_empty_string(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        result = get_idx_market_intelligence.invoke({"ticker": "NVDA"})
        self.assertEqual(result, "")


class TestIDXRapidAPICircuitBreaker(unittest.TestCase):
    def _make_api(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            api = IDXRapidAPI()
        api._cache = {}
        api._mem_cache = {}
        return api

    def test_circuit_breaker_opens_after_3_failures(self):
        api = self._make_api()
        with patch("httpx.get", side_effect=httpx.ConnectError("refused")), \
             patch.object(api, "_rate_limit"):
            for _ in range(3):
                try:
                    api._call("/api/test/BBCA", "BBCA")
                except httpx.ConnectError:
                    pass
        self.assertGreater(api._circuit_open_until, time.time())

    def test_circuit_breaker_skips_request_when_open(self):
        api = self._make_api()
        api._circuit_open_until = time.time() + 300
        with patch("httpx.get") as mock_get:
            result = api._call("/api/test/BBCA", "BBCA")
        mock_get.assert_not_called()
        self.assertEqual(result, {})

    def test_circuit_breaker_resets_after_success(self):
        api = self._make_api()
        api._failure_count = 2
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": "ok"}
        mock_response.raise_for_status = MagicMock()
        with patch("httpx.get", return_value=mock_response), \
             patch.object(api, "_rate_limit"), \
             patch.object(api, "_save_cache"), \
             patch.object(api, "_save_usage"):
            api._call("/api/test/BBCA", "BBCA")
        self.assertEqual(api._failure_count, 0)


class TestIDXRapidAPIDiskIOErrors(unittest.TestCase):
    def _make_api(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            api = IDXRapidAPI()
        return api

    def test_disk_io_error_logs_warning_not_silent(self):
        api = self._make_api()
        with patch("builtins.open", side_effect=PermissionError("denied")), \
             patch("logging.warning") as mock_warn:
            api._save_cache()
        mock_warn.assert_called_once()
        self.assertIn("denied", mock_warn.call_args[0][0])

    def test_cache_healthy_flag_set_false_on_save_error(self):
        api = self._make_api()
        api._cache_healthy = True
        with patch("builtins.open", side_effect=PermissionError("denied")):
            api._save_cache()
        self.assertFalse(api._cache_healthy)


class TestIDXRapidAPIGetUsageHealthFields(unittest.TestCase):
    def test_get_usage_includes_health_fields(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            api = IDXRapidAPI()
        usage = api.get_usage()
        self.assertIn("circuit_status", usage)
        self.assertIn("cache_status", usage)
        self.assertIn("last_error", usage)
        self.assertEqual(usage["circuit_status"], "closed")
        self.assertEqual(usage["cache_status"], "ok")


if __name__ == "__main__":
    unittest.main()
