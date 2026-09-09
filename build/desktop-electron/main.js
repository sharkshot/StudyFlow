// Electron main process for StudyFlow
// Designed to mimic the 1280x800 Android tablet (landscape) canvas.
//
// Also starts the StudyFlow backend server in-process so the desktop build
// is self-contained: double-click the installer, get a working Pomodoro +
// multi-device sync app, no separate server setup needed. The server runs
// on http://localhost:3000 and writes its SQLite file to Electron's
// userData dir (writable across versions), with a stable JWT signing
// secret persisted next to it so tokens survive restarts.
const { app, BrowserWindow, screen, Menu, shell, nativeTheme, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

nativeTheme.themeSource = 'dark';

const DEV = process.env.SF_DEV === '1';

// Persistent JWT signing secret for the bundled server. Generated on first
// launch and stored in userData so existing login tokens keep working after
// the app restarts.
function getJwtSecret() {
  const userData = app.getPath('userData');
  const secretFile = path.join(userData, 'jwt-secret.key');
  try {
    return fs.readFileSync(secretFile, 'utf8').trim();
  } catch {
    fs.mkdirSync(userData, { recursive: true });
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
    return secret;
  }
}

function createWindow() {
  const disp = screen.getPrimaryDisplay().workAreaSize;
  const W = Math.min(1280, disp.width - 40);
  const H = Math.min(800,  disp.height - 40);

  const win = new BrowserWindow({
    width: W,
    height: H,
    minWidth: 800,
    minHeight: 540,
    backgroundColor: '#000000',
    title: 'StudyFlow',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,     // keep timer accurate when window in background
      autoplayPolicy: 'no-user-gesture-required', // allow audio cues immediately
      spellcheck: false,
    }
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools', label: DEV ? 'DevTools' : 'DevTools (hidden)' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' }
  ]);
  Menu.setApplicationMenu(menu);

  win.once('ready-to-show', () => win.show());

  // External links -> open in OS default browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const index = path.join(__dirname, 'app-web', 'index.html');
  if (DEV) {
    win.loadURL(process.env.SF_DEV_URL || `file://${index}`);
  } else {
    win.loadFile(index);
  }
}

app.whenReady().then(async () => {
  // Point the bundled server at a writable directory and give it a stable
  // signing secret BEFORE we load it (server.js reads both at module init).
  process.env.SF_DATA_DIR = app.getPath('userData');
  process.env.JWT_SECRET = getJwtSecret();

  let serverModule;
  try {
    serverModule = require('./server/src/server');
  } catch (e) {
    console.error('[StudyFlow] Failed to load bundled server:', e);
    app.quit();
    return;
  }
  try {
    await serverModule.start();
  } catch (e) {
    console.error('[StudyFlow] Bundled server failed to start:', e);
    app.quit();
    return;
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Optional IPC: allow the web app to query "am I desktop?" if desired later.
ipcMain.handle('env:platform', () => process.platform);