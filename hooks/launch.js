#!/usr/bin/env node
// Launches the pet if it isn't already running. Wired to Claude Code's
// SessionStart hook so the pet appears whenever you start a Claude session.
// Also records the session `source` (startup | resume | clear | compact) so a
// freshly-launched pet can greet accordingly (e.g. "Welcome back" on resume).
// Self-contained (Node built-ins only).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DIR = path.join(os.homedir(), '.claude-pet');
const PID = path.join(DIR, 'pet.pid');
const LAUNCH = path.join(DIR, 'launch.json');
const SESSION = path.join(DIR, 'session.json');

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // exists but not signalable
}

let buf = '', done = false;
function proceed() {
  if (done) return; done = true;

  // record the SessionStart source for the pet to read on boot
  let source = '';
  try { source = (JSON.parse(buf) || {}).source || ''; } catch {}
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(SESSION, JSON.stringify({ source, ts: Date.now() })); } catch {}

  // already running? do nothing
  try {
    const pid = parseInt(fs.readFileSync(PID, 'utf8'), 10);
    if (pid && alive(pid)) process.exit(0);
  } catch {}

  // relaunch using the command the pet recorded about itself
  try {
    const { argv } = JSON.parse(fs.readFileSync(LAUNCH, 'utf8'));
    if (Array.isArray(argv) && argv.length) {
      spawn(argv[0], argv.slice(1), { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {}

  process.exit(0);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', proceed);
setTimeout(proceed, 250); // fallback if the hook sends no stdin
