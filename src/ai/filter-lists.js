'use strict';

const FilterListManager = (() => {

  const COMMUNITY_LISTS = {
    easylist: {
      name: 'EasyList',
      url: 'https://easylist.to/easylist/easylist.txt',
      description: 'Primary ad blocking filter list',
      enabled: true
    },
    easyprivacy: {
      name: 'EasyPrivacy',
      url: 'https://easylist.to/easylist/easyprivacy.txt',
      description: 'Tracking protection filter list',
      enabled: true
    },
    fanboy_annoyances: {
      name: 'Fanboy Annoyances',
      url: 'https://secure.fanboy.co.nz/fanboy-annoyance.txt',
      description: 'Cookie notices, popups, social widgets',
      enabled: true
    },
    peter_lowe: {
      name: "Peter Lowe's Ad List",
      url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0',
      description: 'Curated ad server blocklist',
      enabled: true
    }
  };

  const UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 24h

  let parsedDomains = new Set();
  let parsedCosmeticRules = [];
  let lastUpdate = 0;

  async function loadState() {
    try {
      const stored = await chrome.storage.local.get('filterLists');
      if (stored.filterLists) {
        parsedDomains = new Set(stored.filterLists.domains || []);
        parsedCosmeticRules = stored.filterLists.cosmetic || [];
        lastUpdate = stored.filterLists.lastUpdate || 0;
      }
    } catch {}
  }

  async function saveState() {
    await chrome.storage.local.set({
      filterLists: {
        domains: Array.from(parsedDomains).slice(0, 50000),
        cosmetic: parsedCosmeticRules.slice(0, 5000),
        lastUpdate
      }
    });
  }

  function parseFilterLine(line) {
    line = line.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) return null;

    // Domain blocking: ||domain.com^
    const domainMatch = line.match(/^\|\|([a-z0-9.-]+)\^?\s*$/i);
    if (domainMatch) {
      return { type: 'domain', value: domainMatch[1] };
    }

    // Cosmetic filter: ##.selector or domain##.selector
    const cosmeticMatch = line.match(/^([^#]*?)##(.+)$/);
    if (cosmeticMatch) {
      const selector = cosmeticMatch[2].trim();
      if (selector && !selector.includes(':has-text') && !selector.includes(':xpath') &&
          !selector.includes(':matches-css') && !selector.includes(':upward')) {
        try {
          document.createElement('div').matches(selector);
          return { type: 'cosmetic', value: selector, domain: cosmeticMatch[1] || '*' };
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  async function fetchAndParseList(listKey) {
    const list = COMMUNITY_LISTS[listKey];
    if (!list || !list.enabled) return { domains: 0, cosmetic: 0 };

    try {
      const response = await fetch(list.url, {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const lines = text.split('\n');

      let domainCount = 0;
      let cosmeticCount = 0;

      for (const line of lines) {
        const parsed = parseFilterLine(line);
        if (!parsed) continue;

        if (parsed.type === 'domain') {
          parsedDomains.add(parsed.value);
          domainCount++;
        } else if (parsed.type === 'cosmetic' && parsed.domain === '*') {
          if (!parsedCosmeticRules.includes(parsed.value)) {
            parsedCosmeticRules.push(parsed.value);
            cosmeticCount++;
          }
        }
      }

      console.log(`[AdBlockPrime] ${list.name}: +${domainCount} domains, +${cosmeticCount} cosmetic rules`);
      return { domains: domainCount, cosmetic: cosmeticCount };
    } catch (err) {
      console.error(`[AdBlockPrime] Failed to fetch ${list.name}:`, err.message);
      return { domains: 0, cosmetic: 0, error: err.message };
    }
  }

  async function updateAllLists() {
    console.log('[AdBlockPrime] Updating community filter lists...');
    const results = {};

    for (const key of Object.keys(COMMUNITY_LISTS)) {
      if (COMMUNITY_LISTS[key].enabled) {
        results[key] = await fetchAndParseList(key);
      }
    }

    lastUpdate = Date.now();
    await saveState();

    const totalDomains = parsedDomains.size;
    const totalCosmetic = parsedCosmeticRules.length;
    console.log(`[AdBlockPrime] Filter update complete: ${totalDomains} domains, ${totalCosmetic} cosmetic rules`);

    return { totalDomains, totalCosmetic, results, lastUpdate };
  }

  async function checkForUpdates() {
    if (Date.now() - lastUpdate > UPDATE_INTERVAL) {
      return await updateAllLists();
    }
    return null;
  }

  function isDomainBlocked(domain) {
    if (parsedDomains.has(domain)) return true;
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      if (parsedDomains.has(parts.slice(i).join('.'))) return true;
    }
    return false;
  }

  function getCosmeticRules() {
    return [...parsedCosmeticRules];
  }

  function getStats() {
    return {
      totalDomains: parsedDomains.size,
      totalCosmetic: parsedCosmeticRules.length,
      lastUpdate,
      lists: Object.entries(COMMUNITY_LISTS).map(([key, list]) => ({
        key,
        name: list.name,
        enabled: list.enabled,
        description: list.description
      }))
    };
  }

  function toggleList(key, enabled) {
    if (COMMUNITY_LISTS[key]) {
      COMMUNITY_LISTS[key].enabled = enabled;
    }
  }

  function generateDynamicRules(startId = 1000) {
    const rules = [];
    let id = startId;
    const domainArray = Array.from(parsedDomains).slice(0, 4000);

    for (const domain of domainArray) {
      rules.push({
        id: id++,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: `||${domain}`,
          resourceTypes: ['script', 'image', 'sub_frame', 'xmlhttprequest', 'ping', 'media', 'other']
        }
      });
    }

    return rules;
  }

  return {
    loadState,
    saveState,
    updateAllLists,
    checkForUpdates,
    isDomainBlocked,
    getCosmeticRules,
    getStats,
    toggleList,
    generateDynamicRules,
    COMMUNITY_LISTS
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FilterListManager;
}
