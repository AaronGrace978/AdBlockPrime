'use strict';

importScripts(
  '../ai/engine.js',
  '../ai/network-analyzer.js',
  '../ai/ollama-client.js',
  '../ai/agent.js',
  '../ai/filter-lists.js',
  '../ai/feedback.js'
);

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
  theme: 'auto',
  aiAgent: true
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
  const result = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

async function getStats() {
  const result = await chrome.storage.local.get('stats');
  return { ...stats, ...result.stats };
}

async function saveStats() {
  await chrome.storage.local.set({ stats });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await saveSettings(DEFAULT_SETTINGS);
    await setupDeclarativeRules();
    await OllamaClient.loadConfig();
    await AdBlockAgent.loadState();
    await FeedbackSystem.loadState();
    await FilterListManager.loadState();
    FilterListManager.updateAllLists().catch(console.error);

    chrome.tabs.create({
      url: chrome.runtime.getURL('src/options/options.html#welcome')
    });
  }

  if (details.reason === 'update') {
    await setupDeclarativeRules();
    await OllamaClient.loadConfig();
    await AdBlockAgent.loadState();
    await FeedbackSystem.loadState();
    await FilterListManager.loadState();
    FilterListManager.checkForUpdates().catch(console.error);
  }
});

async function setupDeclarativeRules() {
  const settings = await getSettings();
  if (!settings.networkFilter) return;

  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules.map(r => r.id);

    if (existingIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingIds
      });
    }

    const rules = NetworkAnalyzer.generateBlockRules();
    const ruleChunks = chunkArray(rules, 100);

    for (const chunk of ruleChunks) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: chunk
      });
    }

    console.log(`[AdBlockPrime] Loaded ${rules.length} network blocking rules`);
  } catch (err) {
    console.error('[AdBlockPrime] Error setting up rules:', err);
  }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    console.error('[AdBlockPrime] Message error:', err);
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'GET_SETTINGS':
      return await getSettings();

    case 'SAVE_SETTINGS': {
      const current = await getSettings();
      const updated = { ...current, ...message.data };
      await saveSettings(updated);
      if (message.data.networkFilter !== undefined) {
        if (message.data.networkFilter) {
          await setupDeclarativeRules();
        } else {
          const rules = await chrome.declarativeNetRequest.getDynamicRules();
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: rules.map(r => r.id)
          });
        }
      }
      return { success: true };
    }

    case 'GET_STATS':
      return { ...stats, totalBlocked: stats.totalBlocked };

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
      stats.byType[message.data.tag || 'unknown'] =
        (stats.byType[message.data.tag || 'unknown'] || 0) + 1;

      stats.history.push({
        domain,
        reason: message.data.reason,
        timestamp: message.data.timestamp || Date.now()
      });

      if (stats.history.length > 500) {
        stats.history = stats.history.slice(-250);
      }

      await updateBadge(sender?.tab?.id);
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

    case 'ANALYZE_URL':
      return NetworkAnalyzer.analyzeRequest(
        message.url, message.resourceType, message.initiator
      );

    // --- AI Agent Messages ---

    case 'AGENT_ANALYZE_PAGE': {
      const settings = await getSettings();
      if (!settings.aiAgent) return { error: 'AI Agent disabled' };
      const results = await AdBlockAgent.analyzePage(message.data);
      if (results.blocked?.length > 0) {
        for (const b of results.blocked) {
          stats.totalBlocked++;
          stats.sessionsBlocked++;
        }
        await updateBadge(sender?.tab?.id);
      }
      return results;
    }

    case 'AGENT_CLASSIFY_ELEMENT': {
      const settings = await getSettings();
      if (!settings.aiAgent) return { isAd: false, confidence: 0 };
      return await AdBlockAgent.classifyElement(message.data);
    }

    case 'AGENT_SUGGEST_FILTERS': {
      return await AdBlockAgent.suggestFiltersForSite(
        message.domain, message.pageStructure
      );
    }

    case 'AGENT_GET_STATE':
      return AdBlockAgent.getState();

    case 'AGENT_GET_PATTERNS':
      return AdBlockAgent.getLearnedPatterns();

    case 'GET_OLLAMA_CONFIG':
      return OllamaClient.getConfig();

    case 'SAVE_OLLAMA_CONFIG': {
      await OllamaClient.saveConfig(message.data);
      return { success: true };
    }

    case 'TEST_OLLAMA_CONNECTION': {
      try {
        await OllamaClient.loadConfig();
        if (!OllamaClient.isConfigured()) {
          return { success: false, error: 'Not configured. Add your API key.' };
        }
        const result = await OllamaClient.generate('Say "AdBlockPrime connected" in 5 words or less.', {
          maxTokens: 30,
          temperature: 0.1
        });
        return { success: true, response: result.response };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    // --- Filter Lists ---

    case 'FILTER_LISTS_GET_STATS':
      return FilterListManager.getStats();

    case 'FILTER_LISTS_UPDATE':
      return await FilterListManager.updateAllLists();

    case 'FILTER_LISTS_TOGGLE': {
      FilterListManager.toggleList(message.key, message.enabled);
      return { success: true };
    }

    case 'FILTER_LISTS_GET_COSMETIC':
      return FilterListManager.getCosmeticRules();

    // --- Feedback ---

    case 'FEEDBACK_FALSE_POSITIVE':
      return FeedbackSystem.reportFalsePositive(
        message.domain, message.selector, message.elementInfo
      );

    case 'FEEDBACK_FALSE_NEGATIVE':
      return FeedbackSystem.reportFalseNegative(
        message.domain, message.selector, message.elementInfo
      );

    case 'FEEDBACK_GET_THRESHOLD':
      return { threshold: FeedbackSystem.getThresholdForDomain(message.domain) };

    case 'FEEDBACK_GET_STATS':
      return FeedbackSystem.getStats();

    case 'FEEDBACK_GET_REPORTS':
      return FeedbackSystem.getReports(message.limit || 50);

    // --- Activity Log ---

    case 'GET_ACTIVITY_LOG':
      return stats.history.slice(-(message.limit || 20)).reverse();

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

    await chrome.action.setBadgeText({
      text,
      tabId
    });
    await chrome.action.setBadgeBackgroundColor({
      color: '#6C5CE7',
      tabId
    });
    await chrome.action.setBadgeTextColor({
      color: '#FFFFFF',
      tabId
    });
  } catch {}
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    stats.sessionsBlocked = 0;
    await updateBadge(tabId);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await updateBadge(tabId);
});

setInterval(() => saveStats(), 30000);

OllamaClient.loadConfig().then(() => {
  AdBlockAgent.loadState().then(() => {
    const cfg = OllamaClient.getConfig();
    const providerName = (cfg.provider || 'ollama').charAt(0).toUpperCase() + (cfg.provider || 'ollama').slice(1);
    console.log(`[AdBlockPrime] AI Agent loaded. Provider: ${providerName}.`,
      OllamaClient.isConfigured() ? 'Connected.' : 'Not configured.');
  });
});

FeedbackSystem.loadState().catch(console.error);
FilterListManager.loadState().then(() => {
  FilterListManager.checkForUpdates().catch(console.error);
}).catch(console.error);

setInterval(() => {
  FilterListManager.checkForUpdates().catch(console.error);
}, 6 * 60 * 60 * 1000);

console.log('[AdBlockPrime] Service worker initialized');
