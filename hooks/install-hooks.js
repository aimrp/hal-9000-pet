#!/usr/bin/env node
// CLI wrapper: install/remove the pet's hooks (dev use). The app also exposes
// this via its tray menu. Usage:
//   node hooks/install-hooks.js           # install
//   node hooks/install-hooks.js --remove  # uninstall
const { run } = require('../src/hooks-install.js');
const remove = process.argv.includes('--remove');
const out = run({ remove, hooksDir: __dirname });
console.log(`${remove ? 'Removed' : 'Installed'} Claude-pet hooks in ${out}`);
if (!remove) console.log('Start a NEW Claude Code session for hooks to load.');
