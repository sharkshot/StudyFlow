#!/usr/bin/env bash
# ============================================================
# One-shot script to build the StudyFlow Android APK.
# Run:  bash build-apk.sh          (from build/android-cordova dir)
# Or:   bash /workspace/build/android-cordova/build-apk.sh
#
# Output APK:  /workspace/build/artifacts/studyflow-debug.apk
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

export JAVA_HOME="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(which java)")")")}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ROOT/tools/android-sdk}"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

# (1) Install Android SDK cmdline-tools + accept licenses + install platforms/build-tools
#     (Idempotent: skips what is already present)
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "[1/5] Install Android SDK components..."
  python3 "$ROOT/scripts/setup-android-sdk.py"
fi

# (2) Install Cordova CLI & npm deps (idempotent)
if [ ! -d "node_modules" ]; then
  echo "[2/5] npm install..."
  npm install --no-audit --no-fund
fi

# (3) Add android platform if missing (idempotent)
if [ ! -d "platforms/android" ]; then
  echo "[3/5] cordova platform add android..."
  npx --no-install cordova platform add android@13.0.0 --no-interactive
fi

# (4) Sync web assets (vendor qrcode/jsQR + offline index.html)
echo "[4/5] sync web assets..."
node scripts/sync-web-assets.js

# (5) Build APK
echo "[5/5] cordova build android --debug..."
npx --no-install cordova build android --debug --no-interactive

# Collect artifacts
mkdir -p /workspace/build/artifacts
APK_SRC="$(find platforms/android/app/build/outputs/apk/debug -type f -name "*.apk" | head -n 1)"
if [ -z "$APK_SRC" ]; then
  APK_SRC="$(find platforms/android/app/build/outputs/apk -type f -name "*.apk" | head -n 1)"
fi
if [ -z "$APK_SRC" ]; then
  echo "ERROR: no .apk found after build!" >&2; exit 3
fi
APK_DST="/workspace/build/artifacts/studyflow-debug.apk"
cp "$APK_SRC" "$APK_DST"

echo
echo "================================================================"
echo "OK BUILD SUCCESS"
echo "  APK => $APK_DST    ($(du -h "$APK_DST" | cut -f1))"
echo "Install to connected tablet via:  adb install -r $APK_DST"
echo "================================================================"
