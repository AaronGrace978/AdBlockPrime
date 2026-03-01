'use strict';

const DEFAULT_SETTINGS = {
  enabled: true,
  stealthMode: true,
  cosmeticFilter: true,
  networkFilter: true,
  trackingProtection: true,
  whitelist: [],
  customRules: [],
  aggressiveMode: false,
  showBadge: true,
  theme: 'auto'
};

const stats = {
  totalBlocked: 0,
  sessionsBlocked: 0,
  byDomain: {},
  byType: {},
  history: [],
  startTime: Date.now()
};

async function getSettings() {
  const result = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

async function saveSettings(settings) {
  await browser.storage.local.set({ settings });
}

async function saveStats() {
  await browser.storage.local.set({ stats });
}

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await saveSettings(DEFAULT_SETTINGS);
    browser.tabs.create({
      url: browser.runtime.getURL('src/options/options.html#welcome')
    });
  }
});

browser.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const settings = await getSettings();
    if (!settings.enabled || !settings.networkFilter) return {};

    const url = details.url;
    const analysis = NetworkAnalyzer.analyzeRequest(url, details.type, details.originUrl);

    if (analysis.shouldBlock) {
      stats.totalBlocked++;
      stats.sessionsBlocked++;
      const domain = NetworkAnalyzer.extractDomain(url);
      stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1;
      stats.byType[details.type] = (stats.byType[details.type] || 0) + 1;

      updateBadge(details.tabId);
      return { cancel: true };
    }

    if (settings.trackingProtection) {
      const cleaned = NetworkAnalyzer.stripTrackingParams(url);
      if (cleaned !== url) {
        return { redirectUrl: cleaned };
      }
    }

    return {};
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

browser.runtime.onMessage.addListener((message, sender) => {
  return handleMessage(message, sender);
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'GET_SETTINGS':
      return await getSettings();

    case 'SAVE_SETTINGS': {
      const current = await getSettings();
      const updated = { ...current, ...message.data };
      await saveSettings(updated);
      return { success: true };
    }

    case 'GET_STATS':
      return { ...stats };

    case 'RESET_STATS':
      stats.totalBlocked = 0;
      stats.sessionsBlocked = 0;
      stats.byDomain = {};
      stats.byType = {};
      stats.history = [];
      stats.startTime = Date.now();
      await saveStats();
      return { success: true };

    case 'AD_BLOCKED': {
      stats.totalBlocked++;
      stats.sessionsBlocked++;
      const domain = new URL(message.data.url || 'https://unknown').hostname;
      stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1;
      updateBadge(sender?.tab?.id);
      return { success: true };
    }

    case 'TOGGLE_SITE': {
      const settings = await getSettings();
      const hostname = message.hostname;
      if (settings.whitelist.includes(hostname)) {
        settings.whitelist = settings.whitelist.filter(h => h !== hostname);
      } else {
        settings.whitelist.push(hostname);
      }
      await saveSettings(settings);
      return { whitelisted: settings.whitelist.includes(hostname) };
    }

    case 'ELEMENT_PICKED': {
      const s = await getSettings();
      if (!s.customRules.includes(message.data.selector)) {
        s.customRules.push(message.data.selector);
        await saveSettings(s);
      }
      return { success: true };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

async function updateBadge(tabId) {
  const settings = await getSettings();
  if (!settings.showBadge) return;

  try {
    const text = stats.sessionsBlocked > 999
      ? '999+'
      : stats.sessionsBlocked.toString();
    browser.browserAction.setBadgeText({ text, tabId });
    browser.browserAction.setBadgeBackgroundColor({ color: '#6C5CE7', tabId });
  } catch {}
}

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    stats.sessionsBlocked = 0;
    updateBadge(tabId);
  }
});

setInterval(() => saveStats(), 30000);
console.log('[AdBlockPrime] Firefox background script initialized');
