export const GalleryManager = {
  async add(entry) {
    const g = await Storage.get('gallery') || [];
    g.push(entry);
    await Storage.set({ gallery: g });
  },
  async getAll() {
    return await Storage.get('gallery') || [];
  }
};

if (typeof globalThis.GalleryManager === 'undefined') globalThis.GalleryManager = GalleryManager;
