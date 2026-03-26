import asyncio
import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path

import httpx

BASE_URL = "https://indonesia-stock-exchange-idx.p.rapidapi.com"


class IDXRateLimitError(Exception):
    pass


class IDXRapidAPI:
    FAILURE_THRESHOLD = 3
    CIRCUIT_OPEN_DURATION = 300  # seconds

    def __init__(self):
        self.api_key = os.getenv("IDX_RAPIDAPI_KEY")
        self.headers = {
            "x-rapidapi-key": self.api_key or "",
            "x-rapidapi-host": "indonesia-stock-exchange-idx.p.rapidapi.com",
        }
        self.last_request_time = 0.0
        self._rate_semaphore = asyncio.Semaphore(1)
        self._mem_cache = {}
        self._cache_ttl = 3600
        self._cache_file = Path.home() / ".tradingagents_idx_cache.json"
        self._usage_file = Path.home() / ".tradingagents_idx_usage.json"
        self._cache_healthy = True
        self._failure_count = 0
        self._circuit_open_until = 0.0
        self._last_error: str | None = None
        self._cache = self._load_cache()
        self._usage = self._load_usage()

    def _clean_ticker(self, ticker: str) -> str:
        return ticker.upper().replace(".JK", "").strip()

    def _load_cache(self) -> dict:
        try:
            with open(self._cache_file, "r") as f:
                return json.load(f)
        except (OSError, IOError, json.JSONDecodeError, ValueError) as e:
            logging.warning(f"IDX cache load failed: {e}")
            return {}

    def _save_cache(self):
        try:
            with open(self._cache_file, "w") as f:
                json.dump(self._cache, f)
        except (OSError, IOError) as e:
            logging.warning(f"IDX cache save failed: {e}")
            self._cache_healthy = False

    def _load_usage(self) -> dict:
        current_month = datetime.now().strftime("%Y-%m")
        try:
            with open(self._usage_file, "r") as f:
                data = json.load(f)
            if data.get("month") != current_month:
                return {"month": current_month, "count": 0}
            return data
        except (OSError, IOError, json.JSONDecodeError, ValueError) as e:
            logging.warning(f"IDX usage load failed: {e}")
            return {"month": current_month, "count": 0}

    def _save_usage(self):
        try:
            with open(self._usage_file, "w") as f:
                json.dump(self._usage, f)
        except (OSError, IOError) as e:
            logging.warning(f"IDX usage save failed: {e}")

    def _check_usage(self):
        count = self._usage.get("count", 0)
        if count >= 1000:
            raise IDXRateLimitError("Monthly limit reached (1000 requests)")
        if count >= 800:
            logging.warning(f"IDX API: {count}/1000 requests used this month")

    async def _call_async(self, endpoint: str, ticker: str) -> dict:
        if not self.api_key:
            return {}

        cache_key = f"{endpoint}_{ticker}"
        now = time.time()

        # Check in-memory cache first
        if cache_key in self._mem_cache:
            entry = self._mem_cache[cache_key]
            if now - entry["ts"] < self._cache_ttl:
                return entry["data"]

        # Check disk cache
        if cache_key in self._cache:
            entry = self._cache[cache_key]
            if now - entry["ts"] < self._cache_ttl:
                self._mem_cache[cache_key] = entry
                return entry["data"]

        self._check_usage()

        # Circuit breaker check
        if time.time() < self._circuit_open_until:
            logging.warning("IDX API circuit breaker OPEN, skipping request")
            return {}

        # Rate limiting — serialized via semaphore, HTTP runs concurrently after
        async with self._rate_semaphore:
            elapsed = time.time() - self.last_request_time
            await asyncio.sleep(max(0, 1.0 - elapsed))
            self.last_request_time = time.time()

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    BASE_URL + endpoint,
                    headers=self.headers,
                    timeout=httpx.Timeout(10.0),
                )
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            self._failure_count += 1
            self._last_error = str(e)
            if self._failure_count >= self.FAILURE_THRESHOLD:
                self._circuit_open_until = time.time() + self.CIRCUIT_OPEN_DURATION
                logging.error("IDX API circuit breaker opened for 5 minutes")
            raise

        if response.status_code == 429:
            raise IDXRateLimitError("API rate limit exceeded (HTTP 429)")
        if response.status_code in (401, 403, 404):
            return {}
        if response.status_code >= 500:
            self._failure_count += 1
            self._last_error = f"HTTP {response.status_code}"
            if self._failure_count >= self.FAILURE_THRESHOLD:
                self._circuit_open_until = time.time() + self.CIRCUIT_OPEN_DURATION
                logging.error("IDX API circuit breaker opened for 5 minutes")

        response.raise_for_status()

        data = response.json()
        self._failure_count = 0
        self._last_error = None

        entry = {"ts": time.time(), "data": data}
        self._mem_cache[cache_key] = entry
        self._cache[cache_key] = entry
        self._save_cache()

        self._usage["count"] = self._usage.get("count", 0) + 1
        self._save_usage()

        return data

    async def get_bandar_accumulation(self, ticker: str) -> dict:
        clean = self._clean_ticker(ticker)
        return await self._call_async(f"/api/analysis/bandar/accumulation/{clean}", ticker)

    async def get_bandar_distribution(self, ticker: str) -> dict:
        clean = self._clean_ticker(ticker)
        return await self._call_async(f"/api/analysis/bandar/distribution/{clean}", ticker)

    async def get_smart_money_flow(self, ticker: str) -> dict:
        clean = self._clean_ticker(ticker)
        return await self._call_async(f"/api/analysis/bandar/smart-money/{clean}", ticker)

    async def get_pump_dump_detection(self, ticker: str) -> dict:
        clean = self._clean_ticker(ticker)
        return await self._call_async(f"/api/analysis/bandar/pump-dump/{clean}", ticker)

    async def get_foreign_ownership(self, ticker: str) -> dict:
        clean = self._clean_ticker(ticker)
        return await self._call_async(f"/api/emiten/{clean}/foreign-ownership", ticker)

    def get_usage(self) -> dict:
        used = self._usage.get("count", 0)
        now = time.time()
        return {
            "used": used,
            "limit": 1000,
            "remaining": 1000 - used,
            "month": self._usage.get("month", ""),
            "circuit_status": "open" if now < self._circuit_open_until else "closed",
            "cache_status": "degraded" if not self._cache_healthy else "ok",
            "last_error": self._last_error,
        }
