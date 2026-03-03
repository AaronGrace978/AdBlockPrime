'use strict';

const SecurityPrimeMini = (() => {

  // ─── Known Malicious TLD Patterns ───
  const SUSPICIOUS_TLDS = new Set([
    '.tk', '.ml', '.ga', '.cf', '.gq', '.buzz', '.top', '.xyz', '.club',
    '.work', '.click', '.link', '.surf', '.rest', '.icu', '.cam', '.monster',
    '.cyou', '.cfd', '.sbs', '.quest'
  ]);

  // ─── URL Shorteners ───
  const URL_SHORTENERS = new Set([
    'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
    'adf.ly', 'bit.do', 'mcaf.ee', 'su.pr', 'db.tt', 'qr.ae', 'cur.lv',
    'ity.im', 'q.gs', 'po.st', 'bc.vc', 'u.to', 'v.gd', 'x.co',
    'shorturl.at', 'rb.gy', 'clck.ru', 'cutt.ly', 's.id', 'shrtco.de',
    'linktr.ee', 'zpr.io', 'rebrand.ly', 'bl.ink', 'soo.gd', 'clicky.me'
  ]);

  // ─── Phishing Target Brands ───
  const BRAND_DOMAINS = {
    'google': ['google.com', 'gmail.com', 'youtube.com', 'googleapis.com'],
    'apple': ['apple.com', 'icloud.com', 'appleid.apple.com'],
    'microsoft': ['microsoft.com', 'outlook.com', 'live.com', 'office.com', 'office365.com'],
    'amazon': ['amazon.com', 'amazon.co.uk', 'aws.amazon.com'],
    'paypal': ['paypal.com', 'paypal.me'],
    'facebook': ['facebook.com', 'fb.com', 'messenger.com', 'meta.com'],
    'instagram': ['instagram.com'],
    'twitter': ['twitter.com', 'x.com'],
    'netflix': ['netflix.com'],
    'chase': ['chase.com'],
    'wellsfargo': ['wellsfargo.com'],
    'bankofamerica': ['bankofamerica.com'],
    'steam': ['steampowered.com', 'steamcommunity.com'],
    'discord': ['discord.com', 'discord.gg'],
    'dropbox': ['dropbox.com'],
    'linkedin': ['linkedin.com'],
    'ebay': ['ebay.com'],
    'twitch': ['twitch.tv'],
    'coinbase': ['coinbase.com'],
    'binance': ['binance.com'],
    'whatsapp': ['whatsapp.com', 'web.whatsapp.com']
  };

  // ─── Homograph Attack Characters ───
  const HOMOGRAPH_MAP = {
    '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p',
    '\u0441': 'c', '\u0443': 'y', '\u0445': 'x', '\u0455': 's',
    '\u0456': 'i', '\u0458': 'j', '\u04BB': 'h', '\u0501': 'd',
    '\u051B': 'q', '\u051D': 'w', '\u0261': 'g', '\u0562': 'b',
    '\u0585': 'o', '\u057C': 'n', '\u0270': 'm', '\u1E37': 'l',
    '\u0131': 'i', '\u0101': 'a', '\u0113': 'e', '\u014D': 'o',
    '\u016B': 'u',
    '\u0410': 'A', '\u0412': 'B', '\u0415': 'E', '\u041A': 'K',
    '\u041C': 'M', '\u041D': 'H', '\u041E': 'O', '\u0420': 'P',
    '\u0421': 'C', '\u0422': 'T', '\u0425': 'X'
  };

  // ─── Suspicious Path/Query Patterns ───
  const PHISHING_PATH_PATTERNS = [
    /\/login/i, /\/signin/i, /\/sign-in/i, /\/log-in/i,
    /\/verify/i, /\/verification/i, /\/confirm/i, /\/secure/i,
    /\/account[-_]?update/i, /\/password[-_]?reset/i,
    /\/billing/i, /\/payment/i, /\/wallet/i,
    /\/suspend/i, /\/locked/i, /\/unusual[-_]?activity/i,
    /\/security[-_]?alert/i, /\/auth(?:enticate)?/i,
    /\.php\?.*(?:user|pass|login|token|session)/i,
    /\/wp-(?:admin|login|content).*\.php/i
  ];

  const MALWARE_PATTERNS = [
    /\.exe$/i, /\.scr$/i, /\.bat$/i, /\.cmd$/i, /\.msi$/i,
    /\.vbs$/i, /\.ps1$/i, /\.jar$/i, /\.com$/i, /\.pif$/i,
    /\.hta$/i, /\.cpl$/i, /\.wsf$/i, /\.apk$/i
  ];

  // ─── State ───
  let state = {
    totalChecks: 0,
    threatsBlocked: 0,
    linksScanned: 0,
    threatsByType: {},
    recentThreats: [],
    allowedUrls: []
  };

  async function loadState() {
    try {
      const stored = await chrome.storage.local.get('securityPrimeMiniState');
      if (stored.securityPrimeMiniState) {
        state = { ...state, ...stored.securityPrimeMiniState };
      }
    } catch {}
    return state;
  }

  async function saveState() {
    try {
      await chrome.storage.local.set({ securityPrimeMiniState: state });
    } catch {}
  }

  // ─── Core Analysis ───

  function analyzeUrl(url, sourceHostname = '') {
    const result = {
      url,
      safe: true,
      score: 0,    // 0 = safe, 100 = definitely malicious
      threats: [],  // list of threat descriptions
      level: 'safe' // safe | caution | warning | danger
    };

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      if (url.startsWith('javascript:')) {
        result.safe = false;
        result.score = 90;
        result.threats.push({ type: 'javascript_uri', detail: 'JavaScript URI can execute arbitrary code' });
      }
      if (url.startsWith('data:')) {
        result.score += 40;
        result.threats.push({ type: 'data_uri', detail: 'Data URI can hide malicious content' });
      }
      result.level = scoreToLevel(result.score);
      result.safe = result.score < 50;
      return result;
    }

    if (parsed.protocol === 'javascript:') {
      result.safe = false;
      result.score = 90;
      result.threats.push({ type: 'javascript_uri', detail: 'JavaScript URI can execute arbitrary code' });
      result.level = 'danger';
      return result;
    }

    if (parsed.protocol === 'data:') {
      result.score += 40;
      result.threats.push({ type: 'data_uri', detail: 'Data URI can hide malicious content' });
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      result.level = scoreToLevel(result.score);
      result.safe = result.score < 50;
      return result;
    }

    const hostname = parsed.hostname.toLowerCase();
    const fullUrl = parsed.href.toLowerCase();

    // HTTP on a sensitive-looking page
    if (parsed.protocol === 'http:' && PHISHING_PATH_PATTERNS.some(p => p.test(parsed.pathname))) {
      result.score += 30;
      result.threats.push({ type: 'insecure_sensitive', detail: 'Sensitive page served over insecure HTTP' });
    }

    // IP address URL
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      result.score += 35;
      result.threats.push({ type: 'ip_address', detail: 'Direct IP address instead of domain name' });
    }

    // Suspicious TLD
    const tld = '.' + hostname.split('.').pop();
    if (SUSPICIOUS_TLDS.has(tld)) {
      result.score += 15;
      result.threats.push({ type: 'suspicious_tld', detail: `Suspicious TLD: ${tld}` });
    }

    // URL shortener
    const baseDomain = extractBaseDomain(hostname);
    if (URL_SHORTENERS.has(baseDomain) || URL_SHORTENERS.has(hostname)) {
      result.score += 20;
      result.threats.push({ type: 'url_shortener', detail: `URL shortener: ${baseDomain} (destination unknown)` });
    }

    // Excessive subdomains (> 3 levels)
    const parts = hostname.split('.');
    if (parts.length > 4) {
      result.score += 20;
      result.threats.push({ type: 'excessive_subdomains', detail: `Unusually deep subdomain nesting (${parts.length} levels)` });
    }

    // Very long hostname
    if (hostname.length > 50) {
      result.score += 15;
      result.threats.push({ type: 'long_hostname', detail: 'Unusually long hostname' });
    }

    // Homograph attack detection
    const homographResult = detectHomograph(hostname);
    if (homographResult) {
      result.score += 60;
      result.threats.push({ type: 'homograph', detail: homographResult });
    }

    // Brand impersonation (typosquatting)
    const brandResult = detectBrandImpersonation(hostname);
    if (brandResult) {
      result.score += 45;
      result.threats.push({ type: 'brand_impersonation', detail: brandResult });
    }

    // Phishing path patterns
    const phishPaths = PHISHING_PATH_PATTERNS.filter(p => p.test(parsed.pathname + parsed.search));
    if (phishPaths.length > 0 && !isKnownLegitDomain(hostname)) {
      result.score += 10 * Math.min(phishPaths.length, 3);
      result.threats.push({ type: 'phishing_path', detail: 'URL path resembles a phishing page' });
    }

    // Malware download patterns
    if (MALWARE_PATTERNS.some(p => p.test(parsed.pathname))) {
      result.score += 30;
      result.threats.push({ type: 'malware_download', detail: 'Link points to a potentially dangerous file type' });
    }

    // @ symbol in URL (credential harvesting trick)
    if (parsed.href.includes('@') && !parsed.href.startsWith('mailto:')) {
      result.score += 40;
      result.threats.push({ type: 'at_symbol', detail: 'URL contains @ symbol (may redirect to different domain)' });
    }

    // Punycode domain (xn--)
    if (hostname.includes('xn--')) {
      result.score += 25;
      result.threats.push({ type: 'punycode', detail: 'Internationalized domain name (may be a lookalike)' });
    }

    // Suspicious port
    if (parsed.port && !['80', '443', '8080', '8443'].includes(parsed.port)) {
      result.score += 15;
      result.threats.push({ type: 'unusual_port', detail: `Unusual port: ${parsed.port}` });
    }

    // Double extension trick (file.pdf.exe)
    if (/\.\w{2,4}\.\w{2,4}$/.test(parsed.pathname) && MALWARE_PATTERNS.some(p => p.test(parsed.pathname))) {
      result.score += 35;
      result.threats.push({ type: 'double_extension', detail: 'Double file extension detected (common malware trick)' });
    }

    // Encoded characters abuse
    const encodedCount = (parsed.href.match(/%[0-9a-f]{2}/gi) || []).length;
    if (encodedCount > 5) {
      result.score += 15;
      result.threats.push({ type: 'excessive_encoding', detail: 'Excessive URL encoding (may hide true destination)' });
    }

    // Cross-domain redirect via query param
    const redirectParams = ['url', 'redirect', 'next', 'return', 'goto', 'dest', 'destination', 'redir', 'return_to', 'continue'];
    for (const param of redirectParams) {
      const val = parsed.searchParams.get(param);
      if (val && /^https?:\/\//i.test(val)) {
        try {
          const redirectHost = new URL(val).hostname;
          if (redirectHost !== hostname) {
            result.score += 25;
            result.threats.push({ type: 'open_redirect', detail: `Open redirect to ${redirectHost}` });
          }
        } catch {}
        break;
      }
    }

    result.score = Math.min(result.score, 100);
    result.level = scoreToLevel(result.score);
    result.safe = result.score < 50;

    return result;
  }

  function scoreToLevel(score) {
    if (score >= 70) return 'danger';
    if (score >= 50) return 'warning';
    if (score >= 25) return 'caution';
    return 'safe';
  }

  // ─── Homograph Detection ───

  function detectHomograph(hostname) {
    let hasMixed = false;
    let hasNonAscii = false;
    const decoded = hostname;

    for (const char of decoded) {
      if (HOMOGRAPH_MAP[char]) {
        hasMixed = true;
        hasNonAscii = true;
        break;
      }
      if (char.charCodeAt(0) > 127) {
        hasNonAscii = true;
      }
    }

    if (hasMixed) {
      let normalized = '';
      for (const char of decoded) {
        normalized += HOMOGRAPH_MAP[char] || char;
      }
      return `Homograph attack: "${hostname}" looks like "${normalized}" using lookalike characters`;
    }

    return null;
  }

  // ─── Brand Impersonation ───

  function detectBrandImpersonation(hostname) {
    const baseDomain = extractBaseDomain(hostname);
    const domainWithoutTld = baseDomain.split('.')[0];

    for (const [brand, legit] of Object.entries(BRAND_DOMAINS)) {
      if (legit.some(d => hostname === d || hostname.endsWith('.' + d))) {
        return null;
      }

      if (hostname.includes(brand) && !legit.some(d => hostname === d || hostname.endsWith('.' + d))) {
        return `Possible ${brand} impersonation: "${hostname}" is not an official ${brand} domain`;
      }

      const distance = levenshtein(domainWithoutTld, brand);
      if (distance > 0 && distance <= 2 && domainWithoutTld.length >= 4) {
        return `Possible typosquat of "${brand}": "${hostname}" (edit distance: ${distance})`;
      }
    }

    return null;
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  // ─── Helpers ───

  function extractBaseDomain(hostname) {
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join('.');
  }

  function isKnownLegitDomain(hostname) {
    const legit = new Set();
    for (const domains of Object.values(BRAND_DOMAINS)) {
      for (const d of domains) legit.add(d);
    }
    legit.add('github.com');
    legit.add('stackoverflow.com');
    legit.add('reddit.com');
    legit.add('wikipedia.org');
    legit.add('mozilla.org');

    return legit.has(hostname) || legit.has(extractBaseDomain(hostname));
  }

  // ─── Batch Scan (for page links) ───

  function scanLinks(links, sourceHostname = '') {
    const results = [];
    for (const url of links) {
      const analysis = analyzeUrl(url, sourceHostname);
      if (analysis.score > 0) {
        results.push(analysis);
      }
      state.linksScanned++;
    }
    state.totalChecks++;
    return results;
  }

  // ─── Record a Threat ───

  function recordThreat(analysis) {
    state.threatsBlocked++;
    for (const t of analysis.threats) {
      state.threatsByType[t.type] = (state.threatsByType[t.type] || 0) + 1;
    }
    state.recentThreats.push({
      url: analysis.url,
      score: analysis.score,
      level: analysis.level,
      threats: analysis.threats.map(t => t.type),
      timestamp: Date.now()
    });
    if (state.recentThreats.length > 200) {
      state.recentThreats = state.recentThreats.slice(-100);
    }
    saveState();
  }

  function allowUrl(url) {
    state.allowedUrls.push(url);
    if (state.allowedUrls.length > 500) {
      state.allowedUrls = state.allowedUrls.slice(-250);
    }
    saveState();
  }

  function isAllowed(url) {
    return state.allowedUrls.includes(url);
  }

  return {
    analyzeUrl,
    scanLinks,
    recordThreat,
    allowUrl,
    isAllowed,
    loadState,
    saveState,
    getState: () => ({ ...state }),
    getRecentThreats: (limit = 20) => state.recentThreats.slice(-limit).reverse()
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityPrimeMini;
}
