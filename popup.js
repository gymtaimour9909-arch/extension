import './src/storage.js';
import './src/logger.js';
import './src/queue-manager.js';
import './src/settings-manager.js';
import './src/gallery-manager.js';

const $ = (sel) => document.querySelector(sel);
const tabs = document.querySelectorAll('.tab');
tabs.forEach(t => t.addEventListener('click', (e) => {
  tabs.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.getElementById(t.dataset.tab).classList.add('active');
}));

$('#startBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'start-queue' }, () => {});
});
$('#pauseBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'pause-queue' }, () => {});
});
$('#resumeBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'resume-queue' }, () => {});
});
$('#stopBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stop-queue' }, () => {});
});

$('#enqueueBtn').addEventListener('click', async () => {
  const raw = $('#bulkPrompts').value || '';
  const lines = raw.split('\n').map(s => s.trim()).filter(Boolean).map(p => ({ prompt: p }));
  if (!lines.length) return alert('No prompts found');
  chrome.runtime.sendMessage({ action: 'enqueue-items', items: lines }, (res) => {
    refreshQueue();
  });
});

$('#promptsFile').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    $('#bulkPrompts').value = r.result;
  };
  r.readAsText(f);
});

async function refreshQueue() {
  const resp = await sendBg({ action: 'get-status' });
  const queue = resp.queue || [];
  const list = $('#queueList');
  list.innerHTML = '';
  let counts = { waiting: 0, running: 0, completed: 0, failed: 0 };
  for (const it of queue) {
    counts[it.status] = (counts[it.status] || 0) + 1;
    const el = document.createElement('div');
    el.className = 'queue-item';
    el.innerHTML = `<div class="meta"><strong>#${it.id}</strong> <span>${it.status}</span></div>
      <div class="prompt">${escapeHtml(it.prompt)}</div>
      <div class="meta">Retries: ${it.retries||0} ${it.imageFile?`| File: ${it.imageFile}`:''}</div>`;
    list.appendChild(el);
  }
  $('#queueCounts').textContent = `Waiting: ${counts.waiting||0} | Running: ${counts.running||0} | Completed: ${counts.completed||0} | Failed: ${counts.failed||0}`;
  const gallery = await GalleryManager.getAll();
  renderGallery(gallery || []);
  renderLogs(resp.logs || []);
}

function renderGallery(items) {
  const g = $('#galleryList');
  g.innerHTML = '';
  for (const it of items) {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = `<div class="thumb"><img src="file://${it.filename}" alt="${escapeHtml(it.prompt)}" onerror="this.style.opacity=0.6" /></div>
      <div class="meta">${escapeHtml(it.prompt)}<div>${it.filename}</div><div>${it.date}</div></div>`;
    g.appendChild(c);
  }
}

function renderLogs(logs) {
  const l = $('#logList');
  l.innerHTML = '';
  for (const entry of (logs || []).slice().reverse()) {
    const el = document.createElement('div');
    el.className = 'log-entry';
    el.textContent = `${entry.time} | ${entry.level.toUpperCase()} | ${entry.message}`;
    l.appendChild(el);
  }
}

$('#saveSettings').addEventListener('click', async () => {
  const s = {
    delayBetweenJobs: Number($('#delayBetweenJobs').value || 1000),
    retryCount: Number($('#retryCount').value || 2),
    autoDownload: $('#autoDownload').checked,
    autoRetry: $('#autoRetry').checked,
    downloadPrefix: $('#downloadPrefix').value || 'image',
    fileNamingTemplate: $('#fileNamingTemplate').value || '{index}-{prompt}.png'
  };
  await SettingsManager.set(s);
  alert('Settings saved');
});

$('#clearLogs').addEventListener('click', async () => {
  await Logger.clear();
  refreshQueue();
});

function escapeHtml(s){ return (s||'').replace(/[&<>\"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function sendBg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => resolve(res || {}));
  });
}

(async () => {
  const s = await SettingsManager.get();
  $('#delayBetweenJobs').value = s.delayBetweenJobs || 1000;
  $('#retryCount').value = s.retryCount || 2;
  $('#autoDownload').checked = !!s.autoDownload;
  $('#autoRetry').checked = !!s.autoRetry;
  $('#downloadPrefix').value = s.downloadPrefix || 'image';
  $('#fileNamingTemplate').value = s.fileNamingTemplate || '{index}-{prompt}.png';
  refreshQueue();
  setInterval(refreshQueue, 1500);
})();
