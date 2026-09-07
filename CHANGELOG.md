# Changelog

All notable changes to **StudyFlow** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v3.10.0] — 2026-09-07

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
