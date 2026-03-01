'use strict';

(async () => {
  let settings = null;

  try {
    settings = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
  } catch {
    settings = { enabled: true, stealthMode: true, cosmeticFilter: true };
  }

  if (!settings || !settings.enabled) return;

  const hostname = window.location.hostname;
  if (settings.whitelist && settings.whitelist.includes(hostname)) return;

  if (settings.stealthMode !== false) {
    StealthModule.init();
  }

  if (settings.cosmeticFilter !== false) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => CosmeticFilter.init());
    } else {
      CosmeticFilter.init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ElementDetector.init());
  } else {
    ElementDetector.init();
  }

  browser.runtime.onMessage.addListener((message) => {
    switch (message.type) {
      case 'GET_PAGE_STATS':
        return Promise.resolve(ElementDetector.getStats());
      case 'RESCAN_PAGE':
        ElementDetector.scanAndHide();
        CosmeticFilter.fixEmptySpaces();
        return Promise.resolve({ success: true });
      case 'ADD_CUSTOM_RULE':
        CosmeticFilter.addCustomRule(message.selector);
        return Promise.resolve({ success: true });
      default:
        return Promise.resolve({ error: 'Unknown' });
    }
  });
})();
