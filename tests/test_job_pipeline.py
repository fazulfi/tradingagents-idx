"""
Job pipeline tests using fake_tradingagents.py as a subprocess.

These tests verify that:
- The fake script produces the expected marker output
- All section markers are present and detectable
- TOKEN_USAGE and TOKEN_TOTAL JSON payloads are parseable
- FINAL_DECISION content is correct
- Verdict detection logic identifies HOLD correctly
- Exit code 0 produces [COMPLETE]; non-zero exit does not

No Next.js server is required — all tests run purely in Python.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).parent
FAKE_SCRIPT = TESTS_DIR / "fake_tradingagents.py"

SECTION_MARKERS = [
    "MARKET_ANALYST",
    "FUNDAMENTALS_ANALYST",
    "SENTIMENT_ANALYST",
    "NEWS_ANALYST",
    "BULL_RESEARCHER",
    "BEAR_RESEARCHER",
    "RESEARCH_DECISION",
    "TRADER_DECISION",
    "RISK_AGGRESSIVE",
    "RISK_NEUTRAL",
    "RISK_CONSERVATIVE",
    "FINAL_DECISION",
]


def _run_fake(extra_args=None):
    """Run fake_tradingagents.py and return CompletedProcess."""
    cmd = [sys.executable, str(FAKE_SCRIPT), "TEST", "2026-01-01", "/tmp", "gpt-4o"]
    if extra_args:
        cmd.extend(extra_args)
    return subprocess.run(cmd, capture_output=True, text=True)


def test_fake_script_produces_output():
    """Test 1: fake script produces non-empty stdout."""
    result = _run_fake()
    assert result.stdout.strip(), "Expected non-empty stdout from fake script"


def test_all_section_markers_detected():
    """Test 2: all 12 section markers appear in output."""
    result = _run_fake()
    lines = result.stdout.splitlines()
    found = set()
    for line in lines:
        for marker in SECTION_MARKERS:
            if f"[{marker}]" in line:
                found.add(marker)
    missing = set(SECTION_MARKERS) - found
    assert not missing, f"Missing section markers: {missing}"


def test_token_usage_json_parseable():
    """Test 3: [TOKEN_USAGE] line contains valid JSON."""
    result = _run_fake()
    token_line = next(
        (l for l in result.stdout.splitlines() if "[TOKEN_USAGE]" in l), None
    )
    assert token_line is not None, "[TOKEN_USAGE] line not found"
    json_str = token_line.split("[TOKEN_USAGE]")[1].strip()
    data = json.loads(json_str)
    assert "agent" in data
    assert "input" in data
    assert "output" in data
    assert "total" in data
    assert "elapsed_ms" in data


def test_token_total_json_parseable():
    """Test 4: [TOKEN_TOTAL] line contains valid JSON."""
    result = _run_fake()
    token_line = next(
        (l for l in result.stdout.splitlines() if "[TOKEN_TOTAL]" in l), None
    )
    assert token_line is not None, "[TOKEN_TOTAL] line not found"
    json_str = token_line.split("[TOKEN_TOTAL]")[1].strip()
    data = json.loads(json_str)
    assert "input" in data
    assert "output" in data
    assert "total" in data
    assert "elapsed_ms" in data


def test_final_decision_contains_rating():
    """Test 5: content after [FINAL_DECISION] contains **Rating**: HOLD."""
    result = _run_fake()
    lines = result.stdout.splitlines()
    in_final = False
    found = False
    for line in lines:
        if "[FINAL_DECISION]" in line:
            in_final = True
            continue
        if in_final:
            if re.search(r"\*\*Rating\*\*:\s*HOLD", line, re.IGNORECASE):
                found = True
                break
            # Stop at next marker
            if re.match(r"\[[A-Z_]+\]", line):
                break
    assert found, "**Rating**: HOLD not found in FINAL_DECISION section"


def _detect_verdict(lines):
    """Python port of detectVerdict() from frontend/lib/utils.ts."""
    text = " ".join(lines).upper()
    if "STRONG BUY" in text:
        return "STRONG BUY"
    if "STRONG SELL" in text:
        return "STRONG SELL"
    if "OVERWEIGHT" in text:
        return "OVERWEIGHT"
    if "UNDERWEIGHT" in text:
        return "UNDERWEIGHT"
    if "BUY" in text:
        return "BUY"
    if "SELL" in text:
        return "SELL"
    if "HOLD" in text:
        return "HOLD"
    return "—"


def test_verdict_detection_identifies_hold():
    """Test 6: verdict detection correctly identifies HOLD from fake output."""
    result = _run_fake()
    lines = result.stdout.splitlines()
    # Collect lines that belong to the FINAL_DECISION section
    final_lines = []
    in_final = False
    for line in lines:
        if "[FINAL_DECISION]" in line:
            in_final = True
            continue
        if in_final:
            if re.match(r"\[[A-Z_]+\]", line):
                break
            final_lines.append(line)
    verdict = _detect_verdict(final_lines)
    assert verdict == "HOLD", f"Expected HOLD, got {verdict!r}"


def test_exit_zero_produces_complete_marker():
    """Test 7: script exits 0 and [COMPLETE] is present in output."""
    result = _run_fake()
    assert result.returncode == 0, f"Expected exit 0, got {result.returncode}"
    assert "[COMPLETE]" in result.stdout, "[COMPLETE] marker not found in output"


def test_exit_nonzero_on_fail_flag():
    """Test 8: --fail flag causes non-zero exit and no [COMPLETE] marker."""
    result = _run_fake(extra_args=["--fail"])
    assert result.returncode != 0, "Expected non-zero exit with --fail flag"
    assert "[COMPLETE]" not in result.stdout, "[COMPLETE] should not appear on failed run"
    assert "[ERROR]" in result.stdout, "[ERROR] marker expected on failed run"
