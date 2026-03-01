'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const app = document.getElementById('app');
  const toggleEnabled = document.getElementById('toggle-enabled');
  const toggleStealth = document.getElementById('toggle-stealth');
  const toggleCosmetic = document.getElementById('toggle-cosmetic');
  const toggleNetwork = document.getElementById('toggle-network');
  const toggleTracking = document.getElementById('toggle-tracking');
  const btnWhitelist = document.getElementById('btn-whitelist');
  const btnPicker = document.getElementById('btn-picker');
  const btnSettings = document.getElementById('btn-settings');
  const toggleAgent = document.getElementById('toggle-agent');
  const btnAgentScan = document.getElementById('btn-agent-scan');
  const agentStatus = document.getElementById('agent-status');
  const agentResult = document.getElementById('agent-result');
  const agentPanel = document.getElementById('agent-panel');
  const agentAnalyses = document.getElementById('agent-analyses');
  const agentFound = document.getElementById('agent-found');
  const agentPatterns = document.getElementById('agent-patterns');
  const siteLabel = document.getElementById('site-label');
  const siteName = document.getElementById('site-name');
  const statBlocked = document.getElementById('stat-blocked');
  const statTrackers = document.getElementById('stat-trackers');
  const statPage = document.getElementById('stat-page');
  const statSpeed = document.getElementById('stat-speed');

  let currentTab = null;
  let currentHostname = '';
  let settings = null;

  async function init() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      currentTab = tab;
      if (tab?.url) {
        try {
          currentHostname = new URL(tab.url).hostname;
          siteName.textContent = currentHostname;
        } catch {
          siteName.textContent = 'N/A';
        }
      }

      settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      applySettings(settings);

      const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
      updateStats(stats);

      try {
        const pageStats = await chrome.tabs.sendMessage(currentTab.id, { type: 'GET_PAGE_STATS' });
        if (pageStats) {
          animateNumber(statPage, pageStats.totalBlocked);
        }
      } catch {}

      await loadAgentState();

    } catch (err) {
      console.error('Init error:', err);
      siteName.textContent = 'Error loading';
    }
  }

  function applySettings(s) {
    if (!s) return;
    toggleEnabled.checked = s.enabled;
    toggleStealth.checked = s.stealthMode;
    toggleCosmetic.checked = s.cosmeticFilter;
    toggleNetwork.checked = s.networkFilter;
    toggleTracking.checked = s.trackingProtection;

    if (!s.enabled) {
      app.classList.add('disabled');
      siteLabel.textContent = 'Protection Disabled';
      siteLabel.classList.add('disabled');
    } else if (s.whitelist?.includes(currentHostname)) {
      siteLabel.textContent = 'Site Whitelisted';
      siteLabel.classList.add('disabled');
      btnWhitelist.classList.add('active');
      btnWhitelist.querySelector('span, svg + *') ||
        (btnWhitelist.innerHTML = btnWhitelist.innerHTML.replace('Whitelist Site', 'Whitelisted'));
    } else {
      app.classList.remove('disabled');
      siteLabel.textContent = 'Protection Active';
      siteLabel.classList.remove('disabled');
    }
  }

  function updateStats(s) {
    if (!s) return;
    animateNumber(statBlocked, s.totalBlocked);
    animateNumber(statTrackers, Math.floor(s.totalBlocked * 0.4));
    animateNumber(statPage, s.sessionsBlocked);
    const timeSaved = s.totalBlocked * 50;
    if (timeSaved >= 1000) {
      statSpeed.textContent = (timeSaved / 1000).toFixed(1) + 's';
    } else {
      statSpeed.textContent = timeSaved + 'ms';
    }
  }

  function animateNumber(el, target) {
    const start = parseInt(el.textContent) || 0;
    if (start === target) return;
    const duration = 400;
    const startTime = Date.now();

    function update() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (target - start) * eased);
      el.textContent = current.toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  async function saveSetting(key, value) {
    settings[key] = value;
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', data: { [key]: value } });
  }

  toggleEnabled.addEventListener('change', async () => {
    const enabled = toggleEnabled.checked;
    await saveSetting('enabled', enabled);
    if (enabled) {
      app.classList.remove('disabled');
      siteLabel.textContent = 'Protection Active';
      siteLabel.classList.remove('disabled');
    } else {
      app.classList.add('disabled');
      siteLabel.textContent = 'Protection Disabled';
      siteLabel.classList.add('disabled');
    }
    if (currentTab?.id) {
      chrome.tabs.reload(currentTab.id);
    }
  });

  toggleStealth.addEventListener('change', () => saveSetting('stealthMode', toggleStealth.checked));
  toggleCosmetic.addEventListener('change', () => saveSetting('cosmeticFilter', toggleCosmetic.checked));
  toggleNetwork.addEventListener('change', () => saveSetting('networkFilter', toggleNetwork.checked));
  toggleTracking.addEventListener('change', () => saveSetting('trackingProtection', toggleTracking.checked));

  btnWhitelist.addEventListener('click', async () => {
    if (!currentHostname) return;
    const result = await chrome.runtime.sendMessage({
      type: 'TOGGLE_SITE',
      hostname: currentHostname
    });

    if (result.whitelisted) {
      btnWhitelist.classList.add('active');
      siteLabel.textContent = 'Site Whitelisted';
      siteLabel.classList.add('disabled');
    } else {
      btnWhitelist.classList.remove('active');
      siteLabel.textContent = 'Protection Active';
      siteLabel.classList.remove('disabled');
    }

    if (currentTab?.id) {
      chrome.tabs.reload(currentTab.id);
    }
  });

  btnPicker.addEventListener('click', async () => {
    if (!currentTab?.id) return;
    try {
      await chrome.tabs.sendMessage(currentTab.id, { type: 'TOGGLE_ELEMENT_PICKER' });
      window.close();
    } catch {
      console.error('Could not activate element picker');
    }
  });

  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // --- AI Agent ---

  const PROVIDER_NAMES = { ollama: 'Ollama', openai: 'OpenAI', anthropic: 'Anthropic', mistral: 'Mistral' };

  async function loadAgentState() {
    try {
      const providerConfig = await chrome.runtime.sendMessage({ type: 'GET_OLLAMA_CONFIG' });
      const isConfigured = providerConfig?.enabled && providerConfig?.apiKey &&
        providerConfig.apiKey.length > 5;
      const providerLabel = PROVIDER_NAMES[providerConfig?.provider] || 'AI';

      toggleAgent.checked = settings?.aiAgent ?? true;

      if (!isConfigured) {
        agentStatus.textContent = 'Setup Needed';
        agentStatus.className = 'agent-status unconfigured';
        btnAgentScan.disabled = true;
      } else {
        agentStatus.textContent = providerLabel;
        agentStatus.className = 'agent-status';
        btnAgentScan.disabled = false;
      }

      const state = await chrome.runtime.sendMessage({ type: 'AGENT_GET_STATE' });
      if (state) {
        agentAnalyses.textContent = state.totalAnalyses || 0;
        agentFound.textContent = state.totalAdsFound || 0;
        agentPatterns.textContent = state.totalPatternsLearned || 0;
      }

      if (!settings?.aiAgent) {
        agentPanel.classList.add('disabled');
      }
    } catch {}
  }

  toggleAgent.addEventListener('change', async () => {
    await saveSetting('aiAgent', toggleAgent.checked);
    if (toggleAgent.checked) {
      agentPanel.classList.remove('disabled');
    } else {
      agentPanel.classList.add('disabled');
    }
  });

  btnAgentScan.addEventListener('click', async () => {
    if (!currentTab?.id) return;

    btnAgentScan.disabled = true;
    btnAgentScan.classList.add('scanning');
    btnAgentScan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Scanning...`;
    agentStatus.textContent = 'Scanning';
    agentStatus.className = 'agent-status scanning';
    agentResult.style.display = 'none';

    try {
      const result = await chrome.tabs.sendMessage(currentTab.id, { type: 'AGENT_SCAN' });

      if (result?.error) {
        agentStatus.textContent = 'Error';
        agentStatus.className = 'agent-status error';
        agentResult.style.display = 'block';
        agentResult.innerHTML = `<strong>Error:</strong> ${result.error}`;
      } else {
        const adsBlocked = result?.blocked?.length || 0;
        const patternsLearned = result?.patterns?.length || 0;
        const summary = result?.report?.summary || `Found ${adsBlocked} ads`;

        agentStatus.textContent = 'Complete';
        agentStatus.className = 'agent-status';
        agentResult.style.display = 'block';
        agentResult.innerHTML = `<strong>${adsBlocked} ads blocked</strong>, ${patternsLearned} patterns learned<br>${summary}`;

        await loadAgentState();
      }
    } catch (err) {
      agentStatus.textContent = 'Error';
      agentStatus.className = 'agent-status error';
      agentResult.style.display = 'block';
      agentResult.innerHTML = `<strong>Error:</strong> ${err.message || 'Could not scan page'}`;
    }

    btnAgentScan.disabled = false;
    btnAgentScan.classList.remove('scanning');
    btnAgentScan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Deep Scan Page`;
  });

  // --- Activity Log ---

  const activityToggle = document.getElementById('activity-toggle');
  const activityBody = document.getElementById('activity-body');
  const activityChevron = document.getElementById('activity-chevron');
  const activityList = document.getElementById('activity-list');

  activityToggle.addEventListener('click', async () => {
    const isOpen = activityBody.style.display !== 'none';
    activityBody.style.display = isOpen ? 'none' : 'block';
    activityChevron.classList.toggle('open', !isOpen);

    if (!isOpen) {
      try {
        const log = await chrome.runtime.sendMessage({ type: 'GET_ACTIVITY_LOG', limit: 15 });
        if (log?.length > 0) {
          activityList.innerHTML = log.map(item => {
            const ago = formatTimeAgo(item.timestamp);
            const reason = (item.reason || '').substring(0, 40);
            return `<div class="activity-item">
              <span class="activity-dot"></span>
              <span class="activity-domain">${item.domain || 'unknown'}</span>
              <span class="activity-reason">${reason}</span>
              <span class="activity-time">${ago}</span>
            </div>`;
          }).join('');
        } else {
          activityList.innerHTML = '<div class="activity-empty">No activity yet</div>';
        }
      } catch {
        activityList.innerHTML = '<div class="activity-empty">Could not load</div>';
      }
    }
  });

  function formatTimeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5) return 'now';
    if (diff < 60) return diff + 's';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    return Math.floor(diff / 86400) + 'd';
  }

  // --- Feedback ---

  const btnFP = document.getElementById('btn-false-positive');
  const btnFN = document.getElementById('btn-false-negative');

  btnFP.addEventListener('click', async () => {
    if (!currentHostname) return;
    await chrome.runtime.sendMessage({
      type: 'FEEDBACK_FALSE_POSITIVE',
      domain: currentHostname,
      selector: '',
      elementInfo: { url: currentTab?.url }
    });
    btnFP.classList.add('sent');
    btnFP.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Reported`;
    setTimeout(() => {
      btnFP.classList.remove('sent');
      btnFP.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg> Overblocked`;
    }, 3000);
  });

  btnFN.addEventListener('click', async () => {
    if (!currentHostname) return;
    await chrome.runtime.sendMessage({
      type: 'FEEDBACK_FALSE_NEGATIVE',
      domain: currentHostname,
      selector: '',
      elementInfo: { url: currentTab?.url }
    });
    btnFN.classList.add('sent');
    btnFN.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Reported`;

    try {
      await chrome.tabs.sendMessage(currentTab.id, { type: 'AGENT_SCAN' });
    } catch {}

    setTimeout(() => {
      btnFN.classList.remove('sent');
      btnFN.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg> Ads Visible`;
    }, 3000);
  });

  init();
});
