#!/bin/bash
set -e

echo "=== tradingagents-idx installer ==="

# Check Python
echo "[1/6] Checking Python..."
if ! command -v conda &> /dev/null; then
  echo "conda not found. Please install Miniconda first:"
  echo "  https://docs.conda.io/en/latest/miniconda.html"
  exit 1
fi

# Create conda env
echo "[2/6] Creating conda environment..."
conda create -n tradingagents python=3.13 -y

# Install Python deps
echo "[3/6] Installing Python dependencies..."
conda run -n tradingagents pip install -e .

# Setup .env
echo "[4/6] Setting up .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
  echo "Please edit .env and add your API keys:"
  echo "  - OPENROUTER_API_KEY"
  echo "  - ALPHA_VANTAGE_API_KEY"
else
  echo ".env already exists, skipping"
fi

# Setup frontend
echo "[5/6] Installing frontend dependencies..."
cd frontend
npm install

# Setup frontend .env.local
if [ ! -f .env.local ]; then
  SECRET=$(openssl rand -base64 32)
  echo "DASHBOARD_SECRET=$SECRET" > .env.local
  echo "NEXT_PUBLIC_DASHBOARD_SECRET=$SECRET" >> .env.local
  echo "Created frontend/.env.local with random secret"
else
  echo "frontend/.env.local already exists, skipping"
fi

cd ..

echo ""
echo "=== Installation complete! ==="
echo ""
echo "Next steps:"
echo "1. Edit .env and add your API keys"
echo "2. Run: cd frontend && npm run dev -- -H 0.0.0.0 -p 3000"
echo "3. Open: http://localhost:3000"
echo ""
echo "For VPS + Tailscale access:"
echo "  npm run dev -- -H 0.0.0.0 -p 3000"
echo "  Access via: http://<tailscale-ip>:3000"
