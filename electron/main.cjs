// Electron main process — boots the BrowserWindow that renders the app.
// Strict security defaults: contextIsolation on, nodeIntegration off, no preload.
// The renderer is the same static HTML+JS that runs in a normal browser, just
// loaded via file:// so it works fully offline.

const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('node:path');

const isDev = !app.isPackaged;

// Single-instance lock. Two Electron processes both reading/writing the
// IndexedDB autosave can corrupt the project. If a second instance launches,
// focus the existing window instead.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}
app.on('second-instance', () => {
  const all = BrowserWindow.getAllWindows();
  if (all.length > 0) {
    if (all[0].isMinimized()) all[0].restore();
    all[0].focus();
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0e1117',
    show: false,
    autoHideMenuBar: true,
    title: 'BlockBuilder Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

  // External links open in the OS browser, not inside the Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

// macOS-friendly menu shell (Windows already hides menu via autoHideMenuBar).
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About BlockBuilder Studio',
          click: () => shell.openExternal('https://blockbuilder.studio'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  // Always start with a fresh module cache so edits to app/*.js are picked up
  // immediately during dev.
  if (isDev && session && session.defaultSession) {
    session.defaultSession.clearCache().catch(() => {});
  }
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
