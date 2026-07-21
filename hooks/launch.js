#!/usr/bin/env node
// Launches the pet if it isn't already running. Wired to Claude Code's
// SessionStart hook so the pet appears whenever you start a Claude session.
// Self-contained (Node built-ins only). The pet writes pet.pid + launch.json
// on startup so this script knows whether it's alive and how to relaunch it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DIR = path.join(os.homedir(), '.claude-pet');
const PID = path.join(DIR, 'pet.pid');
const LAUNCH = path.join(DIR, 'launch.json');

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // exists but not signalable
}

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
