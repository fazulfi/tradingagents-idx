import os
import json
import logging
import time
from datetime import datetime
from pathlib import Path

BASE_URL = "https://indonesia-stock-exchange-idx.p.rapidapi.com"


class IDXRateLimitError(Exception):
    pass


class IDXRapidAPI:
    def __init__(self):
        self.api_key = os.getenv("IDX_RAPIDAPI_KEY")
        self.headers = {
            "x-rapidapi-key": self.api_key or "",
            "x-rapidapi-host": "indonesia-stock-exchange-idx.p.rapidapi.com",
        }
        self.last_request_time = 0.0
        self._mem_cache = {}
        self._cache_ttl = 3600
        self._cache_file = Path.home() / ".tradingagents_idx_cache.json"
        self._usage_file = Path.home() / ".tradingagents_idx_usage.json"
        self._cache = self._load_cache()
        self._usage = self._load_usage()

    def _clean_ticker(self, ticker: str) -> str:
        return ticker.upper().replace(".JK", "").strip()

    def _rate_limit(self):
        elapsed = time.time() - self.last_request_time
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)
        self.last_request_time = time.time()

    def _load_cache(self) -> dict:
        try:
            with open(self._cache_file, "r") as f:
                return json.load(f)
        except Exception:
            return {}

    def _save_cache(self):
        try:
            with open(self._cache_file, "w") as f:
                json.dump(self._cache, f)
        except Exception:
            pass

    def _load_usage(self) -> dict:
        current_month = datetime.now().strftime("%Y-%m")
        try:
            with open(self._usage_file, "r") as f:
                data = json.load(f)
            if data.get("month") != current_month:
                return {"month": current_month, "count": 0}
            return data
        except Exception:
            return {"month": current_month, "count": 0}

    def _save_usage(self):
        try:
            with open(self._usage_file, "w") as f:
                json.dump(self._usage, f)
        except Exception:
            pass

    def _check_usage(self):
        count = self._usage.get("count", 0)
        if count >= 1000:
            raise IDXRateLimitError("Monthly limit reached (1000 requests)")
        if count >= 800:
            logging.warning(f"IDX API: {count}/1000 requests used this month")

    def _call(self, endpoint: str, ticker: str) -> dict:
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
        self._rate_limit()

        import requests

        response = requests.get(
            BASE_URL + endpoint, headers=self.headers, timeout=10
        )

        if response.status_code == 429:
            raise IDXRateLimitError("API rate limit exceeded (HTTP 429)")
        if response.status_code == 404:
            return {}
        response.raise_for_status()

        data = response.json()

        entry = {"ts": time.time(), "data": data}
        self._mem_cache[cache_key] = entry
        self._cache[cache_key] = entry
        self._save_cache()

        self._usage["count"] = self._usage.get("count", 0) + 1
        self._save_usage()

        return data

    def get_bandar_accumulation(self, ticker: str) -> dict:
        clean = self._clean_ticker(ticker)
        return self._call(f"/api/emiten/{clean}/bandar/accumulation", ticker)

    def get_bandar_distribution(self, ticker: str) -> dict:
        clean = self._clean_ticker(ticker)
        return self._call(f"/api/emiten/{clean}/bandar/distribution", ticker)

    def get_smart_money_flow(self, ticker: str) -> dict:
        clean = self._clean_ticker(ticker)
        return self._call(f"/api/emiten/{clean}/smartmoney", ticker)

    def get_pump_dump_detection(self, ticker: str) -> dict:
        clean = self._clean_ticker(ticker)
        return self._call(f"/api/analysis/pumpDump/{clean}", ticker)

    def get_foreign_ownership(self, ticker: str) -> dict:
        clean = self._clean_ticker(ticker)
        return self._call(f"/api/emiten/{clean}/foreignOwnership", ticker)

    def get_usage(self) -> dict:
        used = self._usage.get("count", 0)
        return {
            "used": used,
            "limit": 1000,
            "remaining": 1000 - used,
            "month": self._usage.get("month", ""),
        }
