'use strict';

const NetworkAnalyzer = (() => {

  const AD_DOMAINS = new Set([
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
    'adnxs.com', 'adsrvr.org', 'adform.net', 'serving-sys.com',
    'facebook.com/tr', 'facebook.net/signals', 'connect.facebook.net',
    'amazon-adsystem.com', 'media.net', 'outbrain.com', 'taboola.com',
    'criteo.com', 'criteo.net', 'moatads.com', 'moatpixel.com',
    'rubiconproject.com', 'pubmatic.com', 'openx.net', 'casalemedia.com',
    'indexww.com', 'bidswitch.net', 'mathtag.com', 'rlcdn.com',
    'bluekai.com', 'exelator.com', 'quantserve.com', 'scorecardresearch.com',
    'chartbeat.com', 'chartbeat.net', 'hotjar.com', 'mouseflow.com',
    'fullstory.com', 'luckyorange.com', 'crazyegg.com', 'optimizely.com',
    'mixpanel.com', 'amplitude.com', 'segment.com', 'mxpnl.com',
    '2mdn.net', 'smaato.net', 'inmobi.com', 'unity3d.com/ads',
    'applovin.com', 'vungle.com', 'ironsrc.com', 'mopub.com',
    'sharethis.com', 'sharethrough.com', 'yieldmo.com', 'triplelift.com',
    'teads.tv', 'spotxchange.com', 'springserve.com', 'tremorhub.com',
    'eyereturn.com', 'undertone.com', 'gumgum.com', 'nativo.com',
    'zergnet.com', 'revcontent.com', 'mgid.com', 'contentad.net',
    'adblade.com', 'adroll.com', 'perfectaudience.com', 'retargetlinks.com',
    'yimg.com/cv', 'ads.yahoo.com', 'advertising.com', 'nexage.com',
    'turn.com', 'contextweb.com', 'liveintent.com', 'livewrappedads.com'
  ]);

  const TRACKING_PATTERNS = [
    /utm_source=/i, /utm_medium=/i, /utm_campaign=/i,
    /fbclid=/i, /gclid=/i, /msclkid=/i, /dclid=/i,
    /__utm/i, /_ga=/i, /_gid=/i,
    /pixel\.(gif|png|jpg)/i, /beacon\./i,
    /\/collect\?/i, /\/pageview\?/i, /\/event\?/i,
    /impression/i, /click\?/i, /track\?/i
  ];

  const RESOURCE_TYPE_WEIGHTS = {
    script: 1.5,
    sub_frame: 2.0,
    image: 0.8,
    xmlhttprequest: 1.2,
    ping: 2.5,
    media: 0.5,
    other: 1.0
  };

  function extractDomain(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  function isDomainBlocked(domain) {
    if (AD_DOMAINS.has(domain)) return true;
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.');
      if (AD_DOMAINS.has(parent)) return true;
    }
    return false;
  }

  function analyzeRequest(url, type = 'other', initiator = '') {
    let score = 0;
    const reasons = [];
    const domain = extractDomain(url);

    if (isDomainBlocked(domain)) {
      score += 80;
      reasons.push(`blocked-domain:${domain}`);
    }

    const weight = RESOURCE_TYPE_WEIGHTS[type] || 1.0;

    for (const pattern of TRACKING_PATTERNS) {
      if (pattern.test(url)) {
        score += 30 * weight;
        reasons.push(`tracking:${pattern.source.substring(0, 20)}`);
        break;
      }
    }

    if (type === 'ping') {
      score += 40;
      reasons.push('ping-request');
    }

    if (type === 'sub_frame') {
      const iframeAdPatterns = [
        /\/ads\//i, /\/ad\//i, /adframe/i, /adserver/i,
        /safeframe/i, /tpc\.googlesyndication/i
      ];
      for (const pattern of iframeAdPatterns) {
        if (pattern.test(url)) {
          score += 50;
          reasons.push('ad-iframe');
          break;
        }
      }
    }

    if (url.length > 2000) {
      score += 10;
      reasons.push('long-url');
    }

    const paramCount = (url.match(/[&?]/g) || []).length;
    if (paramCount > 15) {
      score += 10;
      reasons.push('many-params');
    }

    return {
      url,
      domain,
      type,
      score,
      shouldBlock: score >= 40,
      reasons
    };
  }

  function generateBlockRules() {
    const rules = [];
    let id = 1;

    for (const domain of AD_DOMAINS) {
      rules.push({
        id: id++,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: `||${domain}`,
          resourceTypes: [
            'script', 'image', 'sub_frame', 'xmlhttprequest',
            'ping', 'media', 'font', 'other'
          ]
        }
      });
    }

    return rules;
  }

  function stripTrackingParams(url) {
    try {
      const u = new URL(url);
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'fbclid', 'gclid', 'msclkid', 'dclid', 'zanpid',
        '_ga', '_gid', '_gl', 'mc_cid', 'mc_eid',
        'oly_anon_id', 'oly_enc_id', 'vero_id',
        '__s', 'ref', 'referrer', 'clickid'
      ];
      let changed = false;
      for (const param of trackingParams) {
        if (u.searchParams.has(param)) {
          u.searchParams.delete(param);
          changed = true;
        }
      }
      return changed ? u.toString() : url;
    } catch {
      return url;
    }
  }

  return {
    analyzeRequest,
    isDomainBlocked,
    extractDomain,
    generateBlockRules,
    stripTrackingParams,
    AD_DOMAINS,
    TRACKING_PATTERNS
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NetworkAnalyzer;
}
