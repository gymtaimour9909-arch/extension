import './src/storage.js';
import './src/logger.js';
import './src/settings-manager.js';
import './src/queue-manager.js';
import './src/download-manager.js';
import './src/gallery-manager.js';

const BG = {
  running: false,
  paused: false,
  currentTabId: null
};

async function findFlowTab() {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    try {
      if (!t.url) continue;
      const u = new URL(t.url);
      if (u.hostname.includes('flow.google.com') || (u.hostname.includes('google.com') && u.pathname.includes('/flow'))) {
        return t;
      }
    } catch (e) {
      // ignore
    }
  }
  return null;
}

async function openFlowTab() {
  const tab = await chrome.tabs.create({ url: 'https://flow.google.com', active: true });
  return new Promise((resolve) => {
    const listener = (tabId, changeInfo) => {
      if (tabId !== tab.id) return;
      if (changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => resolve(tab), 6000);
  });
}

async function ensureFlowTab() {
  let tab = await findFlowTab();
  if (!tab) tab = await openFlowTab();
  return tab;
}

async function processQueueLoop() {
  if (BG.paused) {
    Logger.log('Queue paused');
    return;
  }
  const isEmpty = await QueueManager.isEmpty();
  if (isEmpty) {
    Logger.log('Queue empty — stopping');
    BG.running = false;
    chrome.runtime.sendMessage({ action: 'queue-stopped' });
    return;
  }

  const next = await QueueManager.getNext();
  if (!next) {
    Logger.log('No waiting item found');
    BG.running = false;
    chrome.runtime.sendMessage({ action: 'queue-stopped' });
    return;
  }

  QueueManager.updateStatus(next.id, 'running');
  Logger.log(`Queue Started item ${next.id}`);

  const tab = await ensureFlowTab();
  if (!tab || !tab.id) {
    Logger.error('Could not find or open Flow tab');
    await QueueManager.markFailed(next.id, 'no_flow_tab');
    scheduleNext();
    return;
  }
  BG.currentTabId = tab.id;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'process-item', item: next });
  } catch (err) {
    Logger.error('Failed to send message to content script', err);
    await QueueManager.markFailed(next.id, 'message_send_error');
    scheduleNext();
  }
}

function scheduleNext() {
  SettingsManager.get().then((s) => {
    const delay = Number(s.delayBetweenJobs || 1000);
    setTimeout(() => {
      processQueueLoop();
    }, delay);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {
        case 'start-queue':
          if (BG.running) {
            sendResponse({ ok: true, reason: 'already_running' });
            break;
          }
          BG.running = true;
          BG.paused = false;
          Logger.log('Queue Started (background)');
          sendResponse({ ok: true });
          await processQueueLoop();
          break;
        case 'stop-queue':
          BG.running = false;
          BG.paused = false;
          Logger.log('Queue Stopped');
          sendResponse({ ok: true });
          break;
        case 'pause-queue':
          BG.paused = true;
          Logger.log('Queue Paused');
          sendResponse({ ok: true });
          break;
        case 'resume-queue':
          if (BG.running && BG.paused) {
            BG.paused = false;
            Logger.log('Queue Resumed');
            sendResponse({ ok: true });
            await processQueueLoop();
          } else {
            sendResponse({ ok: false, reason: 'not_paused_or_not_running' });
          }
          break;
        case 'enqueue-items':
          const added = await QueueManager.enqueueBulk(msg.items);
          Logger.log(`Enqueued ${added.length} items`);
          sendResponse({ ok: true, addedCount: added.length });
          break;
        case 'download-image':
          const { url, filename, itemId } = msg;
          try {
            const id = await DownloadManager.download(url, filename);
            Logger.log(`Download started ${filename} -> id:${id}`);
            if (itemId) {
              await QueueManager.attachFile(itemId, filename);
              await QueueManager.updateStatus(itemId, 'completed');
            }
            sendResponse({ ok: true, downloadId: id });
            scheduleNext();
          } catch (e) {
            Logger.error('Download failed', e);
            if (itemId) {
              await QueueManager.markFailed(itemId, 'download_failed');
            }
            sendResponse({ ok: false, error: e && e.message });
            scheduleNext();
          }
          break;
        case 'item-failed':
          Logger.error(`Item failed ${msg.itemId}`, msg.reason);
          const cfg = await SettingsManager.get();
          const item = await QueueManager.getById(msg.itemId);
          if (item) {
            if ((item.retries || 0) < (cfg.retryCount || 0) && cfg.autoRetry) {
              await QueueManager.incrementRetry(item.id);
              await QueueManager.updateStatus(item.id, 'waiting');
              Logger.log(`Retrying item ${item.id}`);
            } else {
              await QueueManager.updateStatus(item.id, 'failed');
              Logger.log(`Marking item ${item.id} failed`);
            }
          }
          sendResponse({ ok: true });
          scheduleNext();
          break;
        case 'item-completed':
          Logger.log(`Item completed ${msg.itemId} image:${msg.imageUrl}`);
          const settings = await SettingsManager.get();
          const index = await QueueManager.getIndex(msg.itemId);
          const filename = DownloadManager.makeFilename(settings, index, msg.filenameSuggestion || 'image.png');
          if (settings.autoDownload) {
            try {
              const dlId = await DownloadManager.download(msg.imageUrl, filename);
              await QueueManager.attachFile(msg.itemId, filename);
              await QueueManager.updateStatus(msg.itemId, 'completed');
              await GalleryManager.add({ prompt: (await QueueManager.getById(msg.itemId)).prompt, filename, date: new Date().toISOString() });
              Logger.log(`Downloaded ${filename} id:${dlId}`);
            } catch (e) {
              Logger.error('Auto-download failed', e);
              await QueueManager.markFailed(msg.itemId, 'auto_download_failed');
            }
          } else {
            await QueueManager.attachFile(msg.itemId, filename);
            await QueueManager.updateStatus(msg.itemId, 'completed');
            await GalleryManager.add({ prompt: (await QueueManager.getById(msg.itemId)).prompt, filename, date: new Date().toISOString() });
          }
          sendResponse({ ok: true });
          scheduleNext();
          break;
        case 'get-status':
          sendResponse({ ok: true, queue: await QueueManager.getAll(), settings: await SettingsManager.get(), logs: await Logger.getAll() });
          break;
        default:
          sendResponse({ ok: false, reason: 'unknown_action' });
      }
    } catch (err) {
      console.error('Background message handler error', err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  Logger.log('Extension installed');
});
