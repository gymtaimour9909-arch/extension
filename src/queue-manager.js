import { v4 as uuidv4 } from './utils-uuid.js';

export const QueueManager = {
  async _ensure() {
    const items = await Storage.get('queueItems') || [];
    return items;
  },
  async save(items) {
    await Storage.set({ queueItems: items });
  },
  async enqueueBulk(prompts) {
    const items = await this._ensure();
    const added = [];
    for (const p of prompts) {
      const id = (Date.now() + Math.floor(Math.random() * 10000)).toString(36);
      const it = {
        id,
        prompt: p.prompt || String(p),
        status: 'waiting',
        retries: 0,
        startedAt: null,
        completedAt: null,
        imageFile: null
      };
      items.push(it);
      added.push(it);
    }
    await this.save(items);
    return added;
  },
  isEmpty() {
    return false;
  },
  async getAll() {
    return await this._ensure();
  },
  getNext() {
    return null;
  },
  async getNextAsync() {
    const items = await this._ensure();
    return items.find(i => i.status === 'waiting') || null;
  },
  async updateStatus(id, status) {
    const items = await this._ensure();
    const it = items.find(x => x.id === id);
    if (!it) return;
    it.status = status;
    if (status === 'running') it.startedAt = new Date().toISOString();
    if (status === 'completed') it.completedAt = new Date().toISOString();
    await this.save(items);
  },
  async markFailed(id, reason) {
    const items = await this._ensure();
    const it = items.find(x => x.id === id);
    if (!it) return;
    it.status = 'failed';
    it.failedReason = reason;
    it.completedAt = new Date().toISOString();
    await this.save(items);
  },
  async incrementRetry(id) {
    const items = await this._ensure();
    const it = items.find(x => x.id === id);
    if (!it) return;
    it.retries = (it.retries || 0) + 1;
    await this.save(items);
  },
  async attachFile(id, filename) {
    const items = await this._ensure();
    const it = items.find(x => x.id === id);
    if (!it) return;
    it.imageFile = filename;
    await this.save(items);
  },
  async getById(id) {
    const items = await this._ensure();
    return items.find(x => x.id === id);
  },
  async getIndex(id) {
    const items = await this._ensure();
    const idx = items.findIndex(x => x.id === id);
    return idx >= 0 ? idx + 1 : 0;
  }
};

if (typeof globalThis.QueueManager === 'undefined') globalThis.QueueManager = {
  enqueueBulk: (items) => QueueManager.enqueueBulk(items),
  getNext: async () => (await QueueManager.getNextAsync()),
  updateStatus: (id, status) => QueueManager.updateStatus(id, status),
  markFailed: (id, reason) => QueueManager.markFailed(id, reason),
  incrementRetry: (id) => QueueManager.incrementRetry(id),
  attachFile: (id, fname) => QueueManager.attachFile(id, fname),
  getById: async (id) => QueueManager.getById(id),
  getAll: async () => QueueManager.getAll(),
  getIndex: async (id) => QueueManager.getIndex(id),
  isEmpty: async () => {
    const a = await QueueManager.getAll();
    return !(a || []).some(x => x.status === 'waiting' || x.status === 'running');
  }
};
