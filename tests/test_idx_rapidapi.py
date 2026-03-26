"""
Tests for IDX RapidAPI integration.
Zero real API calls — all httpx.AsyncClient calls are mocked.
"""
import json
import os
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_api(key="test-key"):
    from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
    with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": key}):
        api = IDXRapidAPI()
    return api


def _make_async_http_mock(status_code=200, json_data=None):
    """Return (mock_client, mock_response) for patching httpx.AsyncClient."""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.json.return_value = json_data or {}
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    # Support `async with httpx.AsyncClient() as client:`
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client, mock_response


# ---------------------------------------------------------------------------
# TestIDXRapidAPICleanTicker
# ---------------------------------------------------------------------------

class TestIDXRapidAPICleanTicker:
    def test_clean_ticker_removes_jk_suffix(self):
        api = _make_api()
        assert api._clean_ticker("BBCA.JK") == "BBCA"

    def test_clean_ticker_preserves_non_jk(self):
        api = _make_api()
        assert api._clean_ticker("NVDA") == "NVDA"

    def test_clean_ticker_uppercases(self):
        api = _make_api()
        assert api._clean_ticker("bbca.jk") == "BBCA"


# ---------------------------------------------------------------------------
# TestIDXRapidAPINoKey
# ---------------------------------------------------------------------------

class TestIDXRapidAPINoKey:
    @pytest.mark.asyncio
    async def test_no_api_key_returns_empty_dict(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("IDX_RAPIDAPI_KEY", None)
            api = IDXRapidAPI()
        mock_client, _ = _make_async_http_mock()
        with patch("httpx.AsyncClient", return_value=mock_client) as mock_cls:
            result = await api._call_async("/api/emiten/BBCA/bandar/accumulation", "BBCA.JK")
            mock_client.get.assert_not_called()
            assert result == {}


# ---------------------------------------------------------------------------
# TestIDXRapidAPICache
# ---------------------------------------------------------------------------

class TestIDXRapidAPICache:
    @pytest.mark.asyncio
    async def test_cache_hit_skips_api_call(self):
        api = _make_api()
        api._cache = {}
        api._mem_cache = {}

        mock_client, mock_response = _make_async_http_mock(
            status_code=200, json_data={"signal": "accumulate"}
        )

        with patch("httpx.AsyncClient", return_value=mock_client), \
             patch.object(api, "_save_cache"), \
             patch.object(api, "_save_usage"), \
             patch("asyncio.sleep"):
            result1 = await api.get_bandar_accumulation("BBCA.JK")
            result2 = await api.get_bandar_accumulation("BBCA.JK")

        assert mock_client.get.call_count == 1
        assert result1 == {"signal": "accumulate"}
        assert result2 == {"signal": "accumulate"}


# ---------------------------------------------------------------------------
# TestIDXRapidAPIRateLimit
# ---------------------------------------------------------------------------

class TestIDXRapidAPIRateLimit:
    @pytest.mark.asyncio
    async def test_rate_limit_enforced(self):
        api = _make_api()
        api.last_request_time = time.time()  # simulate very recent request
        api._cache = {}
        api._mem_cache = {}

        mock_client, _ = _make_async_http_mock(status_code=200, json_data={"data": "ok"})

        with patch("httpx.AsyncClient", return_value=mock_client), \
             patch("asyncio.sleep") as mock_sleep, \
             patch.object(api, "_save_cache"), \
             patch.object(api, "_save_usage"):
            await api._call_async("/api/analysis/bandar/accumulation/BBCA", "BBCA.JK")

        mock_sleep.assert_called_once()
        sleep_arg = mock_sleep.call_args[0][0]
        assert sleep_arg > 0, "Expected rate limiter to sleep when request was just made"


# ---------------------------------------------------------------------------
# TestIDXRapidAPIUsage
# ---------------------------------------------------------------------------

class TestIDXRapidAPIUsage:
    @pytest.mark.asyncio
    async def test_usage_increments_on_each_call(self):
        api = _make_api()
        api._usage = {"month": "2026-03", "count": 5}
        api._cache = {}
        api._mem_cache = {}

        mock_client, _ = _make_async_http_mock(status_code=200, json_data={"data": "value"})

        with patch("httpx.AsyncClient", return_value=mock_client), \
             patch("asyncio.sleep"), \
             patch.object(api, "_save_usage"), \
             patch.object(api, "_save_cache"):
            await api.get_bandar_accumulation("BBCA.JK")
            # Second call hits disk cache from first call's mem_cache — no new HTTP call
            # Clear mem cache to force second HTTP call with different endpoint
            await api.get_bandar_distribution("BBCA.JK")

        assert api._usage["count"] == 7

    def test_monthly_reset_when_month_changes(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI
        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}):
            api = IDXRapidAPI()

        stale_data = {"month": "2025-01", "count": 999}
        with patch("builtins.open", __import__("unittest").mock.mock_open(read_data=json.dumps(stale_data))), \
             patch("json.load", return_value=stale_data):
            usage = api._load_usage()

        from datetime import datetime
        current_month = datetime.now().strftime("%Y-%m")
        assert usage["count"] == 0
        assert usage["month"] == current_month

    def test_check_usage_raises_at_limit(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRateLimitError
        api = _make_api()
        api._usage = {"month": "2026-03", "count": 1000}
        with pytest.raises(IDXRateLimitError):
            api._check_usage()


# ---------------------------------------------------------------------------
# TestIDXRapidAPIHTTPErrors
# ---------------------------------------------------------------------------

class TestIDXRapidAPIHTTPErrors:
    @pytest.mark.asyncio
    async def test_429_raises_rate_limit_error(self):
        from tradingagents.dataflows.idx_rapidapi import IDXRateLimitError
        api = _make_api()
        api._cache = {}
        api._mem_cache = {}

        mock_client, _ = _make_async_http_mock(status_code=429)

        with patch("httpx.AsyncClient", return_value=mock_client), \
             patch("asyncio.sleep"):
            with pytest.raises(IDXRateLimitError):
                await api._call_async("/api/emiten/BBCA/bandar/accumulation", "BBCA.JK")

    @pytest.mark.asyncio
    async def test_404_returns_empty_dict(self):
        api = _make_api()
        api._cache = {}
        api._mem_cache = {}

        mock_client, _ = _make_async_http_mock(status_code=404)

        with patch("httpx.AsyncClient", return_value=mock_client), \
             patch("asyncio.sleep"):
            result = await api._call_async("/api/emiten/INVALID/bandar/accumulation", "INVALID.JK")
            assert result == {}

    @pytest.mark.asyncio
    async def test_network_error_returns_partial_data(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Network error"))

        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}), \
             patch("httpx.AsyncClient", return_value=mock_client), \
             patch("asyncio.sleep"):
            result = await get_idx_market_intelligence.ainvoke({"ticker": "BBCA.JK"})

        assert "PARTIAL_DATA" in result


# ---------------------------------------------------------------------------
# TestIDXMarketIntelligenceTool
# ---------------------------------------------------------------------------

class TestIDXMarketIntelligenceTool:
    @pytest.mark.asyncio
    async def test_non_jk_ticker_returns_empty_string(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        result = await get_idx_market_intelligence.ainvoke({"ticker": "NVDA"})
        assert result == ""

    @pytest.mark.asyncio
    async def test_non_jk_ticker_lowercase_returns_empty_string(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        result = await get_idx_market_intelligence.ainvoke({"ticker": "nvda"})
        assert result == ""

    @pytest.mark.asyncio
    async def test_tool_combines_all_5_sections(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI

        sample_data = {"signal": "positive", "value": 100}

        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}), \
             patch.object(IDXRapidAPI, "get_bandar_accumulation", new_callable=AsyncMock, return_value=sample_data), \
             patch.object(IDXRapidAPI, "get_bandar_distribution", new_callable=AsyncMock, return_value=sample_data), \
             patch.object(IDXRapidAPI, "get_smart_money_flow", new_callable=AsyncMock, return_value=sample_data), \
             patch.object(IDXRapidAPI, "get_pump_dump_detection", new_callable=AsyncMock, return_value=sample_data), \
             patch.object(IDXRapidAPI, "get_foreign_ownership", new_callable=AsyncMock, return_value=sample_data):
            result = await get_idx_market_intelligence.ainvoke({"ticker": "BBCA.JK"})

        assert "Bandar Accumulation" in result
        assert "Bandar Distribution" in result
        assert "Smart Money Flow" in result
        assert "Pump & Dump Risk Assessment" in result
        assert "Foreign Ownership Trends" in result

    @pytest.mark.asyncio
    async def test_tool_shows_usage_footer(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI

        sample_data = {"signal": "positive"}

        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}), \
             patch.object(IDXRapidAPI, "get_bandar_accumulation", new_callable=AsyncMock, return_value=sample_data), \
             patch.object(IDXRapidAPI, "get_bandar_distribution", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_smart_money_flow", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_pump_dump_detection", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_foreign_ownership", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_usage", return_value={"used": 42, "limit": 1000, "remaining": 958, "month": "2026-03"}):
            result = await get_idx_market_intelligence.ainvoke({"ticker": "BBCA.JK"})

        assert "IDX API Usage this month: 42/1000" in result

    @pytest.mark.asyncio
    async def test_no_api_key_returns_data_unavailable(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence

        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("IDX_RAPIDAPI_KEY", None)
            result = await get_idx_market_intelligence.ainvoke({"ticker": "BBCA.JK"})

        assert "DATA_UNAVAILABLE" in result
        assert "IDX_RAPIDAPI_KEY not configured" in result
        assert "UNKNOWN" in result

    @pytest.mark.asyncio
    async def test_all_endpoints_fail_returns_partial_data(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI

        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}), \
             patch.object(IDXRapidAPI, "get_bandar_accumulation", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_bandar_distribution", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_smart_money_flow", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_pump_dump_detection", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_foreign_ownership", new_callable=AsyncMock, return_value={}):
            result = await get_idx_market_intelligence.ainvoke({"ticker": "BBCA.JK"})

        assert "PARTIAL_DATA" in result
        assert "UNKNOWN" in result

    @pytest.mark.asyncio
    async def test_some_endpoints_fail_returns_partial_with_warning(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI

        sample_data = {"accumulation_score": 7, "distribution_score": 3,
                       "smart_money_score": 7, "risk_score": 2, "status": "ACCUMULATE",
                       "confidence": 80, "flow_direction": "IN"}

        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}), \
             patch.object(IDXRapidAPI, "get_bandar_accumulation", new_callable=AsyncMock, return_value=sample_data), \
             patch.object(IDXRapidAPI, "get_bandar_distribution", new_callable=AsyncMock, return_value=sample_data), \
             patch.object(IDXRapidAPI, "get_smart_money_flow", new_callable=AsyncMock, return_value=sample_data), \
             patch.object(IDXRapidAPI, "get_pump_dump_detection", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_foreign_ownership", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_usage", return_value={"used": 3, "limit": 1000, "remaining": 997, "month": "2026-03"}):
            result = await get_idx_market_intelligence.ainvoke({"ticker": "BBCA.JK"})

        assert "Bandar Accumulation" in result
        assert "Bandar Distribution" in result
        assert "Smart Money Flow" in result
        assert "PARTIAL_DATA" in result
        assert "Pump & Dump Detection" in result
        assert "Foreign Ownership" in result

    @pytest.mark.asyncio
    async def test_rate_limit_returns_rate_limited_message(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        from tradingagents.dataflows.idx_rapidapi import IDXRapidAPI, IDXRateLimitError

        with patch.dict(os.environ, {"IDX_RAPIDAPI_KEY": "test-key"}), \
             patch.object(IDXRapidAPI, "get_bandar_accumulation",
                          new_callable=AsyncMock, side_effect=IDXRateLimitError("Monthly limit reached")), \
             patch.object(IDXRapidAPI, "get_bandar_distribution", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_smart_money_flow", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_pump_dump_detection", new_callable=AsyncMock, return_value={}), \
             patch.object(IDXRapidAPI, "get_foreign_ownership", new_callable=AsyncMock, return_value={}):
            result = await get_idx_market_intelligence.ainvoke({"ticker": "BBCA.JK"})

        assert "RATE_LIMITED" in result
        assert "UNKNOWN" in result

    @pytest.mark.asyncio
    async def test_non_jk_still_returns_empty_string(self):
        from tradingagents.dataflows.idx_rapidapi_tools import get_idx_market_intelligence
        result = await get_idx_market_intelligence.ainvoke({"ticker": "NVDA"})
        assert result == ""


# ---------------------------------------------------------------------------
# TestIDXRapidAPICircuitBreaker
# ---------------------------------------------------------------------------

class TestIDXRapidAPICircuitBreaker:
    @pytest.mark.asyncio
    async def test_circuit_breaker_opens_after_3_failures(self):
        api = _make_api()
        api._cache = {}
        api._mem_cache = {}

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))

        with patch("httpx.AsyncClient", return_value=mock_client), \
             patch("asyncio.sleep"):
            for _ in range(3):
                try:
                    await api._call_async("/api/test/BBCA", "BBCA")
                except httpx.ConnectError:
                    pass

        assert api._circuit_open_until > time.time()

    @pytest.mark.asyncio
    async def test_circuit_breaker_skips_request_when_open(self):
        api = _make_api()
        api._cache = {}
        api._mem_cache = {}
        api._circuit_open_until = time.time() + 300

        mock_client, _ = _make_async_http_mock()

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await api._call_async("/api/test/BBCA", "BBCA")

        mock_client.get.assert_not_called()
        assert result == {}

    @pytest.mark.asyncio
    async def test_circuit_breaker_resets_after_success(self):
        api = _make_api()
        api._cache = {}
        api._mem_cache = {}
        api._failure_count = 2

        mock_client, _ = _make_async_http_mock(status_code=200, json_data={"data": "ok"})

        with patch("httpx.AsyncClient", return_value=mock_client), \
             patch("asyncio.sleep"), \
             patch.object(api, "_save_cache"), \
             patch.object(api, "_save_usage"):
            await api._call_async("/api/test/BBCA", "BBCA")

        assert api._failure_count == 0


# ---------------------------------------------------------------------------
# TestIDXRapidAPIDiskIOErrors
# ---------------------------------------------------------------------------

class TestIDXRapidAPIDiskIOErrors:
    def test_disk_io_error_logs_warning_not_silent(self):
        api = _make_api()
        with patch("builtins.open", side_effect=PermissionError("denied")), \
             patch("logging.warning") as mock_warn:
            api._save_cache()
        mock_warn.assert_called_once()
        assert "denied" in mock_warn.call_args[0][0]

    def test_cache_healthy_flag_set_false_on_save_error(self):
        api = _make_api()
        api._cache_healthy = True
        with patch("builtins.open", side_effect=PermissionError("denied")):
            api._save_cache()
        assert api._cache_healthy is False


# ---------------------------------------------------------------------------
# TestIDXRapidAPIGetUsageHealthFields
# ---------------------------------------------------------------------------

class TestIDXRapidAPIGetUsageHealthFields:
    def test_get_usage_includes_health_fields(self):
        api = _make_api()
        usage = api.get_usage()
        assert "circuit_status" in usage
        assert "cache_status" in usage
        assert "last_error" in usage
        assert usage["circuit_status"] == "closed"
        assert usage["cache_status"] == "ok"


# ---------------------------------------------------------------------------
# TestIDXRapidAPIConcurrent (new)
# ---------------------------------------------------------------------------

class TestIDXRapidAPIConcurrent:
    @pytest.mark.asyncio
    async def test_concurrent_fetch_faster_than_sequential(self):
        import asyncio
        import time as _time

        api = _make_api()
        api._cache = {}
        api._mem_cache = {}

        async def slow_call(*args, **kwargs):
            await asyncio.sleep(0.1)
            return {"data": "ok"}

        with patch.object(api, "_call_async", side_effect=slow_call):
            start = _time.perf_counter()
            await asyncio.gather(
                api.get_bandar_accumulation("BBCA.JK"),
                api.get_bandar_distribution("BBCA.JK"),
                api.get_smart_money_flow("BBCA.JK"),
                api.get_pump_dump_detection("BBCA.JK"),
                api.get_foreign_ownership("BBCA.JK"),
            )
            elapsed = _time.perf_counter() - start

        assert elapsed < 0.5, f"Expected concurrent execution, got {elapsed:.2f}s"
