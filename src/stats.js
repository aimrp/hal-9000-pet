const { ipcRenderer } = require('electron');

ipcRenderer.on('stats-data', (_e, cells) => {
  const g = document.getElementById('grid');
  g.innerHTML = '';
  for (const c of cells || []) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const l = document.createElement('span'); l.className = 'l'; l.textContent = c.label;
    const v = document.createElement('span'); v.className = 'v'; v.textContent = String(c.value);
    cell.appendChild(l); cell.appendChild(v);
    g.appendChild(cell);
  }
  // report full height (card + tail) so main can size/position the window
  ipcRenderer.send('stats-size', Math.ceil(document.querySelector('.wrap').getBoundingClientRect().height));
});
