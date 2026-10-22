import { app, BrowserWindow, dialog, Menu } from 'electron';
import path from 'node:path';
import { startServer, type RunningServer } from '../src/server.ts';

// A fixed port keeps the panel's remembered inputs (stored per origin) across restarts.
const PREFERRED_PORT = Number(process.env.PROXYPILOT_PORT ?? 47800);

let server: RunningServer | undefined;
let win: BrowserWindow | undefined;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  // Already running: the other instance brings its window forward (see 'second-instance').
  app.quit();
} else {
  app.setAppUserModelId('com.proxypilot.desktop');
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (quitting || !server) return;
    // Close every proxy browser properly first so their cookies and logins are saved.
    event.preventDefault();
    quitting = true;
    server.close().finally(() => app.quit());
  });
  app.whenReady().then(start, fail);
}

async function start(): Promise<void> {
  try {
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
    const dataDir = process.env.PROXYPILOT_DATA_DIR ?? path.join(app.getPath('userData'), 'data');
    server = await listen(dataDir);
    const panelUrl = server.url;

    win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      title: 'ProxyPilot',
      show: false,
      backgroundColor: '#f4f5f8',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.once('ready-to-show', () => win?.show());
    // The panel never needs popups or other sites; opening one here would bypass the proxies.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(panelUrl)) event.preventDefault();
    });
    win.on('close', confirmQuit);
    win.on('closed', () => (win = undefined));
    await win.loadURL(panelUrl);
  } catch (err) {
    fail(err);
  }
}

async function listen(dataDir: string): Promise<RunningServer> {
  try {
    return await startServer({ port: PREFERRED_PORT, dataDir });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
    return startServer({ port: 0, dataDir });
  }
}

function confirmQuit(event: Electron.Event): void {
  const open = server?.manager.openIds().length ?? 0;
  if (quitting || open === 0 || !win) return;
  const choice = dialog.showMessageBoxSync(win, {
    type: 'question',
    buttons: ['Close browsers and quit', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    title: 'Quit ProxyPilot?',
    message: `${open} browser window${open === 1 ? ' is' : 's are'} still open.`,
    detail: 'Quitting closes them all. Their cookies and logins are saved.',
  });
  if (choice === 1) event.preventDefault();
}

function fail(err: unknown): void {
  dialog.showErrorBox('ProxyPilot could not start', err instanceof Error ? err.message : String(err));
  quitting = true;
  app.exit(1);
}
