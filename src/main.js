const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, Notification, dialog, session } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config.js');
const hooksInstall = require('./hooks-install.js');
const platform = require('./platform.js');
const { DIR } = require('./state-path.js');

const IS_MAC = platform.IS_MAC;

// macOS renders a very small transparent window as an opaque WHITE card (a
// compositor bug: below ~170px the window loses its transparency). The window is
// sized ~1.9x the pet, so we floor the pet size to keep the window above that
// threshold. size 100 -> 190px window was transparent in testing; 110 adds margin.
// Windows has no such bug, so it keeps the original 80px minimum.
const MIN_SIZE = IS_MAC ? 110 : config.MIN_SIZE;

const PID_FILE = path.join(DIR, 'pet.pid');
const LAUNCH_FILE = path.join(DIR, 'launch.json');

// Record how to relaunch this pet + that it's running, so the SessionStart hook
// (launch.js) can start it with Claude and skip if it's already up.
function writeRunFiles() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const argv = app.isPackaged ? [process.execPath] : [process.execPath, path.resolve(__dirname, '..')];
    fs.writeFileSync(LAUNCH_FILE, JSON.stringify({ argv }));
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch {}
}

// Where the standalone hook scripts live (bundled as extraResources when packaged).
function hooksDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'hooks') : path.join(__dirname, '..', 'hooks');
}
function toggleHooks() {
  const remove = hooksInstall.isInstalled();
  try {
    hooksInstall.run({ remove, hooksDir: hooksDir(), exe: app.isPackaged ? process.execPath : undefined });
    if (tray) tray.setContextMenu(buildMenu());
    dialog.showMessageBox({
      type: 'info',
      title: 'HAL 9000',
      message: remove ? '已停用 Claude Code 联动' : '已启用 Claude Code 联动',
      detail: remove ? 'HAL 不再跟随 Claude Code 状态。' : '请【新开一个 Claude Code 会话】后生效。',
    });
  } catch (e) {
    dialog.showErrorBox('HAL 9000', '写入 hooks 失败：' + e.message);
  }
}

// On the very first run (e.g. a fresh machine), auto-associate with Claude Code by
// installing the hooks. A marker file makes this one-time, so a later manual
// "停用联动" choice is respected on subsequent runs.
function firstRunSetup() {
  const marker = path.join(DIR, '.bootstrapped');
  try {
    if (fs.existsSync(marker)) return;
    hooksInstall.run({ remove: false, hooksDir: hooksDir(), exe: app.isPackaged ? process.execPath : undefined });
    fs.writeFileSync(marker, new Date().toISOString());
    if (tray) tray.setContextMenu(buildMenu());
    if (Notification.isSupported()) {
      new Notification({ title: 'HAL 9000', body: '已关联 Claude Code。新开一个 Claude 会话，它就会自动出现。' }).show();
    }
  } catch {}
}

let win;
let settingsWin = null;
let tray;
let locked = false;          // fully click-through (decorative) mode
let hidden = false;          // temporarily hidden (click the tray icon to bring back)
let hoverInteractive = false; // pointer is currently over HAL
let dragStart = null;
let cursorTimer = null;
let cfg = config.load();

function clampSize(s) { return Math.max(MIN_SIZE, Math.min(config.MAX_SIZE, Math.round(s))); }
// A saved size from another platform (or below the macOS floor) gets pulled into range.
if (cfg.size !== clampSize(cfg.size)) { cfg.size = clampSize(cfg.size); config.save(cfg); }
// Window is larger than HAL to leave headroom above for the speech bubble.
function winDims(size) { return { w: Math.round(size * 1.9), h: Math.round(size * 1.7) }; }
// Default bottom-right resting spot. Extra right margin (~half the pet size) so
// long subtitle bubbles don't get pushed off the right edge of the screen.
function cornerPos(w, h) {
  const area = screen.getPrimaryDisplay().workArea;
  const size = w / 1.9;
  const marginX = Math.round(size * 0.5);
  const x = Math.max(area.x, area.x + area.width - w - marginX);
  const y = area.y + area.height - h - 12;
  return { x, y };
}

function createWindow() {
  const size = clampSize(cfg.size);
  const { w, h } = winDims(size);
  const pos = cornerPos(w, h);

  win = new BrowserWindow({
    width: w, height: h,
    x: pos.x, y: pos.y,
    frame: false, transparent: true, resizable: false,
    backgroundColor: '#00000000', // fully-transparent ARGB (good practice for transparent windows)
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, autoplayPolicy: 'no-user-gesture-required' },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true }); // start passthrough; hover re-enables
  // macOS: float across every Space and over fullscreen apps (Windows ignores this).
  if (IS_MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'index.html'));
}

function applyIgnore() {
  if (!win) return;
  const ignore = locked ? true : !hoverInteractive;
  win.setIgnoreMouseEvents(ignore, { forward: true });
}

// Temporarily hide HAL; clicking the tray icon brings it back.
function setHidden(on) {
  if (!win || win.isDestroyed()) return;
  hidden = !!on;
  if (hidden) {
    win.hide();
  } else {
    win.showInactive();                          // don't steal focus
    win.setAlwaysOnTop(true, 'screen-saver');
  }
  if (tray) {
    tray.setToolTip(hidden ? 'HAL 9000（已隐藏 · 点击显示）' : 'HAL 9000');
    tray.setContextMenu(buildMenu());
  }
}

// Camera tracking: HAL's eye follows whoever/whatever moves in front of the webcam.
// Off by default and never persisted — the camera only turns on when you ask.
let cameraOn = false;
function setCamera(on) {
  cameraOn = !!on;
  if (win && !win.isDestroyed()) win.webContents.send('camera', cameraOn);
  if (tray) tray.setContextMenu(buildMenu());
}

// Resize keeping the window's bottom-right corner anchored, clamped on-screen.
function applySize(size, persist) {
  size = clampSize(size);
  cfg.size = size;
  const { w, h } = winDims(size);
  const b = win.getBounds();
  const right = b.x + b.width, bottom = b.y + b.height;
  const area = screen.getDisplayMatching(b).workArea;
  let x = Math.max(area.x, Math.min(right - w, area.x + area.width - w));
  let y = Math.max(area.y, Math.min(bottom - h, area.y + area.height - h));
  win.setBounds({ x, y, width: w, height: h });
  if (persist) config.save(cfg);
}

// The pet launches with Claude (SessionStart hook), so there's no boot auto-start.
// Clear any login item a previous version may have registered.
function clearAutoLaunch() {
  try {
    const o = { openAtLogin: false, name: 'HAL 9000' };
    if (!app.isPackaged) { o.path = process.execPath; o.args = [path.resolve(__dirname, '..')]; }
    app.setLoginItemSettings(o);
  } catch {}
}

// ---- double-click -> bring the running Claude desktop app to the foreground ----
function openClaude() {
  platform.focusClaude(__dirname);
}

// ---- quit with HAL's goodbye line (renderer says it, then signals quit-now) ----
let quitting = false;
function quitWithLine() {
  if (quitting) return;
  quitting = true;
  if (win && !win.isDestroyed()) {
    win.webContents.send('goodbye');
    setTimeout(() => app.quit(), 8000); // hard fallback if the line never finishes
  } else {
    app.quit();
  }
}

// ---- follow the Claude desktop app: when it closes, close the pet too ----
let claudeSeen = false, claudeMiss = 0, claudeTimer = null;
function checkClaude() {
  if (quitting) return;
  platform.isClaudeRunning((running) => {
    if (quitting || running == null) return; // null = couldn't tell, keep waiting
    if (running) { claudeSeen = true; claudeMiss = 0; }
    else if (claudeSeen && ++claudeMiss >= 2) { // gone for 2 checks -> Claude closed
      if (claudeTimer) { clearInterval(claudeTimer); claudeTimer = null; }
      quitWithLine();
    }
  });
}

// Render HAL's red eye as a BGRA bitmap at `S` px (Windows tray: 16; macOS menu
// bar: 18). Colored on purpose — HAL's red eye is the whole point, so we do NOT
// use a monochrome template image.
function renderEye(S) {
  const buf = Buffer.alloc(S * S * 4, 0);
  const c = (S - 1) / 2;
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4; buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = a;
  };
  const rOuter = S / 2, rGlow = S * 0.34, rPupil = S * 0.1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - c, dy = y - c, d = Math.sqrt(dx * dx + dy * dy);
    if (d <= rOuter) set(x, y, 8, 8, 8);
    if (d <= rGlow) set(x, y, 60 + (rGlow - d) * (34 * 16 / S), 12, 6);
    if (d <= rPupil) set(x, y, 255, 210, 130);
  }
  return buf;
}

function makeTrayIcon() {
  if (IS_MAC) {
    // Menu bar is ~22px tall; a 16pt icon with an @2x rep stays crisp on Retina.
    const base = nativeImage.createFromBitmap(renderEye(18), { width: 18, height: 18 });
    base.addRepresentation({ width: 18, height: 18, scaleFactor: 2, buffer: renderEye(36) });
    return base;
  }
  return nativeImage.createFromBitmap(renderEye(16), { width: 16, height: 16 });
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  const W = 300, H = 384;
  const area = screen.getPrimaryDisplay().workArea;
  // macOS: dock to the TOP-right, under the menu-bar icon.
  // Windows: dock to the bottom-right, by the pet in the tray corner.
  const x = area.x + area.width - W - 16;
  const y = IS_MAC ? area.y + 12 : area.y + area.height - H - 16;
  settingsWin = new BrowserWindow({
    width: W, height: H,
    x, y,
    frame: false, transparent: true, resizable: false,
    backgroundColor: '#00000000', // macOS: keep the window transparent, not white
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  settingsWin.setAlwaysOnTop(true, 'screen-saver');
  if (IS_MAC) settingsWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'HAL 9000', enabled: false },
    { label: '双击 HAL 可打开 Claude 对话', enabled: false },
    { type: 'separator' },
    { label: '设置', click: openSettings },
    { label: 'Claude Code 联动', type: 'checkbox', checked: hooksInstall.isInstalled(), click: toggleHooks },
    { label: '摄像头跟踪（眼睛跟人动）', type: 'checkbox', checked: cameraOn, click: (mi) => setCamera(mi.checked) },
    { label: '点击穿透（锁定）', type: 'checkbox', checked: locked, click: (mi) => { locked = mi.checked; applyIgnore(); if (tray) tray.setContextMenu(buildMenu()); } },
    { label: hidden ? '显示 HAL' : '暂时隐藏', click: () => setHidden(!hidden) },
    {
      label: '回到右下角',
      enabled: !hidden,
      click: () => {
        const b = win.getBounds();
        const pos = cornerPos(b.width, b.height);
        win.setPosition(pos.x, pos.y);
      },
    },
    { type: 'separator' },
    { label: '退出', click: quitWithLine },
  ]);
}

// Single-instance lock: if a pet is already running, this launch exits at once.
// So even if SessionStart fires several times at once, only ONE pet ever shows.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win && !win.isDestroyed() && !hidden) win.showInactive(); });

  app.whenReady().then(() => {
  // macOS: run as a pure menu-bar (accessory) app — no Dock icon, no app menu,
  // never steals focus. This is the mac analogue of Windows' skipTaskbar.
  if (IS_MAC) {
    app.setActivationPolicy('accessory');
    if (app.dock) app.dock.hide();
  }

  // Only allow webcam access when the user has turned camera tracking on.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'media' ? cameraOn : false));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' ? cameraOn : false);

  createWindow();
  writeRunFiles();
  clearAutoLaunch();

  tray = new Tray(makeTrayIcon());
  tray.setToolTip('HAL 9000');
  tray.setContextMenu(buildMenu());
  if (IS_MAC) {
    // Menu bar: the OS opens the context menu on click. We keep it fresh by
    // rebuilding on every state change (setHidden/setCamera/toggleHooks/lock),
    // so its checkboxes are never stale. When hidden, the "显示 HAL" menu item
    // brings it back.
  } else {
    // Windows tray: hidden -> click restores HAL; otherwise pop the menu.
    // Rebuild right before showing so its checkboxes are never stale.
    tray.on('click', () => { if (hidden) { setHidden(false); } else { tray.setContextMenu(buildMenu()); tray.popUpContextMenu(); } });
    tray.on('right-click', () => { tray.setContextMenu(buildMenu()); });
  }

  firstRunSetup(); // first launch on a machine auto-associates with Claude Code

  // watch the Claude desktop app; quit with it once it's been seen and then closes
  setTimeout(checkClaude, 2500);
  claudeTimer = setInterval(checkClaude, 4000);

  ipcMain.on('pet-context-menu', () => buildMenu().popup({ window: win }));

  // hover hit-test drives click-through so the transparent area doesn't block the desktop
  ipcMain.on('interactive', (_e, on) => { hoverInteractive = on; applyIgnore(); });

  // manual dragging (so double-click still works)
  ipcMain.on('drag-start', (_e, p) => { const b = win.getBounds(); dragStart = { px: p.x, py: p.y, bx: b.x, by: b.y }; });
  // 拖动时必须连宽高一起设死：只用 setPosition 的话，在分数 DPI 缩放（如 150%）下
  // 每次移动都要 DIP↔物理像素来回取整，误差会逐次累积，窗口越拖越大（整数缩放不触发）。
  ipcMain.on('drag-move', (_e, p) => {
    if (!dragStart) return;
    const { w, h } = winDims(clampSize(cfg.size));
    win.setBounds({
      x: Math.round(dragStart.bx + (p.x - dragStart.px)),
      y: Math.round(dragStart.by + (p.y - dragStart.py)),
      width: w, height: h,
    });
  });
  ipcMain.on('drag-end', () => { dragStart = null; });

  ipcMain.on('open-claude', () => openClaude());
  ipcMain.on('quit-now', () => app.quit()); // goodbye line finished -> close for real
  ipcMain.on('camera-failed', (_e, reason) => {
    setCamera(false);
    const how = IS_MAC
      ? '请在 系统设置 → 隐私与安全性 → 摄像头 里允许本应用访问，然后重试。'
      : '请在 Windows 设置 → 隐私 → 摄像头 里允许桌面应用访问，然后重试。';
    dialog.showErrorBox('HAL 9000 · 摄像头', '无法访问摄像头（' + reason + '）。\n' + how);
  });
  ipcMain.on('nudge', () => {
    try { if (Notification.isSupported()) new Notification({ title: 'HAL 9000', body: 'Claude 需要你的确认', silent: false }).show(); } catch {}
  });

  // feed the global cursor position (window-local) so the eye can follow it
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed() || hidden) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    win.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 60);

  ipcMain.handle('get-size', () => ({ size: clampSize(cfg.size), min: MIN_SIZE, max: config.MAX_SIZE }));
  ipcMain.handle('get-muted', () => !!cfg.muted);
  ipcMain.on('set-muted', (_e, on) => {
    cfg.muted = !!on; config.save(cfg);
    if (win && !win.isDestroyed()) win.webContents.send('muted', cfg.muted);
  });
  ipcMain.on('close-settings', () => { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close(); });
  ipcMain.on('preview-size', (_e, size) => applySize(size, false));
  ipcMain.on('commit-size', (_e, size) => applySize(size, true));
});

  app.on('before-quit', () => {
    if (cursorTimer) clearInterval(cursorTimer);
    if (claudeTimer) clearInterval(claudeTimer);
    try { fs.unlinkSync(PID_FILE); } catch {}
  });
  app.on('window-all-closed', () => app.quit());
}
