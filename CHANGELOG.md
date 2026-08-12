# Changelog

All notable changes to **StudyFlow** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
