#!/usr/bin/env node
// `npm run pack` dispatcher: builds the portable app for whichever OS you're on.
//   macOS   -> scripts/pack-mac.sh  (HAL 9000 Pet.app)
//   Windows -> scripts/pack.sh      (HAL 9000 Pet.exe)
const { spawnSync } = require('child_process');
const script = process.platform === 'darwin' ? 'scripts/pack-mac.sh' : 'scripts/pack.sh';
const r = spawnSync('bash', [script], { stdio: 'inherit' });
process.exit(r.status == null ? 1 : r.status);
