# StudyFlow — Packaging / Build Guide

This document explains how to produce the **Android APK** (installable on Android tablets / phones)
and the **desktop client** (Linux AppImage / Windows installer / macOS DMG) from the same web UI source in `/workspace/index.html`.

```
/workspace
├── index.html                       # Original web source (single-file SPA)
└── build/
    ├── share/                       # Offline-ready snapshot used by BOTH wrappers
    │   ├── index.html               # same source, external CDN scripts → vendored locally
    │   └── vendor/
    │       ├── qrcode.min.js        # vendored from jsdelivr (no CDN calls needed inside app)
    │       └── jsQR.js              # vendored from jsdelivr
    ├── android-cordova/             # Android APK project (Cordova)
    │   ├── build-apk.sh             # **ONE-SHOT BUILD SCRIPT** (recommended)
    │   ├── scripts/
    │   │   ├── setup-android-sdk.py # auto-installs Android SDK + accepts licenses
    │   │   └── sync-web-assets.js
    │   ├── config.xml               (minSdk 24 / targetSdk 34 / landscape / WAKE_LOCK / CAMERA for QR)
    │   └── package.json
    └── desktop-electron/            # Desktop client project (Electron)
        ├── build-desktop.sh         # **ONE-SHOT BUILD SCRIPT**
        ├── main.js                  (Electron window: 1280×800 tablet shape)
        ├── preload.js
        └── package.json
```

---

## Prerequisites (both targets)

| What | Min version |
|---|---|
| Node.js | ≥ 18 |
| npm   | ≥ 9 |
| Java JDK (Android only) | ≥ JDK 17, preferably JDK 21 |

Everything else is fetched by the scripts below (Android SDK, Gradle, Cordova CLI, Electron + electron-builder).

---

## Part A — Build Android APK (Cordova)

The build script **does not require** Android Studio installed. It downloads the Android command-line tools for you into `build/android-cordova/tools/android-sdk`.

```bash
# (on Linux or macOS/WSL)
cd /workspace
bash build/android-cordova/build-apk.sh
```

When it finishes, copy the APK to your tablet:

```
/workspace/build/artifacts/studyflow-debug.apk
```

Install it:

```bash
# via USB
adb install -r build/artifacts/studyflow-debug.apk

# or (on-device) download the APK file via email/SMB/SFTP and "open" to install
```

### Android build notes

- **Orientation** is locked to **landscape** (default view of the brutalist layout). For tablets ≥ 10" this matches the 1280×800 canvas.
- **Permissions declared**: `WAKE_LOCK` (keeps screen on during Pomodoro), `MODIFY_AUDIO_SETTINGS` (sound cues), `CAMERA` (QR sync scanner).
- **minSdk 24** (Android 7.0+) covers essentially 100% of Android tablets still in use today.
- First build takes ~3–6 minutes to download artifacts; later builds reuse Gradle cache.

---

## Part B — Build Desktop Client (Electron)

```bash
cd /workspace
bash build/desktop-electron/build-desktop.sh
```

### Outputs

| Platform | Command | Output format |
|---|---|---|
| Linux (recommended) | `bash build-desktop.sh` already does this | AppImage + tar.gz in `build/desktop-electron/dist/` |
| Windows | `cd build/desktop-electron; npm run dist:win` | NSIS `.exe` installer |
| macOS | `cd build/desktop-electron; npm run dist:mac` | `.dmg` (must run on a Mac to notarize properly) |

### Linux Quick-Run without installer

```bash
cd /workspace/build/desktop-electron
npm start
```

The window opens at **1280×800** (the exact Android tablet canvas) with a black background so the brutalist layout is identical.

---

## If your network has GitHub / Google / Maven blocked

All downloads are rerouteable through environment variables.

### For Electron (downloads binaries from GitHub)

```bash
# mainland China mirror — use these BEFORE npm install
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
bash build-desktop.sh
```

### For Android (Maven / Google artifacts)

```bash
# Already handled inside build-apk.sh — when it runs setup-android-sdk.py,
# it will use Tencent / Aliyun mirrors configured by the Gradle init script at
# ~/.gradle/init.gradle that we ship. On your machine, if Google repo resolves normally,
# you don't need any mirrors at all.
```

---

## Directory snapshot map

```
/workspace/build/
├── share/                     # <- shared SPA bundle, offline-safe
│   ├── index.html             # (CDN <script> tags replaced with local vendor scripts)
│   └── vendor/
│       ├── qrcode.min.js      # vendored locally
│       └── jsQR.js            # vendored locally
│
├── android-cordova/           # Android wrapper project
│   ├── config.xml             manifest + permissions + tablet tuning
│   ├── package.json           cordova@13 devDep
│   ├── scripts/
│   │   └── sync-web-assets.js copies share/ into www/ and injects <script src="cordova.js">
│   └── build-apk.sh           run this to get an APK
│
└── desktop-electron/
    ├── main.js                Electron window (1280x800, black bg, min-size, no webview navigate)
    ├── preload.js             minimal IPC bridge: sandboxed contextIsolation=true
    ├── scripts/sync-web-assets.js
    └── package.json           (electron + electron-builder config; AppImage / tar.gz build target)
```

---

## Re-running after you edit /workspace/index.html

Every build script runs `sync-web-assets.js` first — so just **edit** `/workspace/index.html`, then:

```bash
bash build/android-cordova/build-apk.sh
bash build/desktop-electron/build-desktop.sh
```

No other files need to be touched.

---

## Troubleshooting common build errors

1. **"Could not resolve io.github.g00fy2:versioncompare"**
   Your machine cannot reach Maven Central / Google Maven. Re-run with a VPN or add `~/.gradle/init.gradle` mirror rules (sample file is already in `build/android-cordova/scripts/` under the name `setup-android-sdk.py` sets them for you via the cordova init script already).

2. **"validateDistributionUrl=true failed" for Gradle wrapper**
   Use the included local Gradle zip at `build/_cache/gradle-*.zip` (the build script generates this for you and sets wrapper properties to `file://`).

3. **Electron install hangs / times out**
   Set `ELECTRON_MIRROR` to `https://npmmirror.com/mirrors/electron/` and rerun.
