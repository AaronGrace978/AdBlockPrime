'use strict';

const LinkGuard = (() => {
  let enabled = true;
  let scannedLinks = new WeakSet();
  let warningOverlay = null;
  let stats = { scanned: 0, blocked: 0, warned: 0 };

  const LEVEL_COLORS = {
    danger:  { bg: '#FF5370', border: '#FF2D55', text: '#fff', glow: 'rgba(255,83,112,0.4)' },
    warning: { bg: '#FFB347', border: '#FF9500', text: '#1a1a24', glow: 'rgba(255,179,71,0.4)' },
    caution: { bg: '#FFD166', border: '#FFC233', text: '#1a1a24', glow: 'rgba(255,209,102,0.3)' }
  };

  const SHIELD_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

  function init() {
    scanPageLinks();

    const observer = new MutationObserver(mutations => {
      let hasNewLinks = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            if (node.tagName === 'A' || node.querySelectorAll?.('a').length > 0) {
              hasNewLinks = true;
              break;
            }
          }
        }
        if (hasNewLinks) break;
      }
      if (hasNewLinks) scanPageLinks();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener('click', handleClick, true);
    document.addEventListener('auxclick', handleClick, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
  }

  function scanPageLinks() {
    const links = document.querySelectorAll('a[href]');
    for (const link of links) {
      if (scannedLinks.has(link)) continue;
      scannedLinks.add(link);
      stats.scanned++;

      const href = link.href;
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;

      try {
        const result = analyzeUrlLocal(href);
        if (result.level === 'danger' || result.level === 'warning') {
          markLink(link, result);
        } else if (result.level === 'caution') {
          markLinkSubtle(link, result);
        }
      } catch {}
    }
  }

  function analyzeUrlLocal(url) {
    const result = {
      url,
      safe: true,
      score: 0,
      threats: [],
      level: 'safe'
    };

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      if (url.startsWith('javascript:')) {
        return { url, safe: false, score: 90, threats: [{ type: 'javascript_uri', detail: 'JavaScript URI' }], level: 'danger' };
      }
      return result;
    }

    if (parsed.protocol === 'javascript:') {
      return { url, safe: false, score: 90, threats: [{ type: 'javascript_uri', detail: 'JavaScript URI' }], level: 'danger' };
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return result;

    const hostname = parsed.hostname.toLowerCase();

    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      result.score += 35;
      result.threats.push({ type: 'ip_address', detail: 'Direct IP address' });
    }

    if (parsed.href.includes('@') && !parsed.href.startsWith('mailto:')) {
      result.score += 40;
      result.threats.push({ type: 'at_symbol', detail: 'URL contains @ (may redirect)' });
    }

    if (hostname.includes('xn--')) {
      result.score += 25;
      result.threats.push({ type: 'punycode', detail: 'IDN/Punycode domain' });
    }

    const parts = hostname.split('.');
    if (parts.length > 4) {
      result.score += 20;
      result.threats.push({ type: 'deep_subdomain', detail: 'Excessive subdomains' });
    }

    if (hostname.length > 50) {
      result.score += 15;
      result.threats.push({ type: 'long_hostname', detail: 'Very long hostname' });
    }

    const susExt = ['.exe', '.scr', '.bat', '.cmd', '.msi', '.vbs', '.ps1', '.jar', '.hta', '.apk', '.pif'];
    const pathLower = parsed.pathname.toLowerCase();
    if (susExt.some(e => pathLower.endsWith(e))) {
      result.score += 30;
      result.threats.push({ type: 'dangerous_file', detail: 'Dangerous file download' });
    }

    if (/\.\w{2,4}\.\w{2,4}$/.test(pathLower) && susExt.some(e => pathLower.endsWith(e))) {
      result.score += 35;
      result.threats.push({ type: 'double_extension', detail: 'Double extension trick' });
    }

    const susTlds = ['.tk', '.ml', '.ga', '.cf', '.gq', '.buzz', '.top', '.xyz', '.click', '.monster', '.cyou', '.cfd', '.sbs'];
    const tld = '.' + parts[parts.length - 1];
    if (susTlds.includes(tld)) {
      result.score += 15;
      result.threats.push({ type: 'sus_tld', detail: `Suspicious TLD: ${tld}` });
    }

    const shorteners = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'adf.ly', 'cutt.ly', 'rb.gy', 'shorturl.at'];
    const base = parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    if (shorteners.includes(base)) {
      result.score += 20;
      result.threats.push({ type: 'shortener', detail: 'URL shortener (hidden destination)' });
    }

    const brands = ['google', 'apple', 'microsoft', 'amazon', 'paypal', 'facebook', 'netflix',
      'instagram', 'twitter', 'steam', 'discord', 'coinbase', 'binance', 'chase', 'wellsfargo', 'whatsapp'];
    const legitDomains = {
      'google': 'google.com', 'apple': 'apple.com', 'microsoft': 'microsoft.com', 'amazon': 'amazon.com',
      'paypal': 'paypal.com', 'facebook': 'facebook.com', 'netflix': 'netflix.com', 'instagram': 'instagram.com',
      'twitter': 'twitter.com', 'steam': 'steampowered.com', 'discord': 'discord.com', 'coinbase': 'coinbase.com',
      'binance': 'binance.com', 'chase': 'chase.com', 'wellsfargo': 'wellsfargo.com', 'whatsapp': 'whatsapp.com'
    };
    for (const brand of brands) {
      if (hostname.includes(brand) && !hostname.endsWith(legitDomains[brand]) && !hostname.endsWith('.' + legitDomains[brand])) {
        result.score += 45;
        result.threats.push({ type: 'brand_spoof', detail: `Possible ${brand} impersonation` });
        break;
      }
    }

    const encodedCount = (parsed.href.match(/%[0-9a-f]{2}/gi) || []).length;
    if (encodedCount > 5) {
      result.score += 15;
      result.threats.push({ type: 'encoding', detail: 'Heavy URL encoding' });
    }

    const redirectParams = ['url', 'redirect', 'next', 'goto', 'dest', 'redir', 'return_to', 'continue'];
    for (const p of redirectParams) {
      const val = parsed.searchParams.get(p);
      if (val && /^https?:\/\//i.test(val)) {
        try {
          if (new URL(val).hostname !== hostname) {
            result.score += 25;
            result.threats.push({ type: 'open_redirect', detail: 'Open redirect to another domain' });
          }
        } catch {}
        break;
      }
    }

    result.score = Math.min(result.score, 100);
    if (result.score >= 70) result.level = 'danger';
    else if (result.score >= 50) result.level = 'warning';
    else if (result.score >= 25) result.level = 'caution';
    result.safe = result.score < 50;

    return result;
  }

  function markLink(link, analysis) {
    const colors = LEVEL_COLORS[analysis.level] || LEVEL_COLORS.warning;

    link.dataset.securityLevel = analysis.level;
    link.dataset.securityScore = analysis.score;
    link.style.outline = `2px solid ${colors.border}`;
    link.style.outlineOffset = '1px';
    link.style.borderRadius = '2px';
    link.style.position = link.style.position || 'relative';

    const badge = document.createElement('span');
    badge.className = 'spm-link-badge';
    badge.style.cssText = `
      position:absolute;top:-6px;right:-6px;z-index:999999;
      width:14px;height:14px;border-radius:50%;
      background:${colors.bg};border:1.5px solid ${colors.border};
      display:flex;align-items:center;justify-content:center;
      font-size:9px;font-weight:900;color:${colors.text};
      box-shadow:0 0 6px ${colors.glow};cursor:help;
      line-height:1;font-family:sans-serif;
    `;
    badge.textContent = '!';
    badge.title = analysis.threats.map(t => t.detail).join(', ');

    if (link.style.display !== 'inline') {
      link.style.position = 'relative';
      link.appendChild(badge);
    }
  }

  function markLinkSubtle(link, analysis) {
    link.dataset.securityLevel = 'caution';
    link.dataset.securityScore = analysis.score;
    link.style.borderBottom = '1px dashed #FFD166';
  }

  function handleClick(e) {
    if (!enabled) return;

    const link = e.target.closest?.('a[href]');
    if (!link) return;

    const href = link.href;
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

    const analysis = analyzeUrlLocal(href);

    if (analysis.level === 'danger' || analysis.level === 'warning') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      stats.blocked++;

      chrome.runtime.sendMessage({
        type: 'SECURITY_THREAT_BLOCKED',
        data: { url: href, analysis, sourceUrl: window.location.href }
      }).catch(() => {});

      showWarning(href, analysis, link);
    }
  }

  function handleContextMenu(e) {
    if (!enabled) return;
    const link = e.target.closest?.('a[href]');
    if (!link || !link.dataset.securityLevel) return;

    if (link.dataset.securityLevel === 'danger' || link.dataset.securityLevel === 'warning') {
      stats.warned++;
    }
  }

  function showWarning(url, analysis, linkEl) {
    if (warningOverlay) warningOverlay.remove();

    const colors = LEVEL_COLORS[analysis.level] || LEVEL_COLORS.danger;
    const levelLabel = analysis.level === 'danger' ? 'DANGEROUS LINK BLOCKED' : 'SUSPICIOUS LINK BLOCKED';
    const truncUrl = url.length > 80 ? url.substring(0, 77) + '...' : url;

    warningOverlay = document.createElement('div');
    warningOverlay.id = 'spm-warning-overlay';
    warningOverlay.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      z-index:2147483647;
      background:rgba(15,15,20,0.85);
      backdrop-filter:blur(8px);
      display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
      animation:spmFadeIn 0.2s ease;
    `;

    warningOverlay.innerHTML = `
      <style>
        @keyframes spmFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes spmSlideUp { from { transform:translateY(20px);opacity:0; } to { transform:translateY(0);opacity:1; } }
        @keyframes spmPulse { 0%,100% { box-shadow:0 0 20px ${colors.glow}; } 50% { box-shadow:0 0 40px ${colors.glow}; } }
        .spm-card { animation: spmSlideUp 0.3s ease 0.1s both; }
        .spm-btn { transition: all 0.2s ease; cursor:pointer; font-family:inherit; }
        .spm-btn:hover { transform:translateY(-1px); }
        .spm-btn-proceed:hover { background:rgba(255,83,112,0.15) !important; }
        .spm-btn-back:hover { box-shadow:0 4px 20px rgba(108,92,231,0.4) !important; }
      </style>
      <div class="spm-card" style="
        background:#1A1A24;
        border:1px solid ${colors.border};
        border-radius:16px;
        padding:32px;
        max-width:440px;
        width:90%;
        text-align:center;
        animation:spmPulse 2s ease infinite;
      ">
        <div style="margin-bottom:16px;color:${colors.bg};">
          ${SHIELD_SVG.replace('width="20" height="20"', 'width="48" height="48"').replace('stroke="currentColor"', `stroke="${colors.bg}"`)}
        </div>
        <div style="
          font-size:11px;font-weight:700;letter-spacing:1.5px;
          color:${colors.bg};margin-bottom:8px;
          text-transform:uppercase;
        ">${levelLabel}</div>
        <div style="
          font-size:20px;font-weight:700;color:#EEEEF0;
          margin-bottom:6px;
        ">SecurityPrime<span style="color:${colors.bg}">Mini</span></div>
        <div style="
          font-size:12px;color:#8888A0;margin-bottom:20px;
        ">has protected you from a potentially dangerous link</div>

        <div style="
          background:#0F0F14;border-radius:8px;padding:12px;
          margin-bottom:16px;text-align:left;
          border:1px solid #2A2A38;
        ">
          <div style="font-size:10px;color:#8888A0;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Destination URL</div>
          <div style="font-size:11px;color:#FF5370;word-break:break-all;font-family:monospace;">${escapeHtml(truncUrl)}</div>
        </div>

        <div style="
          background:#0F0F14;border-radius:8px;padding:12px;
          margin-bottom:20px;text-align:left;
          border:1px solid #2A2A38;
        ">
          <div style="font-size:10px;color:#8888A0;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Threats Detected</div>
          ${analysis.threats.map(t => `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span style="width:6px;height:6px;border-radius:50%;background:${colors.bg};flex-shrink:0;"></span>
              <span style="font-size:11px;color:#EEEEF0;">${escapeHtml(t.detail)}</span>
            </div>
          `).join('')}
          <div style="margin-top:8px;font-size:10px;color:#8888A0;">
            Threat score: <span style="color:${colors.bg};font-weight:700;">${analysis.score}/100</span>
          </div>
        </div>

        <div style="display:flex;gap:10px;">
          <button class="spm-btn spm-btn-back" id="spm-btn-back" style="
            flex:1;padding:12px;border-radius:10px;border:none;
            background:linear-gradient(135deg,#6C5CE7,#A855F7);
            color:white;font-size:13px;font-weight:600;
            box-shadow:0 2px 12px rgba(108,92,231,0.3);
          ">Go Back Safely</button>
          <button class="spm-btn spm-btn-proceed" id="spm-btn-proceed" style="
            padding:12px 16px;border-radius:10px;
            background:transparent;
            border:1px solid #2A2A38;
            color:#8888A0;font-size:11px;
          ">Proceed Anyway</button>
        </div>
      </div>
    `;

    document.body.appendChild(warningOverlay);

    warningOverlay.querySelector('#spm-btn-back').addEventListener('click', () => {
      warningOverlay.remove();
      warningOverlay = null;
    });

    warningOverlay.querySelector('#spm-btn-proceed').addEventListener('click', () => {
      warningOverlay.remove();
      warningOverlay = null;
      chrome.runtime.sendMessage({
        type: 'SECURITY_URL_ALLOWED',
        data: { url }
      }).catch(() => {});
      window.location.href = url;
    });

    warningOverlay.addEventListener('click', (e) => {
      if (e.target === warningOverlay) {
        warningOverlay.remove();
        warningOverlay = null;
      }
    });

    document.addEventListener('keydown', function escClose(e) {
      if (e.key === 'Escape' && warningOverlay) {
        warningOverlay.remove();
        warningOverlay = null;
        document.removeEventListener('keydown', escClose);
      }
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getStats() {
    return { ...stats };
  }

  function setEnabled(val) {
    enabled = val;
  }

  return {
    init,
    scanPageLinks,
    analyzeUrlLocal,
    getStats,
    setEnabled
  };
})();
