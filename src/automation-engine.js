export const AutomationEngine = {
  async processItem(item, deps) {
    const Logger = deps && deps.logger ? deps.logger : console;
    const settings = await SettingsManager.get();
    try {
      Logger.log(`Processing item ${item.id}`);
      const promptField = await this.findPromptField();
      if (!promptField) {
        Logger.error('Prompt field not found');
        return { status: 'failed', reason: 'prompt_field_not_found' };
      }
      await this.insertPrompt(promptField, item.prompt);
      Logger.log('Prompt Inserted');

      const verified = await this.verifyPrompt(promptField, item.prompt);
      if (!verified) {
        Logger.error('Prompt verification failed');
        return { status: 'failed', reason: 'prompt_verification_failed' };
      }

      const genBtn = await this.findGenerateButton();
      if (!genBtn) {
        Logger.error('Generate button not found');
        return { status: 'failed', reason: 'generate_button_not_found' };
      }
      genBtn.click();
      Logger.log('Generate Clicked');

      const started = await this.waitForGenerationStart(15000);
      if (!started) {
        Logger.error('Generation did not start');
        return { status: 'failed', reason: 'generation_not_started' };
      }
      Logger.log('Generation Started');

      const imageInfo = await this.waitForImageCompletion(120000);
      if (!imageInfo || !imageInfo.url) {
        Logger.error('Generation timed out or no image found');
        return { status: 'failed', reason: 'generation_timeout' };
      }
      Logger.log('Generation Completed');

      return { status: 'completed', imageUrl: imageInfo.url, filenameSuggestion: imageInfo.suggest || 'image.png' };
    } catch (err) {
      Logger.error('Automation exception', err);
      return { status: 'failed', reason: String(err) };
    }
  },

  async findPromptField() {
    const selectors = [
      '[contenteditable="true"]',
      'textarea',
      'input[type="text"]',
      'input[type="search"]'
    ];
    for (const sel of selectors) {
      const list = Array.from(document.querySelectorAll(sel)).filter(el => el.offsetParent !== null);
      for (const el of list) {
        const aria = (el.getAttribute('aria-label') || '') + ' ' + (el.placeholder || '') + ' ' + (el.getAttribute('role') || '');
        if (/prompt|describe|enter your prompt|ideas?/i.test(aria) || el.tagName.toLowerCase() === 'textarea' || el.isContentEditable) {
          return el;
        }
      }
    }
    const c = Array.from(document.querySelectorAll('[contenteditable="true"]')).find(e => e.offsetParent !== null);
    return c || null;
  },

  async insertPrompt(field, prompt) {
    if (field.isContentEditable) {
      field.focus();
      field.innerText = prompt;
      field.dispatchEvent(new InputEvent('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      field.focus();
      field.value = prompt;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 300));
  },

  async verifyPrompt(field, prompt) {
    const text = field.isContentEditable ? field.innerText : (field.value || '');
    return text.trim().startsWith(prompt.trim().slice(0, 10));
  },

  async findGenerateButton() {
    const candidates = Array.from(document.querySelectorAll('button,input[type="button"],[role="button"],a')).filter(e => e.offsetParent !== null);
    for (const c of candidates) {
      const text = (c.innerText || c.value || c.getAttribute('aria-label') || '').trim();
      if (/generate|create|produce|submit/i.test(text)) return c;
    }
    return null;
  },

  async waitForGenerationStart(timeout = 15000) {
    return new Promise((resolve) => {
      let resolved = false;
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.addedNodes && m.addedNodes.length) {
            for (const n of m.addedNodes) {
              if (n.nodeType === 1) {
                const txt = (n.textContent || '').toLowerCase();
                if (txt.includes('generating') || n.querySelector && n.querySelector('img')) {
                  if (!resolved) {
                    resolved = true;
                    observer.disconnect();
                    resolve(true);
                    return;
                  }
                }
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve(false);
        }
      }, timeout);
    });
  },

  async waitForImageCompletion(timeout = 120000) {
    return new Promise((resolve) => {
      const checkNode = (node) => {
        if (node.nodeType !== 1) return null;
        const imgs = Array.from(node.querySelectorAll ? node.querySelectorAll('img') : []);
        for (const img of imgs) {
          const src = img.src || img.getAttribute('src') || '';
          if (src && !src.startsWith('data:')) {
            return { url: src, suggest: this.sanitizeFilenameFromPrompt(node.textContent || img.alt || 'image') };
          }
        }
        const canv = node.querySelector ? node.querySelector('canvas') : null;
        if (canv) {
          try {
            const url = canv.toDataURL('image/png');
            return { url, suggest: this.sanitizeFilenameFromPrompt(node.textContent || 'image') };
          } catch (e) {
            return null;
          }
        }
        return null;
      };

      const existing = Array.from(document.querySelectorAll('img')).map(i => i).reverse();
      for (const ex of existing) {
        if (ex.src && !ex.src.startsWith('data:')) {
          resolve({ url: ex.src, suggest: this.sanitizeFilenameFromPrompt(ex.alt || ex.closest && ex.closest('div') ? ex.closest('div').textContent : 'image') });
          return;
        }
      }

      const obs = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.addedNodes && m.addedNodes.length) {
            for (const n of m.addedNodes) {
              const found = checkNode(n);
              if (found) {
                obs.disconnect();
                resolve(found);
                return;
              }
            }
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeout);
    });
  },

  sanitizeFilenameFromPrompt(text) {
    if (!text) return 'image';
    const s = text.trim().split(/\s+/).slice(0,6).join('-').replace(/[^a-z0-9\-_.]/gi, '').toLowerCase();
    return s || 'image';
  }
};

if (typeof globalThis.AutomationEngine === 'undefined') globalThis.AutomationEngine = AutomationEngine;
