export const SettingsManager = {
  async get() {
    const defaults = {
      delayBetweenJobs: 1000,
      retryCount: 2,
      autoDownload: true,
      autoRetry: true,
      downloadPrefix: 'image',
      fileNamingTemplate: '{index}-{prompt}.png'
    };
    const stored = await Storage.get('settings') || {};
    return Object.assign({}, defaults, stored);
  },
  async set(obj) {
    const cur = await this.get();
    const next = Object.assign({}, cur, obj);
    await Storage.set({ settings: next });
  }
};

if (typeof globalThis.SettingsManager === 'undefined') globalThis.SettingsManager = SettingsManager;
