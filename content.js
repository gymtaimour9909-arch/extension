import './src/automation-engine.js';
import './src/logger.js';
import './src/storage.js';
import './src/settings-manager.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.action === 'process-item') {
        const item = msg.item;
        const result = await AutomationEngine.processItem(item, {
          logger: Logger,
          settingsManager: SettingsManager
        });
        if (result.status === 'completed' && result.imageUrl) {
          chrome.runtime.sendMessage({ action: 'item-completed', itemId: item.id, imageUrl: result.imageUrl, filenameSuggestion: result.filenameSuggestion }, (res) => {});
          sendResponse({ ok: true });
        } else {
          chrome.runtime.sendMessage({ action: 'item-failed', itemId: item.id, reason: result.reason || 'unknown' }, (res) => {});
          sendResponse({ ok: false, reason: result.reason || 'unknown' });
        }
      }
    } catch (err) {
      chrome.runtime.sendMessage({ action: 'item-failed', itemId: msg.item && msg.item.id, reason: String(err) }, (res) => {});
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true;
});
