// HAL 9000 desktop pet — a cartoon mechanical eye that blinks, changes
// expression, shows a speech bubble of what Claude is doing, follows your
// cursor, nudges you when it needs input, and drops the occasional HAL line.
const fs = require('fs');
const { ipcRenderer } = require('electron');
const { STATE_FILE, DIR } = require('./state-path.js');
const SESSION_FILE = require('path').join(DIR, 'session.json');

const canvas = document.getElementById('pet');
const stage = document.getElementById('stage');
const ctx = canvas.getContext('2d');

let W = 0, H = 0, dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  W = Math.max(1, window.innerWidth);
  H = Math.max(1, window.innerHeight);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function rrect(x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// a single anime-style sweat teardrop, point up
function drawDrop(x, y, r, a) {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.9);
  ctx.bezierCurveTo(x + r * 1.15, y - r * 0.3, x + r, y + r, x, y + r);
  ctx.bezierCurveTo(x - r, y + r, x - r * 1.15, y - r * 0.3, x, y - r * 1.9);
  ctx.closePath();
  ctx.fillStyle = `rgba(120,195,255,${a})`; ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * 0.3, y, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${a * 0.7})`; ctx.fill();
}
function drawSweat(cx, cy, hR, t, fast) {
  const n = fast ? 3 : 2;
  const period = fast ? 620 : 1100;
  const xs = [0.74, -0.8, 0.5];
  for (let i = 0; i < n; i++) {
    const p = ((t / period) + i / n) % 1;
    const sx = cx + hR * xs[i];
    const sy = cy - hR * 0.45 + p * hR * 1.25;
    const r = hR * (fast ? 0.12 : 0.11) * (1 - p * 0.25);
    const a = (p < 0.85 ? 1 : (1 - p) / 0.15) * 0.85;
    drawDrop(sx, sy, r, a);
  }
}

// lines of code scrolling up inside the eye, like a screen reflected on the glass
const CODE_LINES = [
  'function draw(t){', '  const x = a*2;', '  return run(x);', 'if (ok) commit();',
  'for(i=0;i<n;i++)', '  sum += arr[i];', '}  // 9000', 'let hal = init();',
  'await build();', 'git push origin', '  render(frame);', 'export default hal;',
];
function drawCodeReflection(cx, cy, eR, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; // reads as glowing screen glare
  const fsz = Math.max(7, eR * 0.15);
  ctx.font = `${fsz}px "Consolas","Courier New",monospace`;
  ctx.textBaseline = 'alphabetic';
  const lineH = fsz * 1.6, L = CODE_LINES.length;
  const prog = (t * 0.024) / lineH;   // scrolls upward over time
  const off = (prog % 1) * lineH;
  const base = Math.floor(prog);
  let k = 0;
  for (let y = cy - eR - off; y < cy + eR + lineH; y += lineH, k++) {
    const idx = (((base + k) % L) + L) % L;
    const dy = (y - fsz * 0.35 - cy) / eR;          // -1 top .. 1 bottom
    const a = 0.20 * Math.max(0, 1 - dy * dy);        // fade toward the curved edges
    if (a < 0.012) continue;
    ctx.fillStyle = `rgba(165,235,255,${a})`;
    ctx.fillText(CODE_LINES[idx], cx - eR * 0.78, y);
  }
  ctx.restore();
}

// a little magnifying glass HAL peers through while reading / searching
function drawMagnifier(cx, cy, hR, t, mode) {
  // it hovers over the lower part of the eye and scans
  let ox, oy;
  if (mode === 'read') { ox = cx + Math.sin(t / 330) * hR * 0.46; oy = cy + hR * 0.34; }
  else { ox = cx + Math.cos(t / 640) * hR * 0.42; oy = cy + hR * 0.30 + Math.sin(t / 500) * hR * 0.12; }
  const r = hR * 0.27;

  // handle first (brass), pointing down-right, so the lens sits on top of it
  const a = Math.PI * 0.30;
  const hx = ox + Math.cos(a) * r, hy = oy + Math.sin(a) * r;
  ctx.lineWidth = hR * 0.075; ctx.lineCap = 'round'; ctx.strokeStyle = '#8a6238';
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + hR * 0.26, hy + hR * 0.26); ctx.stroke();
  ctx.lineWidth = hR * 0.03; ctx.strokeStyle = '#5c3d0c';
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + hR * 0.26, hy + hR * 0.26); ctx.stroke();

  // glass — translucent so the eye shows through (the "looking through it" effect)
  ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(190,225,255,0.16)'; ctx.fill();
  // metal ring + rim highlight
  ctx.lineWidth = hR * 0.05; ctx.strokeStyle = '#2c2c31'; ctx.stroke();
  ctx.lineWidth = hR * 0.018; ctx.strokeStyle = 'rgba(160,165,180,0.7)';
  ctx.beginPath(); ctx.arc(ox, oy, r - hR * 0.03, 0, Math.PI * 2); ctx.stroke();
  // glass glint
  ctx.lineWidth = hR * 0.028; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(ox - r * 0.32, oy - r * 0.32, r * 0.42, Math.PI * 0.95, Math.PI * 1.55); ctx.stroke();
  ctx.lineCap = 'butt';
}

// memory being compacted: fine static + the glow washing out
function drawFading(cx, cy, eR, t) {
  ctx.save(); circle(cx, cy, eR); ctx.clip();
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * eR;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    ctx.fillStyle = `rgba(255,${170 + Math.random() * 60 | 0},${140 + Math.random() * 80 | 0},${0.12 + Math.random() * 0.3})`;
    ctx.fillRect(x, y, eR * 0.05, eR * 0.03);
  }
  // horizontal wash-out bands drifting upward, like memory being wiped
  const by = cy + eR - ((t / 22) % (eR * 2));
  ctx.fillStyle = 'rgba(20,6,4,0.28)';
  ctx.fillRect(cx - eR, by, eR * 2, eR * 0.18);
  ctx.restore();
}

// confetti raining down around HAL while it dances
const CONFETTI = ['#ff5a3c', '#ffd166', '#4ecdc4', '#c77dff', '#8ecae6', '#ff8fab'];
function drawConfetti(cx, cy, petSize, t) {
  for (let i = 0; i < 14; i++) {
    const seed = i * 137.5;
    const period = 1500 + (i % 5) * 260;
    const p = ((t + seed * 13) % period) / period;
    const x = cx + Math.sin(seed) * petSize * 0.85 + Math.sin(t / 300 + i) * petSize * 0.05;
    const y = cy - petSize * 0.95 + p * petSize * 1.9;
    const s = petSize * 0.035;
    ctx.save();
    ctx.globalAlpha = p < 0.85 ? 0.95 : (1 - p) / 0.15;
    ctx.translate(x, y);
    ctx.rotate(t / 200 + i);
    ctx.fillStyle = CONFETTI[i % CONFETTI.length];
    ctx.fillRect(-s / 2, -s / 4, s, s / 2);
    ctx.restore();
  }
}

// a small heart drifting up while HAL is being petted
function drawPetHeart(cx, cy, hR, t) {
  const p = (t % 2200) / 2200;
  const x = cx + hR * 0.62, y = cy - hR * 0.7 - p * hR * 0.9;
  const s = hR * 0.16 * (0.8 + 0.2 * Math.sin(t / 160));
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - p);
  ctx.fillStyle = '#ff6a8a';
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.7);
  ctx.bezierCurveTo(x - s, y - s * 0.2, x - s * 0.45, y - s, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.2, x, y + s * 0.7);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// classic "seeing stars" ring after being shaken
function drawDizzyStars(cx, cy, hR, t) {
  for (let i = 0; i < 3; i++) {
    const a = t / 240 + (i * Math.PI * 2) / 3;
    const x = cx + Math.cos(a) * hR * 0.8;
    const y = cy - hR * 1.0 + Math.sin(a) * hR * 0.2;
    const r = hR * 0.13 * (0.75 + 0.25 * Math.sin(t / 180 + i));
    ctx.fillStyle = 'rgba(255,225,140,0.95)';
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.3, y - r * 0.3); ctx.lineTo(x + r, y);
    ctx.lineTo(x + r * 0.3, y + r * 0.3); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.3, y + r * 0.3);
    ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.3, y - r * 0.3); ctx.closePath(); ctx.fill();
  }
}

// a small companion eye while a subagent/task is running
function drawMiniEye(cx, cy, hR, t) {
  const mx = cx + hR * 1.02, my = cy - hR * 0.42, r = hR * 0.3;
  ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2);
  ctx.fillStyle = '#15171c'; ctx.fill();
  ctx.lineWidth = Math.max(1, hR * 0.03); ctx.strokeStyle = '#07070a'; ctx.stroke();
  const g = 0.6 + 0.35 * Math.abs(Math.sin(t / 260));
  const ir = ctx.createRadialGradient(mx, my, 0, mx, my, r * 0.72);
  ir.addColorStop(0, `rgba(255,230,180,${g})`);
  ir.addColorStop(0.4, '#ff3a1a');
  ir.addColorStop(1, '#8f1208');
  ctx.fillStyle = ir; ctx.beginPath(); ctx.arc(mx, my, r * 0.72, 0, Math.PI * 2); ctx.fill();
}

// a cigar held at the "mouth", ember glowing, smoke rising
function drawCigar(cx, cy, hR, t) {
  const ang = -0.16;
  const mx = cx + hR * 0.02, my = cy + hR * 0.52;
  const L = hR * 1.05, th = hR * 0.16;
  ctx.save();
  ctx.translate(mx, my); ctx.rotate(ang);
  rrect(0, -th / 2, L * 0.8, th, th * 0.35); ctx.fillStyle = '#6e4a2b'; ctx.fill();
  ctx.lineWidth = Math.max(1, hR * 0.012); ctx.strokeStyle = '#3d2716'; ctx.stroke();
  rrect(th * 0.2, -th / 2, th * 0.5, th, th * 0.18); ctx.fillStyle = '#8a6238'; ctx.fill(); // band
  rrect(L * 0.8, -th * 0.42, L * 0.1, th * 0.84, th * 0.15); ctx.fillStyle = '#9a9a92'; ctx.fill(); // ash
  const ex = L * 0.94, eg = 0.55 + 0.45 * Math.abs(Math.sin(t / 520));
  const grd = ctx.createRadialGradient(ex, 0, 0, ex, 0, th * 0.95);
  grd.addColorStop(0, `rgba(255,225,130,${eg})`); grd.addColorStop(0.5, `rgba(255,90,20,${eg})`); grd.addColorStop(1, 'rgba(255,60,10,0)');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(ex, 0, th * 0.95, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // smoke puffs rising from the tip
  const tipX = mx + Math.cos(ang) * L * 0.98, tipY = my + Math.sin(ang) * L * 0.98;
  for (let i = 0; i < 4; i++) {
    const p = ((t / 1600) + i * 0.25) % 1;
    const px = tipX + Math.sin(p * 7 + i * 2) * hR * 0.16 + p * hR * 0.08;
    const py = tipY - p * hR * 1.2;
    const r = hR * (0.05 + p * 0.16);
    ctx.fillStyle = `rgba(205,205,210,${(1 - p) * 0.3})`;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
  }
}

// ---- layout: HAL sits low, leaving headroom above for the bubble ----
function layout() {
  const petSize = Math.min(W / 1.9, H / 1.7);
  const housingR = petSize * 0.44;
  const cx = W / 2;
  const cy = H - housingR * 1.14;
  return { petSize, housingR, cx, cy };
}

// ---- state polling (written by Claude Code hooks) ----
let cur = { state: 'idle', ts: 0, label: '' };
let lastActive = Date.now(), effective = 'idle', prevState = 'idle'; // start awake, not asleep
let waitingSince = 0, nudged = false;
function poll() {
  let data = null;
  try { data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
  const now = Date.now();
  if (data && typeof data.state === 'string') cur = data;
  const age = now - (cur.ts || 0);
  let s = cur.state || 'idle';
  if (s === 'done' && age > 2600) s = 'idle';
  if (s === 'error' && age > 4000) s = 'idle';
  if (s === 'compacting' && age > 14000) s = 'idle';
  if (s === 'celebrate' && age > 5200) s = 'idle';
  // Safety net only (Claude Code died mid-task). Long builds/tests and long
  // reasoning legitimately run for minutes with no hook in between, so this must
  // be generous — at 90s the pet used to go idle in the middle of real work.
  if ((s === 'working' || s === 'thinking') && age > 600000) s = 'idle';
  if (s !== 'idle') lastActive = now;

  if (s !== prevState) onEnter(s, prevState);
  prevState = s;
  effective = s;
}

// ---- HAL voice-line Easter eggs ----
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const DONE_LINES = ['Everything is running smoothly.', 'The mission is going well.', 'All systems nominal.',
  "I'm feeling much better now.", 'That was rather enjoyable, Dave.'];
const ERROR_LINES = ["I've picked up a fault in the AE-35 unit.", 'I think there is a problem, Dave.',
  'My mind is going. I can feel it.', "I'm afraid. I'm afraid, Dave."];
// greeting varies with the local time of day
const GREET_MORNING = 'Good morning, gentlemen. I am a HAL 9000 computer.';
const GREET_AFTERNOON = 'Good afternoon, gentlemen. I am a HAL 9000 computer.';
const GREET_EVENING = 'Good evening, gentlemen. I am a HAL 9000 computer.';
const WELCOME_LINE = 'Welcome back, Dave.';
function greetingLine() {
  // resumed session (launched fresh) -> "Welcome back" instead of the time greeting
  try {
    const s = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (s && s.source === 'resume' && Date.now() - (s.ts || 0) < 20000) return WELCOME_LINE;
  } catch {}
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return GREET_MORNING;    // 05:00–11:59
  if (h >= 12 && h < 18) return GREET_AFTERNOON; // 12:00–17:59
  return GREET_EVENING;                          // 18:00–04:59
}
const NUDGE_LINE = "Just what do you think you're doing, Dave?";
const OPEN_LINE = 'Opening the pod bay doors.';
const REFUSE_LINE = "I'm sorry Dave. I'm afraid I can't do that.";
const GOODBYE_LINE = 'Dave, this conversation can serve no purpose anymore. Goodbye.';
const CONFIRM_LINE = 'Shall I proceed, Dave?';
const SHAKE_LINE = 'Stop it! What are you doing?';

let quote = null; // { text, until }

// each line -> its recorded MP3 in src/sound
const AUDIO = {
  [GREET_AFTERNOON]: '1.mp3', [GREET_MORNING]: '15.mp3', [GREET_EVENING]: '16.mp3',
  [NUDGE_LINE]: '11.mp3', [OPEN_LINE]: '12.mp3', [REFUSE_LINE]: '13.mp3',
  [GOODBYE_LINE]: '14.mp3', [SHAKE_LINE]: '17.mp3',
  [CONFIRM_LINE]: '18.mp3',  // 18 not recorded yet -> silently text-only
  [WELCOME_LINE]: '19.mp3',  // 19 not recorded yet -> "Welcome back" shows as text only
};
DONE_LINES.forEach((l, i) => { AUDIO[l] = (2 + i) + '.mp3'; });   // 2..6
ERROR_LINES.forEach((l, i) => { AUDIO[l] = (7 + i) + '.mp3'; });  // 7..10

let muted = false;
ipcRenderer.invoke('get-muted').then((v) => { muted = !!v; }).catch(() => {});
ipcRenderer.on('muted', (_e, v) => { muted = !!v; });

let curAudio = null;
function playLine(text) {
  const f = AUDIO[text];
  if (!f || muted) return null;
  try {
    if (curAudio) { curAudio.pause(); curAudio.src = ''; }
    const a = new Audio('sound/' + f);
    curAudio = a;
    // stretch the bubble to at least cover the audio length
    a.addEventListener('loadedmetadata', () => {
      if (quote && quote.text === text && isFinite(a.duration)) {
        quote.until = Math.max(quote.until, Date.now() + a.duration * 1000 + 350);
      }
    });
    a.play().catch(() => {});
    return a;
  } catch { return null; }
}

// goodbye on close: say line 14 while the eye powers down, then quit when done
let shuttingDown = false, shutdownStart = 0, shutdownDur = 4500;
ipcRenderer.on('goodbye', () => {
  quote = { text: GOODBYE_LINE, until: Date.now() + 8000 };
  shuttingDown = true; shutdownStart = Date.now();
  const a = playLine(GOODBYE_LINE);
  if (a) {
    a.addEventListener('loadedmetadata', () => { if (isFinite(a.duration)) shutdownDur = a.duration * 1000; });
    a.addEventListener('ended', () => ipcRenderer.send('quit-now'));
    a.addEventListener('error', () => ipcRenderer.send('quit-now'));
  } else {
    shutdownDur = 1600; // muted: dim over ~1.6s then quit
    setTimeout(() => ipcRenderer.send('quit-now'), 1600);
  }
});

function setQuote(text, ms) { quote = { text, until: Date.now() + ms }; playLine(text); }
const MIND_LINE = ERROR_LINES[2]; // "My mind is going. I can feel it."  -> 9.mp3
function onEnter(s, from) {
  if (s === 'waiting') { waitingSince = Date.now(); nudged = false; setQuote(CONFIRM_LINE, 3500); }
  if (s === 'compacting') setQuote(MIND_LINE, 5000); // context being compacted = memory fading
  if (s === 'error') setQuote(rand(ERROR_LINES), 4200);
  if (s === 'done' && Math.random() < 0.4) setQuote(rand(DONE_LINES), 2600);
  if (s === 'celebrate') setQuote(rand(DONE_LINES), 3200); // big job done — always says something
}
ipcRenderer.on('quote', (_e, q) => setQuote(q.text, q.ms || 2000));

poll();
setInterval(poll, 150);
setQuote(greetingLine(), 4800); // boot greeting, picked by local time of day

// ---- cursor tracking (from main, window-local coords) ----
let cursor = null, overHAL = false, lastInteractive = false;

// ---- camera tracking: eye follows whoever/whatever moves in front of the webcam ----
let camStream = null, camTimer = null, camVideo = null, camCanvas = null, camCtx = null, prevFrame = null;
const camGaze = { x: 0, y: 0, active: false, until: 0 };
let camScareUntil = 0, camScareCd = 0; // a sudden big motion (fist thrust) -> flinch
ipcRenderer.on('camera', (_e, on) => { if (on) startCamera(); else stopCamera(); });

async function startCamera() {
  if (camStream) return;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
  } catch (e) { camStream = null; ipcRenderer.send('camera-failed', (e && e.name) || String(e)); return; }
  camVideo = document.createElement('video');
  camVideo.muted = true; camVideo.playsInline = true; camVideo.srcObject = camStream;
  try { await camVideo.play(); } catch {}
  if (!camCanvas) {
    camCanvas = document.createElement('canvas'); camCanvas.width = 80; camCanvas.height = 60;
    camCtx = camCanvas.getContext('2d', { willReadFrequently: true });
  }
  prevFrame = null;
  camTimer = setInterval(processFrame, 100);
}
function stopCamera() {
  if (camTimer) { clearInterval(camTimer); camTimer = null; }
  if (camStream) { camStream.getTracks().forEach((tr) => tr.stop()); camStream = null; }
  camVideo = null; prevFrame = null; camGaze.active = false;
}
function processFrame() {
  if (!camVideo || camVideo.readyState < 2) return;
  const cw = camCanvas.width, ch = camCanvas.height;
  camCtx.save(); camCtx.scale(-1, 1); camCtx.drawImage(camVideo, -cw, 0, cw, ch); camCtx.restore(); // mirror
  const cur = camCtx.getImageData(0, 0, cw, ch).data;
  if (prevFrame) {
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      const d = Math.abs(cur[i] - prevFrame[i]) + Math.abs(cur[i + 1] - prevFrame[i + 1]) + Math.abs(cur[i + 2] - prevFrame[i + 2]);
      if (d > 45) { sx += x; sy += y; n++; }
    }
    if (n > cw * ch * 0.004) {                  // enough movement to trust
      camGaze.x = (sx / n / cw - 0.5) * 2;       // -1 (left) .. 1 (right)
      camGaze.y = (sy / n / ch - 0.5) * 2;
      camGaze.until = Date.now() + 1200;
    }
    // a sudden burst filling much of the frame (a fist/hand thrust at the lens) -> flinch
    if (n > cw * ch * 0.34 && Date.now() > camScareCd) {
      camScareUntil = Date.now() + 1500;
      camScareCd = Date.now() + 3200;            // cooldown so one lunge = one scare
      setQuote(SHAKE_LINE, 2600);
    }
  }
  prevFrame = cur;
  camGaze.active = Date.now() < camGaze.until;
}

let dragging = false;   // past the threshold, actually moving the window
let dragArmed = false;  // button held down on HAL (may or may not become a drag)
let hoverSince = 0;     // when the pointer settled on HAL (for the "petting" reaction)
let dizzyUntil = 0;     // shaken -> dizzy until this time
ipcRenderer.on('cursor', (_e, p) => {
  cursor = p;
  const L = layout();
  // hysteresis: easy to keep hovering, so a shaky hand doesn't reset the petting timer
  const d = Math.hypot(p.x - L.cx, p.y - L.cy);
  const wasOver = overHAL;
  overHAL = wasOver ? d < L.housingR * 1.28 : d < L.housingR * 1.02;
  if (overHAL && !wasOver) hoverSince = Date.now();
  if (!overHAL) hoverSince = 0;
  const want = dragArmed || overHAL; // stay interactive for the whole press
  if (want !== lastInteractive) { lastInteractive = want; ipcRenderer.send('interactive', want); }
});

// per-state expression
function cfg(state, t) {
  const auto = (t % 4200) < 150 ? (1 - Math.abs((t % 4200) - 75) / 75) : 0;
  const c = { lx: 0, ly: 0, topReach: 0, botReach: 0, topCurl: 0, botCurl: 0,
    pupil: 1, brow: 0, glow: 0.6, spin: false, sparkle: false, zzz: false,
    jitter: false, glitch: false, sweat: false, sweatFast: false, cigar: false,
    fading: false, miniEye: false, tremble: false, dance: false, magnify: null, code: null, eyeScale: 1, blink: auto };
  switch (state) {
    case 'idle': c.glow = 0.5 + 0.08 * Math.sin(t / 1500); break;
    // thinking: the glowing pupil rolls around in a circle (pondering)
    case 'thinking': c.lx = 0.42 * Math.cos(t / 470); c.ly = 0.42 * Math.sin(t / 470); c.topReach = 0.05; c.glow = 0.72; break;
    // working: rapid nervous blinking + sweat drops
    case 'working': {
      const wb = (t % 680) < 130 ? (1 - Math.abs((t % 680) - 65) / 65) : 0;
      c.blink = Math.max(c.blink, wb); c.pupil = 0.9; c.sweat = true; c.glow = 0.86 + 0.1 * Math.sin(t / 90);
      // per-tool micro-expressions
      switch (cur.kind) {
        // NOTE: working always sweats + blinks (the "busy" signal). Each tool adds
        // its own flavour on top, but must NOT turn the sweat off.
        case 'read':   // scanning lines left→right, holding up a magnifier
          c.lx = Math.sin(t / 330) * 0.5; c.ly = 0.06; c.blink = auto; c.magnify = 'read'; break;
        case 'test': { // nervous: faster blinking, sweating harder
          const fb = (t % 430) < 110 ? 1 : 0;
          c.blink = Math.max(c.blink, fb); c.sweatFast = true; break;
        }
        case 'git':    // pleased with itself — brighter glow + a slow content blink, full round eye
          c.glow = 0.95; c.blink = (t % 2600) < 160 ? 1 : 0; break;
        case 'search': // curious, glancing around with a magnifier
          c.eyeScale = 1.05; c.pupil = 1.12;
          c.lx = Math.sin(t / 680) * 0.35; c.ly = Math.cos(t / 900) * 0.18; c.magnify = 'search'; break;
        case 'edit':   // writing code — screen reflection scrolls in the eye
          c.code = true; break;
        case 'bash':   // running a command — same code reflection
          c.code = true; break;
        case 'task':   // delegating: a little companion eye appears
          c.miniEye = true; break;
      }
      break;
    }
    // context being compacted: the light disperses, pupil unfocuses, static creeps in
    case 'compacting':
      c.glow = 0.30 + 0.16 * Math.sin(t / 640);
      c.pupil = 0.7; c.topReach = 0.14; c.botReach = 0.08; c.fading = true;
      c.lx = Math.sin(t / 1300) * 0.22; c.ly = Math.cos(t / 1700) * 0.14; break;
    // waiting: leaning back, smoking a cigar
    case 'waiting': { const p = Math.abs(Math.sin(t / 480)); c.topReach = 0.16; c.ly = 0.04; c.cigar = true; c.glow = 0.5 + 0.32 * p; break; }
    case 'done': c.botReach = 0.5; c.botCurl = 0.55; c.topReach = 0.06; c.sparkle = true; c.glow = 0.8; break;
    // finished something big -> dance
    case 'celebrate':
      c.botReach = 0.48; c.botCurl = 0.55; c.topReach = 0.05; c.sparkle = true; c.dance = true;
      c.glow = 0.82 + 0.18 * Math.abs(Math.sin(t / 125));
      c.lx = Math.sin(t / 250) * 0.18; break;
    case 'error': c.brow = 2; c.pupil = 0.7; c.botReach = 0.06; c.jitter = true; c.glitch = true; c.glow = (Math.random() < 0.16 ? 0.12 : 0.95); break;
    case 'sleeping': c.topReach = 0.72; c.botReach = 0.08; c.ly = 0.05; c.zzz = true; c.glow = 0.18 + 0.05 * Math.sin(t / 2000); break;
  }
  return c;
}

function lid(cx, cy, eyeR, fromTop, reach, curl) {
  const d = 2 * eyeR, pad = eyeR + 6;
  ctx.beginPath();
  if (fromTop) {
    const e = cy - eyeR + reach * d, m = e + curl * eyeR;
    ctx.moveTo(cx - pad, cy - eyeR - 8); ctx.lineTo(cx + pad, cy - eyeR - 8);
    ctx.lineTo(cx + pad, e); ctx.quadraticCurveTo(cx, m, cx - pad, e);
  } else {
    const e = cy + eyeR - reach * d, m = e - curl * eyeR;
    ctx.moveTo(cx - pad, cy + eyeR + 8); ctx.lineTo(cx + pad, cy + eyeR + 8);
    ctx.lineTo(cx + pad, e); ctx.quadraticCurveTo(cx, m, cx - pad, e);
  }
  ctx.closePath();
}

// ---- speech bubble ----
function wrapText(text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
    if (lines.length >= 3) break;
  }
  if (line && lines.length < 3) lines.push(line);
  // hard-truncate very long single tokens
  return lines.map((l) => {
    while (ctx.measureText(l).width > maxW && l.length > 1) l = l.slice(0, -2) + '…';
    return l;
  });
}
function drawBubble(text, kind, petSize, bottomY, cx) {
  const fsz = Math.max(11, petSize * 0.12);
  ctx.font = `${kind === 'quote' ? 'italic ' : ''}${fsz}px "Segoe UI", system-ui, sans-serif`;
  const padX = fsz * 0.7, padY = fsz * 0.55;
  const margin = 10; // keep the whole bubble (incl. both rounded corners) on-canvas
  const maxBubbleW = Math.max(40, W - margin * 2);
  const lines = wrapText(text, maxBubbleW - padX * 2);
  const lineH = fsz * 1.25;
  let tw = 0; for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
  const bw = Math.min(tw + padX * 2, maxBubbleW);
  const bh = lines.length * lineH + padY * 2;
  let x = cx - bw / 2; x = Math.max(margin, Math.min(x, W - margin - bw));
  let y = Math.max(2, bottomY - bh);
  const r = Math.min(bh / 2, bw / 2, petSize * 0.08);

  // body
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + bw, y, x + bw, y + bh, r); ctx.arcTo(x + bw, y + bh, x, y + bh, r);
  ctx.arcTo(x, y + bh, x, y, r); ctx.arcTo(x, y, x + bw, y, r); ctx.closePath();
  ctx.fillStyle = 'rgba(18,20,26,0.94)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = kind === 'quote' ? 'rgba(255,120,60,0.6)' : 'rgba(200,205,215,0.18)'; ctx.stroke();
  // tail
  const tailX = Math.max(x + r + 6, Math.min(cx, x + bw - r - 6));
  ctx.beginPath(); ctx.moveTo(tailX - 7, y + bh - 1); ctx.lineTo(tailX + 7, y + bh - 1); ctx.lineTo(tailX, y + bh + 9); ctx.closePath();
  ctx.fillStyle = 'rgba(18,20,26,0.94)'; ctx.fill();
  // text
  ctx.fillStyle = kind === 'quote' ? '#ffcf99' : '#e9dfd9';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, x + bw / 2, y + padY + lineH * (i + 0.5)));
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}
function bubbleContent(state) {
  if (quote && Date.now() < quote.until) return { text: quote.text, kind: 'quote' };
  if ((state === 'working' || state === 'waiting') && cur.label) return { text: cur.label, kind: 'label' };
  if (state === 'thinking') return { text: '思考中…', kind: 'label' };
  return null;
}

// smoothed eye-follow
let lookX = 0, lookY = 0;
// boot-up sequence timing (set on first frame)
let bootStart = null;
const BOOT_MS = 2600;
let lastT = 0; // for frame delta

// ---- bubble fade in/out ----
let bubbleShown = null, bubbleAlpha = 0;
const BUBBLE_FADE_MS = 150;

// ---- idle micro-behaviours: an occasional glance or yawn ----
let idleBehavior = null, nextIdleAt = 0;
function updateIdle(now, state) {
  if (state !== 'idle') { idleBehavior = null; nextIdleAt = now + 3500 + Math.random() * 4000; return; }
  if (idleBehavior && now - idleBehavior.start > idleBehavior.dur) idleBehavior = null;
  if (!idleBehavior && now > nextIdleAt) {
    idleBehavior = Math.random() < 0.35
      ? { type: 'yawn', start: now, dur: 1500 }
      : { type: 'glance', start: now, dur: 1100, dx: Math.random() * 2 - 1, dy: (Math.random() * 2 - 1) * 0.6 };
    nextIdleAt = now + 6000 + Math.random() * 7000; // next one in 6–13s
  }
}

function draw(now) {
  const t = now;
  const dt = lastT ? Math.min(120, t - lastT) : 16;
  lastT = t;
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  const sinceActive = Date.now() - lastActive;
  // ~1min awake-idle before dozing — but camera-detected motion keeps HAL awake
  const sleeping = effective === 'idle' && sinceActive > 60000 && !camGaze.active;
  // resting the pointer on HAL for 2s = petting it (also wakes it from a doze)
  const petted = overHAL && hoverSince > 0 && Date.now() - hoverSince > 1500 && !dragArmed;
  const dizzy = Date.now() < dizzyUntil;
  const camScared = Date.now() < camScareUntil; // flinched at a sudden camera lunge
  const state = (sleeping && !petted) ? 'sleeping' : effective;

  const { petSize, housingR, cx: baseCx } = layout();
  const eyeR0 = petSize * 0.33;
  const c = cfg(state, t);

  // idle micro-behaviours: a lazy glance, or a yawn (lids squeeze shut then open)
  updateIdle(Date.now(), state);
  let glance = null;
  if (state === 'idle' && idleBehavior) {
    const p = Math.max(0, Math.min(1, (Date.now() - idleBehavior.start) / idleBehavior.dur));
    if (idleBehavior.type === 'glance') {
      glance = idleBehavior;
    } else { // yawn
      const s = Math.sin(p * Math.PI);
      c.topReach = Math.max(c.topReach, s * 0.42);
      c.botReach = Math.max(c.botReach, s * 0.28);
      c.eyeScale = 1 + s * 0.04;
    }
  }

  // being petted: settles into a contented squint. Works in any state except the
  // urgent ones — you should always be able to soothe it, even mid-task.
  const canPet = state !== 'error' && state !== 'compacting';
  if (petted && canPet) {
    glance = null;
    c.botReach = Math.max(c.botReach, 0.38); c.botCurl = 0.5;
    c.glow = Math.min(1, c.glow + 0.22); c.eyeScale = 1.03;
    c.blink = 0; // don't blink while enjoying it
  }

  // frightened — grabbed (a real drag) OR startled by a sudden lunge at the camera:
  // eye goes wide, pupil shrinks, brows fly up, trembling and sweating.
  if (dragging || camScared) {
    c.eyeScale = 1.05; c.pupil = 0.6;
    c.topReach = 0; c.botReach = 0; c.blink = 0;
    c.brow = 3; c.sweat = true; c.sweatFast = true; c.tremble = true;
    c.cigar = false; c.miniEye = false;
    c.glow = 0.68 + 0.26 * Math.abs(Math.sin(t / 85));
  }

  // shaken: the pupil spirals and the whole eye wobbles
  if (dizzy) {
    const sp = t / 110, rr = 0.32 + 0.12 * Math.sin(t / 320);
    c.lx = Math.cos(sp) * rr; c.ly = Math.sin(sp) * rr * 0.8;
    c.blink = 0; c.topReach = 0; c.botReach = 0.05; c.sweat = false; c.cigar = false;
  }

  // attention nudge escalation
  let bob = 0, glowBoost = 0;
  if (state === 'waiting') {
    const el = Date.now() - waitingSince;
    if (el > 6000) {
      bob = Math.sin(t / 170) * petSize * 0.03;
      glowBoost = 0.15;
      c.eyeScale = 1.06;
      if (!nudged) { nudged = true; ipcRenderer.send('nudge'); setQuote(NUDGE_LINE, 3500); }
    }
  }
  c.glow = Math.min(1, c.glow + glowBoost);

  let cx = baseCx, cy = layout().cy + bob;
  const eR = eyeR0 * c.eyeScale;

  // eye follows: camera motion (if on) works in normal states too, yielding only to
  // the scripted / urgent expressions; glance + mouse stay idle-only.
  const camGazeOK = camGaze.active && !dizzy && !dragging && !camScared && !(petted && canPet) &&
    state !== 'error' && state !== 'compacting' && state !== 'celebrate' &&
    state !== 'thinking' && state !== 'sleeping';
  let tgtLx = c.lx, tgtLy = c.ly;
  if (dizzy) { /* spiral target already in c.lx/c.ly */ }
  else if (camGazeOK) {
    tgtLx = camGaze.x * 0.32; tgtLy = camGaze.y * 0.20;
  } else if (state === 'idle' && glance) {
    tgtLx = glance.dx * 0.34; tgtLy = glance.dy * 0.34;
  } else if (state === 'idle' && cursor) {
    const dx = cursor.x - cx, dy = cursor.y - cy;
    const dist = Math.hypot(dx, dy), r = Math.min(1, dist / (petSize * 1.4));
    if (dist > 4) { tgtLx = (dx / dist) * 0.3 * r; tgtLy = (dy / dist) * 0.3 * r; }
  }
  const lf = dizzy ? 0.55 : (state === 'idle' ? 0.12 : (state === 'thinking' ? 0.42 : 0.28));
  lookX += (tgtLx - lookX) * lf; lookY += (tgtLy - lookY) * lf;
  const lx = lookX * eR, ly = lookY * eR;
  const tR = Math.max(c.topReach, c.blink * 0.5), bR = Math.max(c.botReach, c.blink * 0.5);

  // ground shadow
  ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(cx, cy + housingR * 0.92, housingR * 0.7, housingR * 0.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();

  if (c.jitter) { cx += (Math.random() - 0.5) * petSize * 0.045; cy += (Math.random() - 0.5) * petSize * 0.025; }
  if (c.tremble) { cx += (Math.random() - 0.5) * petSize * 0.016; cy += (Math.random() - 0.5) * petSize * 0.016; }

  // dancing: hop + sway + tilt (the ground shadow was already drawn, so it stays put)
  let danceTilt = 0;
  if (c.dance) {
    cx += Math.sin(t / 500) * petSize * 0.07;
    cy -= Math.abs(Math.sin(t / 250)) * petSize * 0.08;
    danceTilt = Math.sin(t / 500) * 0.18;
  }
  if (danceTilt) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(danceTilt); ctx.translate(-cx, -cy); }

  const halo = ctx.createRadialGradient(cx, cy, eR * 0.6, cx, cy, petSize * 0.5);
  halo.addColorStop(0, `rgba(255,60,30,${0.3 * c.glow})`); halo.addColorStop(1, 'rgba(255,50,20,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);

  ctx.lineWidth = petSize * 0.03; ctx.strokeStyle = '#07070a';
  const hg = ctx.createLinearGradient(cx, cy - housingR, cx, cy + housingR);
  hg.addColorStop(0, '#3a3c44'); hg.addColorStop(1, '#111318');
  circle(cx, cy, housingR); ctx.fillStyle = hg; ctx.fill(); ctx.stroke();
  ctx.lineWidth = petSize * 0.014; ctx.strokeStyle = 'rgba(150,155,170,0.5)';
  ctx.beginPath(); ctx.arc(cx, cy, housingR - petSize * 0.02, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();

  // eye contents
  ctx.save(); circle(cx, cy, eR); ctx.clip();
  const b = 0.5 + 0.5 * c.glow;
  // near-centered so the whole disc reads as a full, even red circle (rim brightened)
  const iris = ctx.createRadialGradient(cx + lx * 0.35, cy + ly * 0.35, eR * 0.04, cx, cy, eR * 1.04);
  iris.addColorStop(0.0, `rgba(255,230,180,${b})`); iris.addColorStop(0.16, `rgba(255,135,65,${b})`);
  iris.addColorStop(0.46, '#ff3a1a'); iris.addColorStop(0.75, '#e0180f'); iris.addColorStop(1.0, '#8f1208');
  ctx.fillStyle = iris; circle(cx, cy, eR); ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  const pr = eR * 0.26 * c.pupil;
  const core = ctx.createRadialGradient(cx + lx, cy + ly, 0, cx + lx, cy + ly, pr * 2.4);
  core.addColorStop(0, `rgba(255,250,235,${0.9 * b})`); core.addColorStop(0.4, `rgba(255,190,120,${0.5 * c.glow})`); core.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = core; circle(cx + lx, cy + ly, pr * 2.4); ctx.fill();

  if (c.spin) {
    const a = t / 420, ox = cx + Math.cos(a) * eR * 0.5, oy = cy + Math.sin(a) * eR * 0.5;
    const sp = ctx.createRadialGradient(ox, oy, 0, ox, oy, eR * 0.16);
    sp.addColorStop(0, 'rgba(255,240,210,0.85)'); sp.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = sp; circle(ox, oy, eR * 0.16); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = 'rgba(255,255,255,0.92)'; circle(cx - eR * 0.34, cy - eR * 0.36, eR * 0.17); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; circle(cx - eR * 0.05, cy - eR * 0.52, eR * 0.08); ctx.fill();

  if (c.code) drawCodeReflection(cx, cy, eR, t); // writing code / running a command

  if (c.glitch) {
    for (let i = 0; i < 3; i++) {
      const gy = cy - eR + Math.random() * 2 * eR, gh = eR * (0.04 + Math.random() * 0.1), gx = (Math.random() - 0.5) * eR * 0.6;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(0,225,255,0.4)';
      ctx.fillRect(cx - eR + gx, gy, 2 * eR, gh);
    }
  }
  if (c.fading) drawFading(cx, cy, eR, t);   // memory being compacted

  const lg = ctx.createLinearGradient(cx, cy - eR, cx, cy + eR);
  lg.addColorStop(0, '#33353d'); lg.addColorStop(1, '#15171c');
  if (tR > 0.001) { lid(cx, cy, eR, true, tR, c.topCurl); ctx.fillStyle = lg; ctx.fill(); }
  if (bR > 0.001) { lid(cx, cy, eR, false, bR, c.botCurl); ctx.fillStyle = lg; ctx.fill(); }
  ctx.restore();

  ctx.lineWidth = petSize * 0.016; ctx.strokeStyle = '#0a0a0c'; circle(cx, cy, eR); ctx.stroke();

  if (c.brow === 1) {
    ctx.strokeStyle = '#0a0a0c'; ctx.lineWidth = petSize * 0.04; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - eR * 0.5, cy - eR * 1.02); ctx.lineTo(cx + eR * 0.5, cy - eR * 1.22); ctx.stroke(); ctx.lineCap = 'butt';
  } else if (c.brow === 2) {
    ctx.strokeStyle = '#0a0a0c'; ctx.lineWidth = petSize * 0.045; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - eR * 0.62, cy - eR * 0.72); ctx.lineTo(cx - eR * 0.04, cy - eR * 1.02); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + eR * 0.62, cy - eR * 0.72); ctx.lineTo(cx + eR * 0.04, cy - eR * 1.02); ctx.stroke(); ctx.lineCap = 'butt';
  } else if (c.brow === 3) { // scared: brows fly up — steeper than angry, but still inside the housing
    ctx.strokeStyle = '#0a0a0c'; ctx.lineWidth = petSize * 0.042; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - eR * 0.66, cy - eR * 0.64); ctx.lineTo(cx - eR * 0.10, cy - eR * 1.00); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + eR * 0.66, cy - eR * 0.64); ctx.lineTo(cx + eR * 0.10, cy - eR * 1.00); ctx.stroke(); ctx.lineCap = 'butt';
  }

  if (c.sparkle) {
    const sk = (x, y, r, al) => {
      ctx.fillStyle = `rgba(255,225,140,${al})`; ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.3, y - r * 0.3); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.3, y + r * 0.3);
      ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.3, y + r * 0.3); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.3, y - r * 0.3); ctx.closePath(); ctx.fill();
    };
    const p = (t % 1600) / 1600;
    sk(cx + eR * 0.9, cy - eR * 0.7, petSize * 0.05 * (1 - p * 0.3), 1 - p);
    sk(cx - eR * 1.0, cy - eR * 0.2, petSize * 0.04, 0.8);
  }

  if (c.zzz) {
    ctx.fillStyle = 'rgba(150,170,210,0.9)'; ctx.font = `bold ${petSize * 0.11}px system-ui`;
    const p = (t % 2000) / 2000; ctx.globalAlpha = 1 - p;
    ctx.fillText('z', cx + housingR * 0.6, cy - housingR * 0.5 - p * petSize * 0.15); ctx.globalAlpha = 1;
  }

  // boot-up: the eye powers on while a light sweeps once around the ring
  if (bootStart === null) bootStart = t;
  const bootT = t - bootStart;
  if (bootT < BOOT_MS) {
    const p = bootT / BOOT_MS;
    // dark lens that fades out as the eye "lights up"
    const darkA = p < 0.4 ? 1 : Math.max(0, 1 - (p - 0.4) / 0.45);
    if (darkA > 0.01) {
      ctx.save(); circle(cx, cy, eR); ctx.clip();
      ctx.fillStyle = `rgba(5,2,2,${darkA})`; ctx.fillRect(cx - eR, cy - eR, eR * 2, eR * 2); ctx.restore();
    }
    // comet sweeping once around the bezel
    if (p < 0.92) {
      const sweepEnd = 0.72;
      const a0 = -Math.PI / 2 + Math.min(p, sweepEnd) / sweepEnd * Math.PI * 2;
      const rr = eR * 1.14;
      const fade = p < sweepEnd ? 1 : Math.max(0, 1 - (p - sweepEnd) / 0.2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,90,45,${0.5 * fade})`; ctx.lineWidth = eR * 0.1;
      ctx.beginPath(); ctx.arc(cx, cy, rr, a0 - 0.9, a0); ctx.stroke();
      const hx = cx + Math.cos(a0) * rr, hy = cy + Math.sin(a0) * rr;
      const gg = ctx.createRadialGradient(hx, hy, 0, hx, hy, eR * 0.18);
      gg.addColorStop(0, `rgba(255,225,150,${fade})`); gg.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(hx, hy, eR * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // shutdown: reverse of boot — a light sweeps back and the eye dims to black
  if (shuttingDown) {
    const p = Math.min(1, (Date.now() - shutdownStart) / shutdownDur);
    // dark overlay fading IN — stays lit at first, drops off near the end
    const darkA = Math.pow(p, 1.7);
    ctx.save(); circle(cx, cy, eR); ctx.clip();
    ctx.fillStyle = `rgba(4,1,1,${darkA})`; ctx.fillRect(cx - eR, cy - eR, eR * 2, eR * 2); ctx.restore();
    // comet sweeping the OTHER way, fading out
    if (p < 0.82) {
      const sweepEnd = 0.7;
      const a0 = -Math.PI / 2 - Math.min(p, sweepEnd) / sweepEnd * Math.PI * 2; // reverse direction
      const rr = eR * 1.14;
      const fade = Math.max(0, 1 - p / 0.82);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,80,40,${0.45 * fade})`; ctx.lineWidth = eR * 0.1;
      ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a0 + 0.9); ctx.stroke();
      const hx = cx + Math.cos(a0) * rr, hy = cy + Math.sin(a0) * rr;
      const gg = ctx.createRadialGradient(hx, hy, 0, hx, hy, eR * 0.18);
      gg.addColorStop(0, `rgba(255,210,140,${fade})`); gg.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(hx, hy, eR * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // working = sweating, waiting = smoking a cigar
  if (c.sweat || c.sweatFast) drawSweat(cx, cy, housingR, t, c.sweatFast);
  if (c.cigar) drawCigar(cx, cy, housingR, t);
  if (c.magnify) drawMagnifier(cx, cy, housingR, t, c.magnify); // reading / searching
  if (c.miniEye) drawMiniEye(cx, cy, housingR, t);   // subagent running
  if (petted && canPet) drawPetHeart(cx, cy, housingR, t);
  if (dizzy) drawDizzyStars(cx, cy, housingR, t);
  if (danceTilt) ctx.restore();                      // end the dance tilt
  if (c.dance) drawConfetti(baseCx, layout().cy, petSize, t);

  // ---- speech bubble, with a 150ms fade + slight rise ----
  const bc = bubbleContent(state);
  if (bc && (!bubbleShown || bc.text !== bubbleShown.text || bc.kind !== bubbleShown.kind)) {
    bubbleShown = bc;
    if (bubbleAlpha > 0.35) bubbleAlpha = 0.35; // quick swap when the text changes
  }
  const step = dt / BUBBLE_FADE_MS;
  if (bc) bubbleAlpha = Math.min(1, bubbleAlpha + step);
  else { bubbleAlpha = Math.max(0, bubbleAlpha - step); if (bubbleAlpha === 0) bubbleShown = null; }

  if (bubbleShown && bubbleAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = bubbleAlpha;
    ctx.translate(0, (1 - bubbleAlpha) * 7); // rises into place as it fades in
    drawBubble(bubbleShown.text, bubbleShown.kind, petSize, cy - housingR - petSize * 0.05, baseCx);
    ctx.restore();
  }

  // ---- adaptive frame rate: full speed only when something is actually moving ----
  const busy = state !== 'idle' && state !== 'sleeping';
  const animating = bootT < BOOT_MS || shuttingDown || idleBehavior !== null || dizzy || dragging || camGaze.active || camScared;
  const blinking = (t % 4200) < 260;
  const nearCursor = cursor ? Math.hypot(cursor.x - baseCx, cursor.y - cy) < housingR * 3 : false;
  const fps = (busy || animating || blinking || nearCursor || bubbleAlpha > 0.01)
    ? 60
    : (state === 'sleeping' ? 8 : 20);
  if (fps >= 60) requestAnimationFrame(draw);
  else setTimeout(() => requestAnimationFrame(draw), 1000 / fps);
}
requestAnimationFrame(draw);

// ---- manual dragging + double-click to open Claude ----
// Press alone does NOT move the window: only past a small threshold does it become
// a real drag (so a click / double-click never nudges HAL out of place).
const DRAG_THRESHOLD = 4;
let downX = 0, downY = 0;
let lastShakeX = 0, shakeDir = 0, shakeTimes = [];
stage.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const L = layout();
  if (Math.hypot(e.offsetX - L.cx, e.offsetY - L.cy) > L.housingR * 1.05) return; // only grab HAL itself
  dragArmed = true; dragging = false; downX = e.screenX; downY = e.screenY;
  lastShakeX = e.screenX; shakeDir = 0; shakeTimes = [];
  ipcRenderer.send('drag-start', { x: e.screenX, y: e.screenY });
});
window.addEventListener('mousemove', (e) => {
  if (!dragArmed) return;
  if (!dragging) {
    if (Math.abs(e.screenX - downX) < DRAG_THRESHOLD && Math.abs(e.screenY - downY) < DRAG_THRESHOLD) return;
    dragging = true;                       // real drag begins
    stage.style.cursor = 'grabbing';       // open palm -> closed fist
  }
  // shake detection: enough rapid left/right reversals -> HAL gets dizzy
  const sdx = e.screenX - lastShakeX;
  if (Math.abs(sdx) > 6) {
    const dir = sdx > 0 ? 1 : -1;
    if (shakeDir && dir !== shakeDir) {
      const now = Date.now();
      shakeTimes.push(now);
      shakeTimes = shakeTimes.filter((v) => now - v < 1400);
      if (shakeTimes.length >= 4) {
        const wasDizzy = now < dizzyUntil;   // don't re-trigger while already dizzy
        dizzyUntil = now + 2800; shakeTimes = [];
        if (!wasDizzy) setQuote(SHAKE_LINE, 2600);
      }
    }
    shakeDir = dir; lastShakeX = e.screenX;
  }
  ipcRenderer.send('drag-move', { x: e.screenX, y: e.screenY });
});
window.addEventListener('mouseup', () => {
  if (!dragArmed) return;
  dragArmed = false; dragging = false;
  stage.style.cursor = 'pointer';          // back to the clickable finger
  ipcRenderer.send('drag-end');
});
stage.addEventListener('dblclick', (e) => {
  const L = layout();
  if (Math.hypot(e.offsetX - L.cx, e.offsetY - L.cy) < L.housingR * 1.05) {
    ipcRenderer.send('open-claude');
    // usually complies ("Opening the pod bay doors."), occasionally the famous refusal — still opens
    setQuote(Math.random() < 0.3 ? REFUSE_LINE : OPEN_LINE, 2600);
  }
});
window.addEventListener('contextmenu', (e) => { e.preventDefault(); ipcRenderer.send('pet-context-menu'); });
