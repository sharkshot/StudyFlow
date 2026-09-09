# Changelog

All notable changes to **StudyFlow** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v3.22.1] — 2026-09-09

Self-contained desktop build and SQLite fallback for restricted environments.

### Added

- **Self-contained desktop installers.** `build/desktop-electron/main.js`
  now starts the StudyFlow backend server in-process inside the Electron
  main process — no extra `node` binary, no manual `localhost:3000` setup
  by the user. Double-click the `.exe` / `.AppImage` / `.dmg` and the app
  is immediately ready for register / log in and cloud sync.
- **`node:sqlite` fallback.** `server/src/db.js` falls back to Node 22's
  built-in `node:sqlite` (experimental) when the `better-sqlite3` native
  binding can't be loaded — e.g. when the GitHub prebuild download is
  blocked and no local `node-gyp` is available. Lets the server run on
  any Node 22+ machine with no native build tools.
- **`SF_DATA_DIR` env var.** `server/src/db.js` respects `SF_DATA_DIR` for
  the SQLite file location, so the bundled desktop app writes to Electron's
  writable `userData` directory instead of the asar's read-only filesystem.

### Changed

- Desktop CI jobs (`build.yml`) copy `server/` into `build/desktop-electron/`
  and install its dependencies. The electron-builder `files` array now
  includes `server/**` with `better-sqlite3`'s native `.node` unpacked.
- Version bumped to **3.22.1** across `server/`, `build/android-cordova/`
  (package + `config.xml`) and `build/desktop-electron/`.

## [v3.22.0] — 2026-09-09

Security and community-lifecycle release, plus automated packaging.

### Added

- **Brute-force protection on auth endpoints.** A zero-dependency in-memory
  rate limiter (`server/src/ratelimit.js`): registration is capped at 5 accounts
  per IP per hour; password login allows 20 attempts per 15 minutes (only
  failures count) and locks an account+IP pair for 15 minutes after 5 wrong
  passwords. Every `/api` route also has a baseline 600-request / 15-minute
  ceiling (`RATE_LIMIT_MAX` to tune).
- **Community lifecycle endpoints.**
  - `DELETE /api/community/:id/leave` — a member leaves a community (the owner
    must dissolve instead).
  - `POST /api/community/:id/kick` — the owner removes another member; the
    removed member's votes are purged so tallies stay accurate.
  - `DELETE /api/community/:id` — the owner dissolves a community; proposals,
    votes and memberships are deleted atomically inside a transaction.
- **Automated packaging.** `.github/workflows/build.yml` builds the Android
  debug APK and the Linux / Windows / macOS desktop installers on every `v*`
  tag push and attaches them to the release.

### Changed

- Version bumped to **3.22.0** across `server/`, `build/android-cordova/`
  (package + `config.xml`) and `build/desktop-electron/`.

## [v3.21.0] — 2026-09-09

Correctness and reliability release. Fixes a MySQL transaction bug that could
leave `/api/sync/push` partially written, makes proposal expiry actually take
effect, and fixes QR scanning doing nothing at all on phone and tablet.

### Fixed

- **MySQL transactions now pin a single connection.** `db.begin()` previously
  issued `pool.query('START TRANSACTION')`, but a connection pool may hand a
  different connection to each subsequent query — so the statements in
  `/api/sync/push` were never really in one transaction, and a mid-batch
  failure could leave a partially merged dataset that `rollback()` could not
  undo. `begin()` now acquires a dedicated connection (`pool.getConnection()`
  + `beginTransaction()`) that all queries reuse until `commit()`/`rollback()`,
  which also releases it. A new `db.transaction(fn)` helper wraps the
  commit/rollback/error-propagation dance.
- **Proposal expiry is enforced.** `expires_at` was written but never read, so a
  proposal from 7 days ago could still be voted on. `expireStaleProposals()`
  now runs before listing and before voting: proposals past their window are
  closed as `passed` (if a majority voted for) or `expired`, and voting on a
  non-active proposal reports its actual status.
- **QR scan is fixed on phone and tablet.** Tapping *Start Camera* did nothing
  because the Cordova project declared `CAMERA` in the manifest but never
  requested the Android **runtime** permission — `getUserMedia` rejected
  instantly with `NotAllowedError` and no system dialog ever appeared. See
  `docs/P2P-DATA-MERGE.md` §4.1 for the full analysis. Changes:
  - `ensureCameraReady()` runs before `getUserMedia`: detects a missing camera
    API (and reports "needs HTTPS" when `isSecureContext` is false) and, when
    `cordova-plugin-android-permissions` is present, checks and requests the
    runtime permission first.
  - `describeCameraError()` maps `NotAllowedError` / `NotFoundError` /
    `NotReadableError` / `OverconstrainedError` to actionable messages instead
    of surfacing a raw `TypeError`.
  - Camera failures now render an inline explanation plus a **Paste sync code
    instead** button, so P2P sync still completes without a camera.
  - `startQrScanner()` clears stale state with `stopQrCamera()` first — a stuck
    `qrScanning` flag made every later tap a silent no-op.
  - `video.play()` rejections are caught, with a 1.5s safety kick for WebViews
    that never fire `loadedmetadata` (previously stuck on "Scanning").
  - `facingMode` is now a soft `{ ideal: 'environment' }` constraint.
- **`POST /api/sync/push` no longer returns the user's entire history.** It
  echoed every session row back on every push; it now returns only the rows
  touched by that push, plus an `applied` count. Payloads over 5000 sessions
  are rejected with `413`.

### Security

- **The server refuses to start in production with the default JWT secret.**
  `NODE_ENV=production` with `JWT_SECRET` unset or left at
  `studyflow-dev-secret-change-me` is now a fatal startup error; otherwise it
  logs a warning.
- **SQLite fallback can be disabled.** `DB_STRICT=1` makes an unreachable MySQL
  a hard failure instead of silently writing to a local `data.sqlite` (which
  risks splitting data across two databases). Defaults to strict when
  `NODE_ENV=production`.

### Changed

- `build/android-cordova/package.json` now declares
  `cordova-plugin-android-permissions`; `npm run build:apk` restores it
  automatically via `npm run plugins:restore`.

## [v3.20.0] — 2026-09-07

Performance and reliability focused release. The P2P sync module is retained
alongside the cloud dual-mode sync; the heatmap rendering and the Pomodoro
timer are hardened.

### Added

- **Timer anti-kill (wall-clock countdown).** The countdown is now anchored to
  an absolute end timestamp (`endAt`) instead of decrementing once per
  `setInterval` tick. Background-tab throttling, device sleep, or a slow
  renderer can no longer slow the timer — the remaining time is always
  recomputed from `Date.now()`.
- **Timer state persistence + restore.** The running timer is snapshotted to
  `localStorage` every tick. If the page is reloaded, the tab killed, or the
  Android app swiped away, the timer is automatically restored on next launch
  ("Timer restored" toast) and continues from the exact remaining time — even
  if the deadline already passed while the app was dead, in which case the
  completion logic fires correctly.
- **Foreground correction.** `visibilitychange` / `focus` / `pageshow`
  (bfcache) listeners immediately recompute and repaint the countdown the
  moment the app returns to the foreground.
- **Sync view (cloud focus).** A new Cloud Sync section shows the signed-in
  account, online/offline status, last sync time, device ID, and a
  **Sync Now** button. The Data Overview now includes a **Pending Upload**
  counter for the offline queue.

### Changed

- **Incremental sync queue.** Sessions are enqueued for cloud upload only at
  their mutation points (complete, partial-save, delete) instead of re-queuing
  the entire dataset on every save — keeping the pending queue small and
  pushes minimal.
- **Heatmap rendering performance.** The minutes-per-day aggregation is now
  cached and only recomputed when sessions change; calendar cells are built in
  a `DocumentFragment` and attached in a single reflow; cell clicks use one
  delegated listener instead of one per cell; month switching (`‹` `›`) is
  scheduled via `requestAnimationFrame`, so rapid taps stay smooth.
- **Unified QR camera engine.** P2P data sync (QR Sync view) and account QR
  login now share one camera loop. If the camera is unavailable (permission
  denied / desktop without camera), the QR login falls back to manual token
  entry.
- **P2P sync retained.** The offline peer-to-peer module (shared sync key,
  AES-256-GCM encrypted `STUDY2:` packets, QR/text export-import, paired
  device list) remains fully available and complements the online cloud sync.
- **QR P2P is now phone/tablet only.** Desktop builds (and touchless PC
  browsers) no longer show the QR Sync entry — the camera-to-camera flow does
  not apply there and desktop uses cloud sync exclusively. Direct
  `switchView('qr')` calls are redirected to the Sync view with a hint.
- **Chunked multi-QR transfers (STUDY3).** A single QR code caps at ~2.9KB,
  so months of records no longer fit. Exported payloads are now
  gzip-compressed (repetitive record keys shrink ~8-10x via
  `CompressionStream`) and, when still too large, split into a
  self-describing chunk sequence `STUDY3:<id>.<idx>.<total>.<slice>`. The
  generator shows a `QR 1/N` label with Prev/Next paging and a default-on
  Auto cycle (2.6s per code); the scanner runs continuously, accepts chunks
  in any order (duplicates are idempotent, 1.5s debounce), shows
  `Receiving x/N` progress, and auto-merges once the sequence is complete.
  Security is unchanged — chunks are ciphertext slices, integrity is
  verified by the AES-GCM tag at decryption time. The legacy `STUDY1:`
  insecure-context path also compresses now (via a `gz` field). Measured:
  3 months ≈ 900 sessions → 19 codes; 500 sessions that needed 95
  uncompressed codes now take 12.
- **P2P merge engine rewrite.** Importing a sync code now runs a validated,
  tombstone-aware, last-write-wins merge: records are sanitised and clamped
  before entering the dataset; same-id records are overwritten only when the
  remote `updated_at` is newer; deleted sessions propagate via a 90-day
  tombstone registry (`STUDY2:` payload v3 carries `tombstones`), so deleted
  sessions can no longer be resurrected by an old peer snapshot; merged rows
  fan out to the cloud upload queue so the result reaches the server when
  either device comes back online. A rolling pre-merge backup is kept in
  `studyflow_p2p_backup_v1`, and the import toast reports a full summary
  (added / updated / removed / skipped). See `docs/P2P-DATA-MERGE.md` for the
  technical specification.

## [v3.0.0] — 2026-09-07

A full-architecture rewrite that turns StudyFlow into a cross-platform,
cloud-synced study management system with multi-device accounts, dual-mode
data sync, encrypted peer-to-peer sync, and community group supervision.

### Added

- **Multi-device account system.** A new backend server (`server/`) built on
  Node.js + Express with a MySQL primary database (SQLite fallback for
  single-machine or offline development). Users register with a username and
  password (bcrypt-hashed) and receive a JWT session token valid for 30 days.
- **QR-code login.** A logged-in device can generate a one-time QR token
  (valid 5 minutes). Scanning (or pasting) that token on a new device signs it
  into the same account instantly — no password re-entry needed.
- **Dual-mode cloud sync.** Online sessions are pushed to the cloud database;
  offline sessions are queued locally and auto-uploaded when connectivity
  returns. A pull merges cloud records into the local store using
  last-write-wins (by `updated_at`) with tombstone deletes. An auto-sync loop
  runs every 30 seconds.
- **Encrypted P2P sync.** The existing QR/text sync code is now encrypted with
  AES-256-GCM. The shared sync key is fed through PBKDF2 (100k iterations) to
  derive the AES key. The new `STUDY2:` payload format carries an IV-prefixed
  ciphertext; the legacy `STUDY1:` plaintext format is still accepted for
  backward compatibility.
- **Community supervision.** Create or join study communities via an invite
  code. Members can propose a study standard (title + target daily minutes).
  A proposal **passes when more than 50% of members vote "for"** (majority
  rule) and becomes the community's active standard. Proposals expire after
  7 days.
- **Account view.** Shows username, user ID, local device ID, a QR-login
  generator, and a manual "Sync Now" button.
- **Community view.** Lists the user's communities, supports creation, joining
  by invite code, and per-community detail (members, proposals, voting,
  current standard).

### Changed

- **Login gate.** The app now opens to a login/register screen. Local data is
  still available offline once the user has logged in at least once.
- **Navigation.** The desktop/tablet left-rail menu and the phone bottom bar
  now include `Community` and `Account` entries. The phone bottom bar is
  `Focus · Heat · Group · Sync · Menu`; the `Menu` tab opens a panel with
  account info, QR Sync, Account, and Logout.
- **Header.** The top header now shows the logged-in username and a sync
  status indicator (yellow dot = online/synced, pink dot = offline).
- **P2P sync code.** Now AES-encrypted (see above).

### Architecture

- New `server/` directory with the backend:
  - `src/server.js` — Express entry point, serves the frontend.
  - `src/db.js` — MySQL (mysql2) primary, SQLite (better-sqlite3) fallback.
  - `src/auth.js` — register / password-login / QR-login / JWT middleware.
  - `src/sync.js` — pull/push with last-write-wins conflict resolution.
  - `src/community.js` — communities, members, proposals, majority voting.
  - `sql/schema.sql` — MySQL schema.

## [v2.0.0] — 2026-08-12

A focused update that improves how the app counts focus time, reworks the
heatmap into a month calendar, and simplifies navigation across every device.

### Added
- **Real-time focus accumulation.** The "Focus Today" and "Total Hours"
  statistics now update live while a pomodoro is running — not only after the
  session completes. Elapsed minutes are counted toward the totals each second.
- **Interrupted-session recording.** When a work session is paused and Reset
  before completing, the focused time is no longer lost. Sessions of ≥1 minute
  are saved with `completed: false` and:
  - Count toward the daily and all-time totals.
  - Appear in the Today list and the date-detail modal, tagged with a pink
    `· partial` marker and dimmed styling so they're easy to distinguish from
    completed pomodoros.
- **Month-based heatmap.** The contribution heatmap is now a 7-column calendar
  grid showing a single month at a time, with day numbers 1–31 in each cell.
  Switch months with the new month selector (month + year dropdowns) or the
  `‹` / `›` arrow buttons. Streak and contribution stats are scoped to the
  selected month.
- **Bottom menu bar (phone portrait).** On phones the side rails and slide-out
  panel are replaced with a fixed bottom tab bar: `Focus · Heat · Sync · QR ·
  Info`. The active tab is marked with a yellow dot. The `Info` tab opens a
  bottom sheet with app information and keyboard shortcuts.
- **Information section in the desktop/tablet menu.** The right-hand "Info"
  rail is removed; the left-hand Menu panel now shows Navigation, Information,
  and Shortcuts sections together in a single view.

### Changed
- Main content on desktop and tablet no longer reserves padding for a removed
  right rail, giving the workspace the full right-edge width.
- The `Product` info line now reads `StudyFlow` (was `Study Time Tracker`).
- Phone-portrait layout uses full-width padding and reserves bottom space for
  the new bottom bar so content is never hidden behind it.

### Fixed
- Statistics in the Today panel and the top-right header stats not updating
  after a pomodoro completed (now refresh on every tick and on completion).
- Month/year dropdowns staying stale when `renderHeatmap(year, month)` was
  called directly — they now stay in sync with the rendered grid.

## [v1.0.0] — 2026-08-12

Initial public release.

### Added
- Brutalist black & white design following the 9to5studio.it specification:
  Swiss International / Brutalist Architecture / Minimal Gallery.
- Pomodoro focus timer with geometric block-style numerals, multi-layer
  concentric progress ring (no shadows), cycle indicator, and crisp
  synthesized start/end sound cues (Web Audio API).
- Configurable focus/rest duration and cycle count, with "skip last rest".
- Year contribution heatmap with weekday labels, month labels, and a
  Less–More legend.
- Today panel: focus minutes, pomodoro count, and a session list with
  delete.
- Multi-device sync via a shared sync key, export/import sync codes, and a
  paired-devices list.
- QR-code sync: generate a pairing QR on one device and scan it with another.
- 100% offline-first persistence via localStorage.
- Vertical rotated-text navigation rails on desktop/tablet.
- Responsive layouts for phone portrait, tablet portrait, tablet landscape,
  large 2-in-1 touch devices, and landscape phones.
- Ready-to-use pre-built binaries:
  - Windows portable (`StudyFlow-1.0.0-win-x64-portable.zip`)
  - Linux desktop (`StudyFlow-1.0.0-linux-x86_64.AppImage` / `.tar.gz`)
  - Android phone APK, portrait-locked (`studyflow-debug.apk`)
  - Android tablet APK, landscape-locked (`studyflow-tablet.apk`)
