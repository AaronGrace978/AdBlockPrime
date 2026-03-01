'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.section');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`section-${item.dataset.section}`).classList.add('active');
    });
  });

  if (window.location.hash === '#welcome') {
    navItems.forEach(n => n.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));
    document.querySelector('[data-section="about"]').classList.add('active');
    document.getElementById('section-about').classList.add('active');
  }

  let settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });

  const toggleMap = {
    'opt-enabled': 'enabled',
    'opt-stealth': 'stealthMode',
    'opt-aggressive': 'aggressiveMode',
    'opt-network': 'networkFilter',
    'opt-cosmetic': 'cosmeticFilter',
    'opt-tracking': 'trackingProtection',
    'opt-badge': 'showBadge'
  };

  for (const [elId, key] of Object.entries(toggleMap)) {
    const el = document.getElementById(elId);
    if (el) {
      el.checked = settings[key] ?? false;
      el.addEventListener('change', async () => {
        settings[key] = el.checked;
        await chrome.runtime.sendMessage({
          type: 'SAVE_SETTINGS',
          data: { [key]: el.checked }
        });
      });
    }
  }

  function renderWhitelist() {
    const container = document.getElementById('whitelist-container');
    if (!settings.whitelist?.length) {
      container.innerHTML = '<div class="empty-state">No whitelisted sites</div>';
      return;
    }
    container.innerHTML = settings.whitelist.map(domain => `
      <div class="list-item">
        <span class="list-item-text">${escapeHtml(domain)}</span>
        <button class="list-item-remove" data-domain="${escapeHtml(domain)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.list-item-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const domain = btn.dataset.domain;
        settings.whitelist = settings.whitelist.filter(d => d !== domain);
        await chrome.runtime.sendMessage({
          type: 'SAVE_SETTINGS',
          data: { whitelist: settings.whitelist }
        });
        renderWhitelist();
      });
    });
  }

  document.getElementById('whitelist-add').addEventListener('click', async () => {
    const input = document.getElementById('whitelist-input');
    const domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) return;
    if (!settings.whitelist) settings.whitelist = [];
    if (settings.whitelist.includes(domain)) return;
    settings.whitelist.push(domain);
    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      data: { whitelist: settings.whitelist }
    });
    input.value = '';
    renderWhitelist();
  });

  document.getElementById('whitelist-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('whitelist-add').click();
  });

  renderWhitelist();

  function renderFilters() {
    const container = document.getElementById('filter-container');
    if (!settings.customRules?.length) {
      container.innerHTML = '<div class="empty-state">No custom filters</div>';
      return;
    }
    container.innerHTML = settings.customRules.map(rule => `
      <div class="list-item">
        <span class="list-item-text">${escapeHtml(rule)}</span>
        <button class="list-item-remove" data-rule="${escapeHtml(rule)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.list-item-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rule = btn.dataset.rule;
        settings.customRules = settings.customRules.filter(r => r !== rule);
        await chrome.runtime.sendMessage({
          type: 'SAVE_SETTINGS',
          data: { customRules: settings.customRules }
        });
        renderFilters();
      });
    });
  }

  document.getElementById('filter-add').addEventListener('click', async () => {
    const input = document.getElementById('filter-input');
    const rule = input.value.trim();
    if (!rule) return;
    if (!settings.customRules) settings.customRules = [];
    if (settings.customRules.includes(rule)) return;
    settings.customRules.push(rule);
    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      data: { customRules: settings.customRules }
    });
    input.value = '';
    renderFilters();
  });

  document.getElementById('filter-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('filter-add').click();
  });

  renderFilters();

  async function loadStats() {
    const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    document.getElementById('overview-total').textContent = (stats.totalBlocked || 0).toLocaleString();
    document.getElementById('overview-domains').textContent = Object.keys(stats.byDomain || {}).length;

    const timeSaved = (stats.totalBlocked || 0) * 50;
    if (timeSaved >= 60000) {
      document.getElementById('overview-time').textContent = (timeSaved / 60000).toFixed(1) + 'm';
    } else if (timeSaved >= 1000) {
      document.getElementById('overview-time').textContent = (timeSaved / 1000).toFixed(1) + 's';
    } else {
      document.getElementById('overview-time').textContent = timeSaved + 'ms';
    }

    const domainContainer = document.getElementById('domain-stats-container');
    const domains = Object.entries(stats.byDomain || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    if (domains.length === 0) {
      domainContainer.innerHTML = '<div class="empty-state">No data yet</div>';
    } else {
      domainContainer.innerHTML = domains.map(([domain, count]) => `
        <div class="domain-stat-item">
          <span class="domain-stat-name">${escapeHtml(domain)}</span>
          <span class="domain-stat-count">${count.toLocaleString()}</span>
        </div>
      `).join('');
    }
  }

  loadStats();

  document.getElementById('btn-reset-stats').addEventListener('click', async () => {
    if (confirm('Reset all statistics? This cannot be undone.')) {
      await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
      loadStats();
    }
  });

  // --- AI Agent Config ---

  const PROVIDERS_META = {
    ollama: {
      name: 'Ollama', baseUrl: 'https://api.ollama.com',
      keyUrl: 'https://ollama.com/settings/keys', keyLabel: 'ollama.com/settings/keys',
      models: [
        { id: 'qwen3-coder-next', name: 'Qwen3 Coder Next (recommended)' },
        { id: 'qwen3.5', name: 'Qwen 3.5' },
        { id: 'devstral-small-2', name: 'Devstral Small 2' },
        { id: 'ministral-3', name: 'Ministral 3' },
        { id: 'glm-5', name: 'GLM 5' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
        { id: 'deepseek-v3.2', name: 'DeepSeek V3.2' }
      ]
    },
    openai: {
      name: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
      keyUrl: 'https://platform.openai.com/api-keys', keyLabel: 'platform.openai.com/api-keys',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o (recommended)' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (fast & cheap)' },
        { id: 'gpt-4.1', name: 'GPT-4.1' },
        { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
        { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano (fastest)' },
        { id: 'o3-mini', name: 'o3-mini (reasoning)' }
      ]
    },
    anthropic: {
      name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1',
      keyUrl: 'https://console.anthropic.com/settings/keys', keyLabel: 'console.anthropic.com/settings/keys',
      models: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (recommended)' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (fast & cheap)' },
        { id: 'claude-opus-4-20250514', name: 'Claude Opus 4 (most capable)' }
      ]
    },
    mistral: {
      name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1',
      keyUrl: 'https://console.mistral.ai/api-keys', keyLabel: 'console.mistral.ai/api-keys',
      models: [
        { id: 'mistral-medium-latest', name: 'Mistral Medium (recommended)' },
        { id: 'mistral-small-latest', name: 'Mistral Small (fast)' },
        { id: 'mistral-large-latest', name: 'Mistral Large (most capable)' },
        { id: 'codestral-latest', name: 'Codestral (code-focused)' },
        { id: 'devstral-small-latest', name: 'Devstral Small' }
      ]
    }
  };

  let activeProvider = 'ollama';

  function updateProviderUI(provider) {
    activeProvider = provider;
    const meta = PROVIDERS_META[provider];
    if (!meta) return;

    document.querySelectorAll('.provider-card').forEach(card => {
      card.classList.toggle('active', card.dataset.provider === provider);
    });

    const keyLink = document.getElementById('api-key-link');
    keyLink.href = meta.keyUrl;
    keyLink.textContent = meta.keyLabel;

    const urlInput = document.getElementById('opt-api-url');
    urlInput.placeholder = meta.baseUrl;
    if (!urlInput.value || Object.values(PROVIDERS_META).some(p => p.baseUrl === urlInput.value)) {
      urlInput.value = meta.baseUrl;
    }

    const modelSelect = document.getElementById('opt-model');
    modelSelect.innerHTML = meta.models.map(m =>
      `<option value="${m.id}">${escapeHtml(m.name)}</option>`
    ).join('');
  }

  document.querySelectorAll('.provider-card').forEach(card => {
    card.addEventListener('click', () => {
      updateProviderUI(card.dataset.provider);
    });
  });

  async function loadAgentConfig() {
    try {
      const providerConfig = await chrome.runtime.sendMessage({ type: 'GET_OLLAMA_CONFIG' });
      if (providerConfig) {
        const provider = providerConfig.provider || 'ollama';
        updateProviderUI(provider);
        document.getElementById('opt-agent-enabled').checked = providerConfig.enabled ?? false;
        document.getElementById('opt-api-key').value = providerConfig.apiKey || '';

        const meta = PROVIDERS_META[provider];
        document.getElementById('opt-api-url').value = providerConfig.baseUrl || meta?.baseUrl || '';

        if (providerConfig.model) {
          const modelSelect = document.getElementById('opt-model');
          if ([...modelSelect.options].some(o => o.value === providerConfig.model)) {
            modelSelect.value = providerConfig.model;
          }
        }
      }

      const agentState = await chrome.runtime.sendMessage({ type: 'AGENT_GET_STATE' });
      if (agentState) {
        document.getElementById('agent-stat-scans').textContent = agentState.totalAnalyses || 0;
        document.getElementById('agent-stat-ads').textContent = agentState.totalAdsFound || 0;
        document.getElementById('agent-stat-patterns').textContent = agentState.totalPatternsLearned || 0;
      }

      const patterns = await chrome.runtime.sendMessage({ type: 'AGENT_GET_PATTERNS' });
      renderPatterns(patterns || []);
    } catch (err) {
      console.error('Error loading agent config:', err);
    }
  }

  function renderPatterns(patterns) {
    const container = document.getElementById('patterns-container');
    if (!patterns.length) {
      container.innerHTML = '<div class="empty-state">No patterns learned yet. Run a Deep Scan to start learning.</div>';
      return;
    }
    container.innerHTML = patterns.slice(-50).reverse().map(p => `
      <div class="list-item" style="flex-direction:column;align-items:flex-start;gap:4px;padding:10px 12px;">
        <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
          <span class="list-item-text" style="font-size:12px;color:var(--accent-light);">${escapeHtml(p.pattern)}</span>
          <span style="font-size:9px;color:var(--text-secondary);text-transform:uppercase;background:var(--surface);padding:2px 6px;border-radius:4px;">${escapeHtml(p.type)}</span>
        </div>
        <span style="font-size:11px;color:var(--text-secondary);">${escapeHtml(p.description)}</span>
        <span style="font-size:9px;color:var(--text-secondary);">${p.domain || '*'} &middot; ${new Date(p.learnedAt).toLocaleDateString()}</span>
      </div>
    `).join('');
  }

  document.getElementById('btn-save-ollama').addEventListener('click', async () => {
    const meta = PROVIDERS_META[activeProvider];
    const config = {
      provider: activeProvider,
      enabled: document.getElementById('opt-agent-enabled').checked,
      apiKey: document.getElementById('opt-api-key').value.trim(),
      baseUrl: document.getElementById('opt-api-url').value.trim() || meta?.baseUrl || '',
      model: document.getElementById('opt-model').value
    };

    await chrome.runtime.sendMessage({ type: 'SAVE_OLLAMA_CONFIG', data: config });
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', data: { aiAgent: config.enabled } });

    const status = document.getElementById('ollama-status');
    status.style.display = 'block';
    status.style.background = 'rgba(0, 210, 160, 0.1)';
    status.style.color = '#00D2A0';
    status.style.border = '1px solid rgba(0, 210, 160, 0.2)';
    status.textContent = `${meta?.name || 'Provider'} configuration saved successfully.`;
    setTimeout(() => { status.style.display = 'none'; }, 3000);
  });

  document.getElementById('btn-test-ollama').addEventListener('click', async () => {
    const status = document.getElementById('ollama-status');
    const btn = document.getElementById('btn-test-ollama');
    const meta = PROVIDERS_META[activeProvider];
    btn.disabled = true;
    btn.textContent = 'Testing...';
    status.style.display = 'block';
    status.style.background = 'rgba(108, 92, 231, 0.1)';
    status.style.color = '#A855F7';
    status.style.border = '1px solid rgba(108, 92, 231, 0.2)';
    status.textContent = `Connecting to ${meta?.name || 'provider'}...`;

    const config = {
      provider: activeProvider,
      enabled: document.getElementById('opt-agent-enabled').checked,
      apiKey: document.getElementById('opt-api-key').value.trim(),
      baseUrl: document.getElementById('opt-api-url').value.trim() || meta?.baseUrl || '',
      model: document.getElementById('opt-model').value
    };
    await chrome.runtime.sendMessage({ type: 'SAVE_OLLAMA_CONFIG', data: config });

    const result = await chrome.runtime.sendMessage({ type: 'TEST_OLLAMA_CONNECTION' });

    if (result.success) {
      status.style.background = 'rgba(0, 210, 160, 0.1)';
      status.style.color = '#00D2A0';
      status.style.border = '1px solid rgba(0, 210, 160, 0.2)';
      status.textContent = `Connected to ${meta?.name}! Response: "${result.response}"`;
    } else {
      status.style.background = 'rgba(255, 83, 112, 0.1)';
      status.style.color = '#FF5370';
      status.style.border = '1px solid rgba(255, 83, 112, 0.2)';
      status.textContent = `Connection failed: ${result.error}`;
    }

    btn.disabled = false;
    btn.textContent = 'Test Connection';
  });

  document.getElementById('opt-agent-enabled').addEventListener('change', async () => {
    const enabled = document.getElementById('opt-agent-enabled').checked;
    await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', data: { aiAgent: enabled } });
  });

  loadAgentConfig();

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
