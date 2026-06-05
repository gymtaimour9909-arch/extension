// lightweight async wrapper around chrome.storage.local
export const Storage = {
  async get(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (res) => {
        if (typeof key === 'string') resolve(res[key]);
        else resolve(res);
      });
    });
  },
  async set(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, () => resolve(true));
    });
  },
  async remove(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, () => resolve(true));
    });
  }
};

if (typeof globalThis.Storage === 'undefined') globalThis.Storage = Storage;
