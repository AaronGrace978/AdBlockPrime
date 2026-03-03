'use strict';

(async () => {
  let settings = null;

  try {
    settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  } catch {
    settings = { enabled: true, stealthMode: true, cosmeticFilter: true, aiAgent: true };
  }

  if (!settings || !settings.enabled) return;

  const hostname = window.location.hostname;
  if (settings.whitelist && settings.whitelist.includes(hostname)) return;

  const isYouTube = hostname === 'www.youtube.com' || hostname === 'youtube.com' ||
                    hostname === 'm.youtube.com';

  if (settings.stealthMode !== false) {
    StealthModule.init();
  }

  if (isYouTube && typeof YouTubeBlocker !== 'undefined') {
    YouTubeBlocker.init();
  }

  if (typeof SiteModules !== 'undefined') {
    SiteModules.init(hostname);
  }

  try {
    const communityRules = await chrome.runtime.sendMessage({ type: 'FILTER_LISTS_GET_COSMETIC' });
    if (communityRules?.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < Math.min(communityRules.length, 500); i += batchSize) {
        const batch = communityRules.slice(i, i + batchSize);
        for (const rule of batch) {
          CosmeticFilter.addCustomRule(rule);
        }
      }
    }
  } catch {}

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

  if (typeof LinkGuard !== 'undefined') {
    const initLinkGuard = () => LinkGuard.init();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initLinkGuard);
    } else {
      initLinkGuard();
    }
  }

  if (settings.aiAgent && !isYouTube) {
    scheduleProactiveAgentScan();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'GET_PAGE_STATS':
        sendResponse(ElementDetector.getStats());
        break;

      case 'GET_SECURITY_PAGE_STATS':
        sendResponse(typeof LinkGuard !== 'undefined' ? LinkGuard.getStats() : { scanned: 0, blocked: 0, warned: 0 });
        break;

      case 'RESCAN_PAGE':
        ElementDetector.scanAndHide();
        CosmeticFilter.fixEmptySpaces();
        sendResponse({ success: true });
        break;

      case 'ADD_CUSTOM_RULE':
        CosmeticFilter.addCustomRule(message.selector);
        sendResponse({ success: true });
        break;

      case 'TOGGLE_ELEMENT_PICKER':
        startElementPicker();
        sendResponse({ success: true });
        break;

      case 'AGENT_SCAN':
        runAgentScan().then(sendResponse).catch(() => sendResponse({ error: 'scan failed' }));
        return true;

      case 'AGENT_APPLY_BLOCKS':
        if (message.selectors) {
          let applied = 0;
          for (const item of message.selectors) {
            try {
              const els = document.querySelectorAll(item.selector);
              for (const el of els) {
                ElementDetector.hideElement(el, `agent:${item.reason || item.selector}`);
                applied++;
              }
            } catch {}
          }
          sendResponse({ applied });
        }
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
    return true;
  });

  async function runAgentScan() {
    const scripts = Array.from(document.querySelectorAll('script[src]'))
      .map(s => s.src).filter(Boolean);
    const iframes = Array.from(document.querySelectorAll('iframe[src]'))
      .map(f => f.src).filter(Boolean);

    const suspiciousElements = [];
    if (typeof AIEngine !== 'undefined') {
      const candidates = document.querySelectorAll('div, section, aside, iframe, ins');
      for (const el of candidates) {
        const analysis = AIEngine.scoreElement(el);
        if (analysis.score >= 25 && analysis.score < AIEngine.THRESHOLD) {
          suspiciousElements.push({
            tag: el.tagName,
            className: el.className?.toString?.()?.substring(0, 100) || '',
            id: el.id || '',
            score: analysis.score
          });
        }
      }
    }

    const bodyClone = document.body.cloneNode(true);
    bodyClone.querySelectorAll('script, style, svg, noscript').forEach(el => el.remove());
    const html = bodyClone.innerHTML.substring(0, 8000);

    const result = await chrome.runtime.sendMessage({
      type: 'AGENT_ANALYZE_PAGE',
      data: {
        domain: window.location.hostname,
        url: window.location.href,
        html,
        scripts: scripts.slice(0, 30),
        iframes: iframes.slice(0, 15),
        suspiciousElements: suspiciousElements.slice(0, 20)
      }
    });

    if (result?.blocked?.length > 0) {
      for (const item of result.blocked) {
        try {
          const els = document.querySelectorAll(item.selector);
          for (const el of els) {
            ElementDetector.hideElement(el, `agent:${item.reason}`);
          }
          CosmeticFilter.addCustomRule(item.selector);
        } catch {}
      }
    }

    return result;
  }

  function scheduleProactiveAgentScan() {
    const runProactive = () => {
      if (typeof AIEngine === 'undefined') return;

      const candidates = document.querySelectorAll('div, section, aside, iframe, ins');
      let ambiguousCount = 0;
      for (const el of candidates) {
        const analysis = AIEngine.scoreElement(el);
        if (analysis.score >= 25 && analysis.score < AIEngine.THRESHOLD) {
          ambiguousCount++;
        }
      }

      if (ambiguousCount > 3) {
        runAgentScan().catch(() => {});
      }
    };

    setTimeout(runProactive, 5000);
  }

  function startElementPicker() {
    let overlay = document.getElementById('abp-picker-overlay');
    if (overlay) {
      overlay.remove();
      return;
    }

    overlay = document.createElement('div');
    overlay.id = 'abp-picker-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'z-index:2147483647;cursor:crosshair;background:transparent;';

    const highlight = document.createElement('div');
    highlight.style.cssText = 'position:fixed;border:2px solid #ff3366;' +
      'background:rgba(255,51,102,0.15);pointer-events:none;z-index:2147483646;' +
      'transition:all 0.1s ease;border-radius:2px;';
    document.body.appendChild(highlight);

    let hoveredEl = null;

    overlay.addEventListener('mousemove', (e) => {
      overlay.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.pointerEvents = 'auto';

      if (el && el !== overlay && el !== highlight) {
        hoveredEl = el;
        const rect = el.getBoundingClientRect();
        highlight.style.top = rect.top + 'px';
        highlight.style.left = rect.left + 'px';
        highlight.style.width = rect.width + 'px';
        highlight.style.height = rect.height + 'px';
      }
    });

    overlay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (hoveredEl) {
        const selector = generateSelector(hoveredEl);
        ElementDetector.hideElement(hoveredEl, `manual:${selector}`);
        CosmeticFilter.addCustomRule(selector);

        chrome.runtime.sendMessage({
          type: 'ELEMENT_PICKED',
          data: { selector, url: window.location.href }
        }).catch(() => {});
      }

      highlight.remove();
      overlay.remove();
    });

    overlay.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      highlight.remove();
      overlay.remove();
    });

    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        highlight.remove();
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    });

    document.body.appendChild(overlay);
  }

  function generateSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;

    const classes = Array.from(el.classList)
      .filter(c => !/^abp-|^data-abp/.test(c))
      .map(c => `.${CSS.escape(c)}`)
      .join('');

    if (classes && document.querySelectorAll(el.tagName + classes).length === 1) {
      return el.tagName.toLowerCase() + classes;
    }

    const path = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        path.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          c => c.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${idx})`;
        }
      }
      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }
})();
