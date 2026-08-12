// Sync web assets from /workspace/build/share into desktop-electron/app-web/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHARE = path.resolve(ROOT, '..', 'share');
const DST = path.join(ROOT, 'app-web');

function rmtree(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function copyDir(src, dst) {
  mkdirp(dst);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

rmtree(DST); mkdirp(DST);

if (!fs.existsSync(SHARE)) {
  console.error('[sync-web-assets] missing share dir at:', SHARE);
  process.exit(1);
}

fs.copyFileSync(path.join(SHARE, 'index.html'), path.join(DST, 'index.html'));
if (fs.existsSync(path.join(SHARE, 'vendor'))) {
  copyDir(path.join(SHARE, 'vendor'), path.join(DST, 'vendor'));
}

// Desktop-only tuning: add small desktop banner? No — brutalist rule: keep minimal.
// Only add: disable double-tap zoom by telling Electron the viewport is "device-width" (we do),
// plus: if user resizes window, timer numbers clamp fluidly (already handled in CSS).
console.log('[sync-web-assets] ok ->', DST);
