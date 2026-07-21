#!/usr/bin/env node
// Called by Claude Code hooks. Writes the current activity state (and a short
// label of what Claude is doing) to a file the pet polls. Self-contained: only
// uses Node built-ins, so it runs from anywhere (incl. a packaged install).
//   node hook.js <state> [--tool] [--detect-error] [--notify]
//   states: idle | thinking | working | waiting | done | error
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.homedir(), '.claude-pet');
const STATE_FILE = path.join(DIR, 'state.json');
const TURN_FILE = path.join(DIR, 'turn.json');

// A turn counts as "a big job" if it used a lot of tools or ran for a long time.
const BIG_TOOLS = 10, BIG_MS = 120000;
function readTurn() { try { return JSON.parse(fs.readFileSync(TURN_FILE, 'utf8')); } catch { return null; } }
function writeTurn(o) { try { fs.writeFileSync(TURN_FILE, JSON.stringify(o)); } catch {} }

const args = process.argv.slice(2);
const base = args[0] || 'idle';
const wantTool = args.includes('--tool');
const wantErr = args.includes('--detect-error');
const wantNotify = args.includes('--notify');
const needStdin = wantTool || wantErr || wantNotify;

let done = false;
function finish(raw) {
  if (done) return; done = true;
  let state = base;
  let label = '';
  let kind = '';
  try { fs.mkdirSync(DIR, { recursive: true }); } catch {}

  if (raw) {
    let j = null;
    try { j = JSON.parse(raw); } catch {}
    if (j) {
      if (wantTool) { const info = toolInfo(j); label = info.label; kind = info.kind; }
      if (wantNotify) label = String(j.message || '需要你确认').slice(0, 28);
      if (wantErr && looksError(j)) state = 'error';
    }
    if (wantErr) { try { fs.writeFileSync(path.join(DIR, 'last-tool.json'), raw.slice(0, 20000)); } catch {} }
  }

  // Track the size of this turn so Stop can tell a big job from a trivial one.
  if (base === 'thinking') {
    writeTurn({ started: Date.now(), tools: 0 });          // new turn begins
  } else if (wantTool && !wantErr) {                        // PreToolUse only (PostToolUse carries --detect-error)
    const tn = readTurn() || { started: Date.now(), tools: 0 };
    tn.tools = (tn.tools || 0) + 1;
    writeTurn(tn);
  } else if (base === 'done') {
    const tn = readTurn();
    if (tn && ((tn.tools || 0) >= BIG_TOOLS || Date.now() - (tn.started || Date.now()) >= BIG_MS)) {
      state = 'celebrate';                                  // big job finished -> dance
    }
    writeTurn({ started: Date.now(), tools: 0 });
  }

  try { fs.writeFileSync(STATE_FILE, JSON.stringify({ state, ts: Date.now(), label, kind })); } catch {}
  process.exit(0);
}

function baseName(p) { return p ? String(p).split(/[\\/]/).pop() : ''; }

// -> { label, kind }  kind drives HAL's micro-expression: read | edit | test | git | search | task | bash
function toolInfo(j) {
  const name = j.tool_name || j.toolName || '';
  const inp = j.tool_input || j.toolInput || {};
  switch (name) {
    case 'Read': return { label: '读取 ' + baseName(inp.file_path), kind: 'read' };
    case 'Edit': case 'MultiEdit': return { label: '编辑 ' + baseName(inp.file_path), kind: 'edit' };
    case 'Write': return { label: '写入 ' + baseName(inp.file_path), kind: 'edit' };
    case 'NotebookEdit': return { label: '编辑 notebook', kind: 'edit' };
    case 'Bash': {
      const cmd = (inp.command || '').trim();
      if (/\bgit\s+commit\b/.test(cmd)) return { label: 'git 提交中', kind: 'git' };
      if (/\bgit\s+push\b/.test(cmd)) return { label: 'git 推送中', kind: 'git' };
      if (/\b(npm|pnpm|yarn)\s+(run\s+)?test\b|pytest|jest|vitest\b/.test(cmd)) return { label: '运行测试', kind: 'test' };
      if (/\b(npm|pnpm|yarn)\s+(run\s+)?build\b/.test(cmd)) return { label: '构建中', kind: 'test' };
      if (/\bgit\b/.test(cmd)) return { label: '运行 git', kind: 'git' };
      return { label: '运行: ' + (cmd.split('\n')[0] || '').slice(0, 22), kind: 'bash' };
    }
    case 'Grep': return { label: '搜索: ' + String(inp.pattern || '').slice(0, 16), kind: 'read' };
    case 'Glob': return { label: '查找文件', kind: 'read' };
    case 'WebFetch': return { label: '联网抓取', kind: 'search' };
    case 'WebSearch': return { label: '联网搜索: ' + String(inp.query || '').slice(0, 14), kind: 'search' };
    case 'Task': return { label: '调度子任务', kind: 'task' };
    case 'TodoWrite': return { label: '整理任务清单', kind: 'edit' };
    default: return { label: name || '', kind: '' };
  }
}

function looksError(j) {
  const tr = j && j.tool_response;
  if (tr) {
    if (tr.is_error === true || tr.isError === true) return true;
    if (typeof tr.exit_code === 'number' && tr.exit_code !== 0) return true;
    if (typeof tr === 'string' && /(^|\n)\s*(error|traceback|exception|fatal)\b/i.test(tr)) return true;
  }
  if (typeof j?.exit_code === 'number' && j.exit_code !== 0) return true;
  return false;
}

if (needStdin) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (buf += d));
  process.stdin.on('end', () => finish(buf));
  setTimeout(() => finish(buf), 300);
} else {
  finish('');
}
