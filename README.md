# StudyFlow

A brutalist, black & white focus & study time tracker. Pomodoro timer,
month heatmap, and multi-device sync — 100% offline-first.

Designed after the [9to5studio.it](https://9to5studio.it) specification:
Swiss International typography, Brutalist architecture, Minimal Gallery
aesthetic. Strict two-tone contrast, square corners, no shadows, structure
built from whitespace and type.

---

## Features

### Pomodoro Timer
- Geometric block-style numerals with an industrial display feel.
- Multi-layer concentric progress ring (depth without shadows).
- Cycle indicator showing progress through the configured cycle count.
- Crisp synthesized start/end sound cues (Web Audio API — no audio files).
- Configurable focus/rest durations, cycle count, and "skip last rest".
- **Real-time stats** — "Focus Today" and "Total Hours" update live while a
  session runs, not only after it completes.
- **Interrupted sessions are saved** — if you Reset mid-session, any focused
  time ≥1 min is recorded as a `partial` session and counts toward your totals.

### Month Heatmap
- 7-column calendar grid showing one month at a time, with day numbers in
  each cell.
- Switch months with the month/year dropdowns or the `‹` / `›` arrows.
- Streak and contribution statistics scoped to the selected month.
- Click any day to open a detail modal of that day's sessions.

### Sync
- Share a sync key across devices to pair them.
- Export/import sync codes for one-off transfers.
- QR-code sync: generate a QR on one device and scan it with another.
- All data is stored locally (localStorage) and never uploaded.

---

## Downloads

Pre-built, ready-to-use binaries are published on the
[Releases page](https://github.com/sharkshot/StudyFlow/releases).
No build step required — just download and run.

| Platform | File | Notes |
| --- | --- | --- |
| Windows (x64) | `StudyFlow-1.0.0-win-x64-portable.zip` | Extract and run `StudyFlow.exe` |
| Linux (x64) | `StudyFlow-1.0.0-linux-x64.tar.gz` | Extract and run the bundled launcher |
| Android — Phone | `studyflow-debug.apk` | Portrait-locked, phone layout |
| Android — Tablet | `studyflow-tablet.apk` | Landscape-locked, tablet layout |

---

## Navigation

### Desktop / Tablet
- Click the vertical **MENU** rail on the left to open the menu panel.
- The panel shows three sections together: **Navigation**, **Information**,
  and **Shortcuts**.

### Phone (portrait)
- A fixed **bottom bar** with five tabs: `Focus · Heat · Sync · QR · Info`.
- The active tab is marked with a yellow dot.
- The `Info` tab opens a bottom sheet with app information and shortcuts.

### Keyboard Shortcuts
- `Space` — Start / Pause the timer
- `Esc` — Close any open dialog or panel

---

## Design System

| Token | Value |
| --- | --- |
| Black | `#000000` |
| White | `#FFFFFF` |
| Accent (active) | `#FCFF0D` |
| Accent (alt) | `#CD4A85` |
| Type | Helvetica Neue / Inter / Arial |
| Corners | Square (0px) — pills and circles only where needed |
| Shadows | None — depth from contrast and spacing |

Typography scale (desktop): nav 28px, heading 24px, label 11px, body 13px.
Navigation and labels use UPPERCASE with wide letter-spacing; headings use
tight tracking. All numerals use tabular figures.

---

## Project Structure

```
build/
├── share/                  # Shared web app source (single index.html)
│   ├── index.html          # The whole app — HTML, CSS, JS in one file
│   └── vendor/             # qrcode.min.js, jsQR.js (offline libs)
├── android-cordova/        # Cordova project for Android APKs
│   ├── www/                # Synced from share/ at build time
│   ├── config.xml
│   └── build-apk.sh
├── desktop-electron/       # Electron project for desktop builds
│   ├── app-web/            # Synced from share/ at build time
│   ├── main.js
│   └── package.json
└── artifacts/              # Pre-built release binaries
```

The single source of truth for the UI is
[`build/share/index.html`](build/share/index.html). The Cordova and Electron
projects each run a `sync-web-assets.js` script that copies this file (plus
the `vendor/` directory) into their respective `www/` and `app-web/` folders,
so all platforms ship an identical web app.

---

## Building From Source

The web app is a single static HTML file — open
[`build/share/index.html`](build/share/index.html) in any browser to run it.

For packaged builds, see the project-specific scripts:

- **Android APK**: `cd build/android-cordova && bash build-apk.sh`
- **Desktop (Electron)**: `cd build/desktop-electron && npm run dist` (Linux),
  `npm run dist:win` (Windows), or `npm run dist:mac` (macOS)

Pre-built binaries are already provided in
[`build/artifacts/`](build/artifacts/) and on the
[Releases page](https://github.com/sharkshot/StudyFlow/releases).

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

## License

Source is provided as-is for personal use. Design inspired by
[9to5studio.it](https://9to5studio.it).
