const { ipcRenderer } = require('electron');
const $ = (id) => document.getElementById(id);

$('close').addEventListener('click', () => ipcRenderer.send('close-menu'));
$('act-speedtest').addEventListener('click', () => ipcRenderer.send('run-speedtest'));
$('act-stats').addEventListener('click', () => ipcRenderer.send('run-stats'));
$('act-focus').addEventListener('click', () => ipcRenderer.send('toggle-focus'));
$('act-water').addEventListener('click', () => ipcRenderer.send('toggle-water'));

// reminders accordion
let expanded = false;
function setExpanded(on) {
  expanded = on;
  $('rem-sub').style.display = on ? 'block' : 'none';
  $('rem-chev').style.transform = on ? 'rotate(90deg)' : '';
  reportSize();
}
$('act-reminders').addEventListener('click', () => setExpanded(!expanded));

// live status
let focus = null, tick = null;
function fmt(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function render() {
  if (focus && focus.running) {
    $('focus-name').textContent = '专注中 · ' + fmt(focus.endsAt - Date.now());
    $('focus-dot').classList.add('on');
  } else {
    $('focus-name').textContent = '专注 25 分';
    $('focus-dot').classList.remove('on');
  }
}
ipcRenderer.on('menu-status', (_e, st) => {
  focus = st.focus;
  $('water-desc').textContent = '每小时 · ' + (st.water ? '开' : '关');
  $('water-dot').classList.toggle('on', !!st.water);
  if (tick) { clearInterval(tick); tick = null; }
  render();
  if (focus && focus.running) tick = setInterval(render, 1000);
  // auto-expand when a reminder is active so the user can see it
  if ((focus && focus.running) || st.water) { if (!expanded) setExpanded(true); }
  else reportSize();
});

// report the card's real height so main can size the window snugly to it
function reportSize() {
  ipcRenderer.send('menu-size', Math.ceil(document.querySelector('.card').getBoundingClientRect().height));
}
window.addEventListener('load', reportSize);
