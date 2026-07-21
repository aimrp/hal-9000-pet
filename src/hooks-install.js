// Install/remove the pet's hooks in ~/.claude/settings.json. Callable from the
// CLI (hooks/install-hooks.js) or from the app's tray menu. Additive & idempotent:
// only touches entries whose command points at our hook.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureHookWrappers, OUR_HOOK_PATTERN } = require('./platform.js');

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');

// event -> pet state + hook.js flags. `script` entries run a different script.
const MAP = {
  SessionStart: { script: 'launch.js' },   // start the pet when a Claude session begins
  UserPromptSubmit: { state: 'thinking' },
  PreToolUse: { state: 'working', flags: ['--tool'] },
  PostToolUse: { state: 'working', flags: ['--detect-error', '--tool'] },
  Notification: { state: 'waiting', flags: ['--notify'] },
  PreCompact: { state: 'compacting' }, // context about to be compacted = HAL's memory fading
  Stop: { state: 'done' },
};

function cmdFor(hooksDir, m, runner) {
  const args = m.script ? '' : ` ${m.state}${m.flags ? ' ' + m.flags.join(' ') : ''}`;
  if (runner) {
    const wrapper = m.script ? runner.launchCmd : runner.hookCmd;
    return `"${wrapper}"${args}`;
  }
  const script = m.script || 'hook.js';
  return `node "${path.join(hooksDir, script)}"${args}`;
}

// does this command belong to us (so re-install can replace it cleanly)?
function isOurs(cmd) {
  return typeof cmd === 'string' && OUR_HOOK_PATTERN.test(cmd);
}

function load() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return {}; }
}
function save(obj) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + '.bak');
  fs.writeFileSync(SETTINGS, JSON.stringify(obj, null, 2));
}

function isInstalled() {
  try { return JSON.stringify(load().hooks || {}).includes('hook.js'); } catch { return false; }
}

// { remove, hooksDir, exe } -> writes settings.json, returns the settings path.
// Pass `exe` (the packaged app's executable) to make hooks Node-independent.
function run({ remove = false, hooksDir, exe }) {
  const settings = load();
  settings.hooks = settings.hooks || {};
  const runner = (!remove && exe) ? ensureHookWrappers(hooksDir, exe) : null;
  for (const [event, m] of Object.entries(MAP)) {
    const groups = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
    const cleaned = groups
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !(h && isOurs(h.command))) }))
      .filter((g) => (g.hooks || []).length > 0);
    if (!remove) cleaned.push({ hooks: [{ type: 'command', command: cmdFor(hooksDir, m, runner) }] });
    if (cleaned.length) settings.hooks[event] = cleaned;
    else delete settings.hooks[event];
  }
  save(settings);
  return SETTINGS;
}

module.exports = { run, isInstalled, SETTINGS };
