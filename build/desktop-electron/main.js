// Electron main process for StudyFlow
// Designed to mimic the 1280x800 Android tablet (landscape) canvas.
const { app, BrowserWindow, screen, Menu, shell, nativeTheme, ipcMain } = require('electron');
const path = require('path');

nativeTheme.themeSource = 'dark';

const DEV = process.env.SF_DEV === '1';

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

app.whenReady().then(() => {
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
