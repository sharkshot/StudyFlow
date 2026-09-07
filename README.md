# StudyFlow

A brutalist, black & white **cross-platform study management system**. Pomodoro
timer, month heatmap, multi-device cloud sync, encrypted peer-to-peer sync, and
community group supervision — with a Swiss/Brutalist design language.

Designed after the [9to5studio.it](https://9to5studio.it) specification:
Swiss International typography, Brutalist architecture, Minimal Gallery
aesthetic. Strict two-tone contrast, square corners, no shadows, structure
built from whitespace and type.

> **v3.0** introduces a backend server (Node.js + Express + MySQL) that powers
> multi-device accounts, cloud sync, and communities. An SQLite fallback lets
> the server run without MySQL installed.

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
- **Anti-kill wall-clock countdown** — the timer is anchored to an absolute
  end timestamp, so background throttling and device sleep never slow it.
- **State persistence + restore** — reload the page, kill the tab, or swipe
  the Android app away; the running timer is restored automatically on next
  launch and continues from the exact remaining time.

### Month Heatmap
- 7-column calendar grid showing one month at a time, with day numbers in
  each cell.
- Switch months with the month/year dropdowns or the `‹` / `›` arrows.
- Streak and contribution statistics scoped to the selected month.
- Click any day to open a detail modal of that day's sessions.

### Multi-Device Accounts & Cloud Sync
- Register with a username and password; log in on any device.
- **Dual-mode sync:** online sessions sync to the cloud database; offline
  sessions are queued locally and auto-uploaded when the network returns.
- Conflict resolution uses last-write-wins (by `updated_at`) with tombstone
  deletes, so data is never silently lost.
- An auto-sync loop runs every 30 seconds; a manual "Sync Now" button is in
  the Sync and Account views.
- The Sync view shows the online/offline status, last sync time, and a
  **Pending Upload** counter for the offline queue.

### QR-Code Login
- On a logged-in device, open **Account → Generate QR** to create a one-time
  login QR (valid 5 minutes).
- Scan (or paste) the token on a new device to sign into the same account
  instantly.

### Encrypted Peer-to-Peer Sync
- For two devices that are both offline, pair them with a shared sync key.
- Generate an AES-256-GCM encrypted sync code (or QR) on one device and
  import/scan it on the other.
- The key is derived via PBKDF2 (100k iterations). Legacy plaintext codes
  (`STUDY1:`) are still accepted.

### Community Supervision
- Create a study community and share its invite code.
- Members propose study standards (title + target daily minutes).
- A proposal **passes when more than 50% of members vote "for"** (majority
  rule) and becomes the community's active standard.

---

## Quick Start (Backend)

The backend serves the frontend and provides the API.

```bash
cd server
npm install
node src/server.js
```

The server runs on `http://localhost:3000` and serves the web app at `/`.

### Database
- **Primary:** MySQL. Configure via env vars:
  `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`.
  Apply the schema with `mysql -u root -p < sql/schema.sql`.
- **Fallback:** If MySQL is unreachable, the server automatically uses a local
  SQLite database (`server/data.sqlite`) — no setup required.

### Environment Variables
| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP server port |
| `JWT_SECRET` | `studyflow-dev-secret-change-me` | JWT signing secret (set in production) |
| `MYSQL_HOST` | `localhost` | MySQL host |
| `MYSQL_PORT` | `3306` | MySQL port |
| `MYSQL_USER` | `root` | MySQL user |
| `MYSQL_PASSWORD` | *(empty)* | MySQL password |
| `MYSQL_DATABASE` | `studyflow` | MySQL database name |

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
studyflow/
├── server/                 # Backend (Node.js + Express)
│   ├── src/
│   │   ├── server.js       # Express entry point — serves frontend + API
│   │   ├── db.js           # MySQL (primary) + SQLite (fallback) layer
│   │   ├── auth.js         # Register / password-login / QR-login / JWT
│   │   ├── sync.js         # Pull/push with last-write-wins conflict resolution
│   │   └── community.js    # Communities, proposals, majority voting
│   ├── sql/schema.sql      # MySQL schema
│   └── package.json
├── build/
│   ├── share/              # Shared web app source (single index.html)
│   │   ├── index.html      # The whole app — HTML, CSS, JS in one file
│   │   └── vendor/         # qrcode.min.js, jsQR.js (offline libs)
│   ├── android-cordova/    # Cordova project for Android APKs
│   │   ├── www/            # Synced from share/ at build time
│   │   ├── config.xml
│   │   └── build-apk.sh
│   ├── desktop-electron/   # Electron project for desktop builds
│   │   ├── app-web/        # Synced from share/ at build time
│   │   ├── main.js
│   │   └── package.json
│   └── artifacts/          # Pre-built release binaries
├── CHANGELOG.md
└── README.md
```

The single source of truth for the UI is
[`build/share/index.html`](build/share/index.html). The Cordova and Electron
projects each run a `sync-web-assets.js` script that copies this file (plus
the `vendor/` directory) into their respective `www/` and `app-web/` folders,
so all platforms ship an identical web app.

> **Note for packaged builds:** Desktop and Android builds point at
> `http://localhost:3000` for the API by default. To use a remote server,
> set `window.STUDYFLOW_API = 'https://your-server.com'` before the app
> loads (e.g. via the Electron preload script or a Cordova config hook).

---

## Building From Source

### Run the full stack (web + API)
```bash
cd server && npm install && node src/server.js
# open http://localhost:3000
```

### Web app only (no backend)
Open [`build/share/index.html`](build/share/index.html) in a browser. Local
features (Pomodoro, heatmap, encrypted P2P sync) work without the server;
cloud sync, accounts, and communities require the backend.

### Packaged builds
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
