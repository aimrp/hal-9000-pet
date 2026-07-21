// Cross-platform helpers. Everything OS-specific lives here so the rest of the
// app can stay platform-agnostic. Branches on process.platform:
//   - 'win32'  -> Windows (PowerShell / .cmd wrappers)
//   - 'darwin' -> macOS   (osascript / .sh wrappers)
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

// ---- Bring the Claude desktop app to the foreground (double-click on HAL) ----
// Windows: PowerShell + Win32 SwitchToThisWindow (focus-claude.ps1).
// macOS:   AppleScript `activate`, falling back to `open -a Claude` to launch it.
function focusClaude(srcDir) {
  if (IS_MAC) {
    // `activate` raises it if running; if not running it errors, so we then launch.
    const script = 'tell application "Claude" to activate';
    execFile('osascript', ['-e', script], (err) => {
      if (err) execFile('open', ['-a', 'Claude'], () => {});
    });
    return;
  }
  // Windows
  const ps = path.join(srcDir, 'focus-claude.ps1');
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps], { windowsHide: true }, () => {});
}

// ---- Is the Claude desktop app currently running (with a real window)? ----
// Calls back(true|false). Used to auto-quit the pet once Claude closes.
function isClaudeRunning(cb) {
  if (IS_MAC) {
    // pgrep -x matches the exact process name of the Claude app bundle.
    execFile('pgrep', ['-x', 'Claude'], (err, stdout) => {
      cb(!err && /\d/.test(String(stdout)));
    });
    return;
  }
  // Windows: only the main window has a non-zero MainWindowHandle.
  const psCmd = "if (Get-Process claude -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }) { 'YES' } else { 'NO' }";
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd], { windowsHide: true }, (err, stdout) => {
    if (err) { cb(null); return; } // null = "couldn't tell", caller keeps waiting
    cb(/YES/.test(String(stdout)));
  });
}

// ---- Node-independent hook wrappers for a packaged install ----------------
// Packaged builds have no system Node, so hooks run through the app's OWN bundled
// Electron runtime via ELECTRON_RUN_AS_NODE. Windows uses .cmd, macOS uses .sh.
// `exe` is the app executable path (process.execPath of the packaged app).
// Returns { hookCmd, launchCmd } (absolute paths, already made runnable) or null.
function ensureHookWrappers(hooksDir, exe) {
  try {
    const dir = path.join(os.homedir(), '.claude-pet'); // always writable
    fs.mkdirSync(dir, { recursive: true });
    if (IS_MAC) {
      const mk = (script) =>
        `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec "${exe}" "${path.join(hooksDir, script)}" "$@"\n`;
      const hookCmd = path.join(dir, 'hal-hook.sh');
      const launchCmd = path.join(dir, 'hal-launch.sh');
      fs.writeFileSync(hookCmd, mk('hook.js'));
      fs.writeFileSync(launchCmd, mk('launch.js'));
      fs.chmodSync(hookCmd, 0o755);
      fs.chmodSync(launchCmd, 0o755);
      return { hookCmd, launchCmd };
    }
    // Windows
    const mk = (script) => `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${exe}" "${path.join(hooksDir, script)}" %*\r\n`;
    const hookCmd = path.join(dir, 'hal-hook.cmd');
    const launchCmd = path.join(dir, 'hal-launch.cmd');
    fs.writeFileSync(hookCmd, mk('hook.js'));
    fs.writeFileSync(launchCmd, mk('launch.js'));
    return { hookCmd, launchCmd };
  } catch { return null; }
}

// Names of every wrapper/script we may write, so re-install can recognise & replace
// our own hook entries in settings.json regardless of platform.
const OUR_HOOK_PATTERN = /(hook\.js|launch\.js|hal-hook\.cmd|hal-launch\.cmd|hal-hook\.sh|hal-launch\.sh)/;

module.exports = {
  IS_MAC, IS_WIN,
  focusClaude, isClaudeRunning, ensureHookWrappers, OUR_HOOK_PATTERN,
};
