#!/bin/bash
cd "$(dirname "$0")/frontend"
npm run dev -- -H 0.0.0.0 -p 3000
