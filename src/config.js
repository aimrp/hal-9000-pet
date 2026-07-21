// Persisted user settings for the pet (e.g. size). Lives next to the state file.
const fs = require('fs');
const path = require('path');
const { DIR } = require('./state-path.js');

const CONFIG_FILE = path.join(DIR, 'config.json');
const DEFAULTS = { size: 200, muted: false };
const MIN_SIZE = 80;
const MAX_SIZE = 460;

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(cfg) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch { /* ignore */ }
}

module.exports = { CONFIG_FILE, DEFAULTS, MIN_SIZE, MAX_SIZE, load, save };
