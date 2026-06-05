export const DownloadManager = {
  async download(url, filename) {
    const options = {
      url,
      filename,
      conflictAction: 'uniquify',
      saveAs: false
    };
    return new Promise((resolve, reject) => {
      chrome.downloads.download(options, (downloadId) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(downloadId);
      });
    });
  },
  makeFilename(settings, index, suggestion) {
    const idx = String(index).padStart(3, '0');
    const template = settings.fileNamingTemplate || '{index}-{prompt}.png';
    let promptSlug = (suggestion || '').replace(/[^a-z0-9\-_.]/gi, '-').toLowerCase();
    if (!promptSlug) promptSlug = settings.downloadPrefix || 'image';
    const filename = template.replace(/\{index\}/gi, idx).replace(/\{prompt\}/gi, promptSlug);
    return filename;
  }
};

if (typeof globalThis.DownloadManager === 'undefined') globalThis.DownloadManager = DownloadManager;
