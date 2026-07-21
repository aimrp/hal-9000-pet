// Shared location of the state file that Claude Code hooks write and the pet reads.
// Lives in the user's home dir so it's independent of which project Claude Code runs in.
const os = require('os');
const path = require('path');

const DIR = path.join(os.homedir(), '.claude-pet');
const STATE_FILE = path.join(DIR, 'state.json');

module.exports = { DIR, STATE_FILE };
