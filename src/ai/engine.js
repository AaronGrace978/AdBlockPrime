'use strict';

const AIEngine = (() => {

  const AD_SIGNALS = {
    classPatterns: [
      /ad[-_]?banner/i, /ad[-_]?container/i, /ad[-_]?wrapper/i, /ad[-_]?slot/i,
      /ad[-_]?unit/i, /ad[-_]?block/i, /ad[-_]?frame/i, /ad[-_]?label/i,
      /ad[-_]?holder/i, /ad[-_]?overlay/i, /ad[-_]?leaderboard/i, /ad[-_]?skyscraper/i,
      /sponsor/i, /promoted/i, /advertisement/i, /dfp[-_]/i, /gpt[-_]ad/i,
      /google[-_]?ad/i, /adsense/i, /doubleclick/i, /taboola/i, /outbrain/i,
      /native[-_]?ad/i, /in[-_]?feed[-_]?ad/i, /sticky[-_]?ad/i, /floating[-_]?ad/i,
      /interstitial/i, /pre[-_]?roll/i, /mid[-_]?roll/i, /post[-_]?roll/i
    ],

    idPatterns: [
      /^ad[-_]/i, /[-_]ad$/i, /^ads[-_]/i, /[-_]ads$/i,
      /^advert/i, /^banner[-_]?ad/i, /^sponsor/i, /^promo[-_]/i,
      /google_ads/i, /div-gpt-ad/i, /^dfp-/i
    ],

    srcPatterns: [
      /doubleclick\.net/i, /googlesyndication/i, /googleadservices/i,
      /amazon-adsystem/i, /facebook\.com\/tr/i, /adnxs\.com/i,
      /criteo\./i, /taboola/i, /outbrain/i, /moatads/i,
      /adsrvr\.org/i, /adform\.net/i, /rubiconproject/i,
      /pubmatic\.com/i, /openx\.net/i, /casalemedia/i,
      /serving-sys\.com/i, /2mdn\.net/i, /smaato/i
    ],

    sizeSignals: [
      { w: 728, h: 90 },   // leaderboard
      { w: 300, h: 250 },  // medium rectangle
      { w: 336, h: 280 },  // large rectangle
      { w: 160, h: 600 },  // wide skyscraper
      { w: 120, h: 600 },  // skyscraper
      { w: 300, h: 600 },  // half page
      { w: 970, h: 250 },  // billboard
      { w: 970, h: 90 },   // large leaderboard
      { w: 320, h: 50 },   // mobile banner
      { w: 320, h: 100 },  // mobile large banner
      { w: 468, h: 60 },   // full banner
      { w: 234, h: 60 },   // half banner
      { w: 300, h: 1050 }, // portrait
      { w: 250, h: 250 },  // square
      { w: 200, h: 200 },  // small square
    ],

    textIndicators: [
      'advertisement', 'sponsored', 'ad', 'promoted', 'paid',
      'partner content', 'suggested post', 'recommended',
      'around the web', 'you may like', 'from our partners',
      'paid content', 'branded content', 'presented by',
      'brought to you by', 'sponsored content'
    ],

    attributePatterns: [
      { attr: 'data-ad', pattern: /./ },
      { attr: 'data-ad-slot', pattern: /./ },
      { attr: 'data-ad-client', pattern: /./ },
      { attr: 'data-google-query-id', pattern: /./ },
      { attr: 'data-ad-region', pattern: /./ },
      { attr: 'data-native-ad', pattern: /./ },
      { attr: 'data-sponsored', pattern: /./ },
      { attr: 'aria-label', pattern: /ad|sponsor|promot/i }
    ]
  };

  const WEIGHTS = {
    className: 30,
    id: 25,
    src: 40,
    size: 20,
    text: 15,
    attribute: 35,
    iframe: 15,
    emptyContainer: 10,
    tracking: 25,
    zIndex: 10,
    position: 10,
    parentChain: 15
  };

  const THRESHOLD = 45;

  function scoreElement(el) {
    let score = 0;
    const reasons = [];

    const className = el.className?.toString?.() || '';
    const id = el.id || '';

    for (const pattern of AD_SIGNALS.classPatterns) {
      if (pattern.test(className)) {
        score += WEIGHTS.className;
        reasons.push(`class:${className.substring(0, 40)}`);
        break;
      }
    }

    for (const pattern of AD_SIGNALS.idPatterns) {
      if (pattern.test(id)) {
        score += WEIGHTS.id;
        reasons.push(`id:${id}`);
        break;
      }
    }

    const src = el.src || el.getAttribute?.('data-src') || '';
    if (src) {
      for (const pattern of AD_SIGNALS.srcPatterns) {
        if (pattern.test(src)) {
          score += WEIGHTS.src;
          reasons.push(`src:${src.substring(0, 50)}`);
          break;
        }
      }
    }

    if (el.offsetWidth && el.offsetHeight) {
      for (const size of AD_SIGNALS.sizeSignals) {
        const wMatch = Math.abs(el.offsetWidth - size.w) <= 5;
        const hMatch = Math.abs(el.offsetHeight - size.h) <= 5;
        if (wMatch && hMatch) {
          score += WEIGHTS.size;
          reasons.push(`size:${el.offsetWidth}x${el.offsetHeight}`);
          break;
        }
      }
    }

    for (const sigObj of AD_SIGNALS.attributePatterns) {
      const val = el.getAttribute?.(sigObj.attr);
      if (val && sigObj.pattern.test(val)) {
        score += WEIGHTS.attribute;
        reasons.push(`attr:${sigObj.attr}`);
        break;
      }
    }

    if (el.tagName === 'IFRAME') {
      score += WEIGHTS.iframe;
      reasons.push('iframe');
      const iframeSrc = el.src || '';
      for (const pattern of AD_SIGNALS.srcPatterns) {
        if (pattern.test(iframeSrc)) {
          score += WEIGHTS.src;
          reasons.push(`iframe-src:${iframeSrc.substring(0, 50)}`);
          break;
        }
      }
    }

    if (el.children && el.children.length === 0 && el.offsetHeight > 0 && el.offsetHeight < 300) {
      const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
      if (style && (style.backgroundImage !== 'none' || (className && /ad/i.test(className)))) {
        score += WEIGHTS.emptyContainer;
        reasons.push('empty-ad-container');
      }
    }

    const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
    if (style) {
      const zIndex = parseInt(style.zIndex, 10);
      if (zIndex > 9000 && style.position === 'fixed') {
        score += WEIGHTS.zIndex;
        reasons.push('high-z-fixed');
      }
      if (style.position === 'fixed' && el.offsetHeight < 200 &&
          (el.offsetTop < 5 || (el.ownerDocument?.documentElement?.clientHeight - el.offsetTop - el.offsetHeight) < 5)) {
        score += WEIGHTS.position;
        reasons.push('sticky-bar');
      }
    }

    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 3) {
      const pc = parent.className?.toString?.() || '';
      const pid = parent.id || '';
      for (const pattern of AD_SIGNALS.classPatterns) {
        if (pattern.test(pc) || pattern.test(pid)) {
          score += WEIGHTS.parentChain;
          reasons.push(`parent-ad:${pc.substring(0, 30)}`);
          parent = null;
          break;
        }
      }
      if (parent) {
        parent = parent.parentElement;
        depth++;
      }
    }

    return { score, isAd: score >= THRESHOLD, reasons };
  }

  function analyzeTextContent(el) {
    if (!el || !el.textContent) return false;
    const text = el.textContent.trim().toLowerCase();
    if (text.length > 50) return false;
    return AD_SIGNALS.textIndicators.some(indicator => text.includes(indicator));
  }

  function findAdContainers(root = document) {
    const candidates = root.querySelectorAll(
      'div, section, aside, article, iframe, ins, object, embed, span, figure'
    );
    const results = [];

    for (const el of candidates) {
      const analysis = scoreElement(el);
      if (analysis.isAd) {
        results.push({ element: el, ...analysis });
      }
    }

    return deduplicateResults(results);
  }

  function deduplicateResults(results) {
    const dominated = new Set();
    for (let i = 0; i < results.length; i++) {
      for (let j = 0; j < results.length; j++) {
        if (i !== j && results[i].element.contains(results[j].element)) {
          dominated.add(j);
        }
      }
    }
    return results.filter((_, idx) => !dominated.has(idx));
  }

  function isAdRequest(url) {
    if (!url) return false;
    for (const pattern of AD_SIGNALS.srcPatterns) {
      if (pattern.test(url)) return true;
    }

    const networkPatterns = [
      /pagead/i, /adserver/i, /adclick/i, /adview/i,
      /\/ads\//i, /\/ad\//i, /tracking/i, /pixel/i,
      /beacon/i, /telemetry/i, /analytics/i, /impression/i,
      /click\.php/i, /banner\./i, /popunder/i, /popup/i
    ];

    for (const pattern of networkPatterns) {
      if (pattern.test(url)) return true;
    }

    return false;
  }

  const learningStore = {
    patterns: new Map(),

    recordDetection(domain, selector, wasCorrect) {
      const key = `${domain}::${selector}`;
      const entry = this.patterns.get(key) || { hits: 0, misses: 0 };
      if (wasCorrect) entry.hits++;
      else entry.misses++;
      this.patterns.set(key, entry);
    },

    getConfidence(domain, selector) {
      const key = `${domain}::${selector}`;
      const entry = this.patterns.get(key);
      if (!entry) return 0.5;
      const total = entry.hits + entry.misses;
      if (total < 3) return 0.5;
      return entry.hits / total;
    },

    exportData() {
      const data = {};
      for (const [key, value] of this.patterns) {
        data[key] = value;
      }
      return data;
    },

    importData(data) {
      if (!data) return;
      for (const [key, value] of Object.entries(data)) {
        this.patterns.set(key, value);
      }
    }
  };

  return {
    scoreElement,
    findAdContainers,
    isAdRequest,
    analyzeTextContent,
    learningStore,
    THRESHOLD,
    AD_SIGNALS
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIEngine;
}
