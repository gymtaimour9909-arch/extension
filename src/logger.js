export const Logger = {
  async _ensure() {
    const logs = await Storage.get('logs') || [];
    return logs;
  },
  async log(message) {
    await this._push('info', message);
  },
  async error(message, extra) {
    await this._push('error', `${message}${extra? ' - '+JSON.stringify(extra):''}`);
  },
  async _push(level, message) {
    const logs = await this._ensure();
    const entry = { time: new Date().toISOString(), level, message: String(message) };
    logs.push(entry);
    if (logs.length > 2000) logs.splice(0, logs.length - 2000);
    await Storage.set({ logs });
  },
  async getAll() {
    return await Storage.get('logs') || [];
  },
  async clear() {
    await Storage.set({ logs: [] });
  }
};

if (typeof globalThis.Logger === 'undefined') globalThis.Logger = Logger;
