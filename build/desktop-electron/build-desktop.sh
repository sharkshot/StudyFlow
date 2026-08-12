#!/usr/bin/env bash
# ============================================================
# One-shot script to build the StudyFlow desktop client.
#
# Outputs (in build/desktop-electron/dist/):
#   Linux:   StudyFlow-<version>.AppImage + .tar.gz
#   Windows (cross-build not recommended; use a Windows host):
#            npm run dist:win
#   macOS (requires macOS host for notarization compat):
#            npm run dist:mac
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Mirror selection: if user is in a network that blocks GitHub releases,
# export these before running the script. We set defaults to mirror urls.
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"

echo "[1/3] npm install (cordova-free, desktop only)..."
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi

echo "[2/3] sync web assets..."
node scripts/sync-web-assets.js

echo "[3/3] electron-builder --linux x64 (AppImage + tar.gz)..."
npm run dist -- --linux --x64

echo
echo "================================================================"
echo "OK BUILD SUCCESS — desktop artifacts in:"
echo "  $ROOT/dist/"
ls -lh "$ROOT"/dist/ 2>/dev/null || true
echo
echo "Run (unpacked) immediately:  npm start"
echo "================================================================"
