const { ipcRenderer } = require('electron');

const slider = document.getElementById('size');
const label = document.getElementById('v');

(async () => {
  const { size, min, max } = await ipcRenderer.invoke('get-size');
  slider.min = min;
  slider.max = max;
  slider.value = size;
  label.textContent = size;
})();

// live preview while dragging
slider.addEventListener('input', () => {
  label.textContent = slider.value;
  ipcRenderer.send('preview-size', Number(slider.value));
});

// persist when released / changed
slider.addEventListener('change', () => {
  ipcRenderer.send('commit-size', Number(slider.value));
});

// mute toggle
const mute = document.getElementById('mute');
ipcRenderer.invoke('get-muted').then((v) => { mute.checked = !!v; });
mute.addEventListener('change', () => ipcRenderer.send('set-muted', mute.checked));

// close button
document.getElementById('close').addEventListener('click', () => ipcRenderer.send('close-settings'));
