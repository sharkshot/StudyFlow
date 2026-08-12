// Syncs the shared web assets (/workspace/build/share) into the Cordova www/ folder
// so both Cordova + Electron always get the same snapshot.
// Run: `node scripts/sync-web-assets.js`
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHARE = path.resolve(ROOT, '..', 'share');
const WWW = path.join(ROOT, 'www');

function rmtree(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}
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

rmtree(WWW);
mkdirp(WWW);

if (!fs.existsSync(SHARE)) {
  console.error('[sync-web-assets] missing share dir at:', SHARE);
  process.exit(1);
}

// index.html + vendor dir
fs.copyFileSync(path.join(SHARE, 'index.html'), path.join(WWW, 'index.html'));
if (fs.existsSync(path.join(SHARE, 'vendor'))) {
  copyDir(path.join(SHARE, 'vendor'), path.join(WWW, 'vendor'));
}

// Patch: Cordova needs cordova.js injected + a tiny bridge to keep screen on
let html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
const cordovaTag = '<script src="cordova.js"></script>';
if (!html.includes(cordovaTag)) {
  html = html.replace(/<head>/, `<head>\n    ${cordovaTag}`);
}
// Small Android-only fixes: keep awake during focus, force landscape, hide tap highlight
const androidPatch = `
    <style id="_cordova_android_tweaks">
      html,body { -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; }
      input,textarea { -webkit-user-select: text; user-select: text; }
      html, body { overscroll-behavior: none; }
    </style>
    <script>
      // Cordova on-device ready — keep screen awake and unlock AudioContext via gesture
      document.addEventListener('deviceready', function () {
        try {
          if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
            cordova.plugins.backgroundMode.enable();
          }
        } catch (e) {}
        // Prime AudioContext on first tap (Android 9+ blocks autoplay)
        var prime = function () {
          try {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (AC) {
              var c = new AC();
              var o = c.createOscillator(); var g = c.createGain();
              o.connect(g); g.connect(c.destination); g.gain.value = 0.0001;
              o.start(); o.stop(c.currentTime + 0.01);
            }
          } catch (e) {}
          window.removeEventListener('pointerdown', prime, { passive: true });
        };
        window.addEventListener('pointerdown', prime, { passive: true });
      }, false);
    </script>
`;
if (!html.includes('_cordova_android_tweaks')) {
  html = html.replace(/<\/head>/, `${androidPatch}\n    </head>`);
}
fs.writeFileSync(path.join(WWW, 'index.html'), html);

console.log('[sync-web-assets] ok ->', WWW);
