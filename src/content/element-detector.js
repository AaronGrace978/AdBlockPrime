'use strict';

const ElementDetector = (() => {

  const blockedElements = new WeakSet();
  let totalBlocked = 0;
  let observer = null;

  const HIDDEN_STYLE = 'display:none!important;visibility:hidden!important;' +
    'height:0!important;width:0!important;overflow:hidden!important;' +
    'position:absolute!important;pointer-events:none!important;opacity:0!important;';

  function hideElement(el, reason = '') {
    if (blockedElements.has(el)) return false;
    blockedElements.add(el);
    el.setAttribute('data-abp-hidden', '1');
    el.style.cssText = HIDDEN_STYLE;
    totalBlocked++;

    chrome.runtime?.sendMessage?.({
      type: 'AD_BLOCKED',
      data: {
        tag: el.tagName,
        reason,
        url: window.location.href,
        timestamp: Date.now()
      }
    }).catch(() => {});

    return true;
  }

  function collapseElement(el) {
    if (blockedElements.has(el)) return;
    blockedElements.add(el);
    el.setAttribute('data-abp-collapsed', '1');
    el.style.cssText = 'height:0!important;min-height:0!important;' +
      'max-height:0!important;padding:0!important;margin:0!important;' +
      'border:0!important;overflow:hidden!important;';
    totalBlocked++;
  }

  function scanAndHide() {
    if (typeof AIEngine === 'undefined') return;

    const results = AIEngine.findAdContainers(document);
    for (const result of results) {
      hideElement(result.element, result.reasons.join(', '));
    }

    scanGoogleAds();
    scanIframeAds();
    scanStickyAds();
    scanNativeAds();
  }

  function scanGoogleAds() {
    const googleAdSelectors = [
      'ins.adsbygoogle',
      '[id^="google_ads_"]',
      '[id^="div-gpt-ad"]',
      'iframe[src*="googlesyndication"]',
      'iframe[src*="doubleclick"]',
      'iframe[id^="google_ads_"]',
      '.google-auto-placed',
      '[data-ad-client]',
      '[data-ad-slot]'
    ];

    for (const sel of googleAdSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          hideElement(el, `google-ad:${sel}`);
        }
      } catch {}
    }
  }

  function scanIframeAds() {
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      const src = iframe.src || '';
      const name = iframe.name || '';
      const id = iframe.id || '';

      if (typeof AIEngine !== 'undefined' && AIEngine.isAdRequest(src)) {
        hideElement(iframe, `iframe-ad-src:${src.substring(0, 60)}`);
        continue;
      }

      if (/google_ads|ad_frame|ad-frame|aswift_/i.test(name) ||
          /google_ads|ad_frame|ad-frame|aswift_/i.test(id)) {
        hideElement(iframe, `iframe-ad-id:${id || name}`);
        continue;
      }

      if (iframe.offsetWidth && iframe.offsetHeight) {
        const w = iframe.offsetWidth;
        const h = iframe.offsetHeight;
        const adSizes = [
          [728, 90], [300, 250], [336, 280], [160, 600],
          [120, 600], [300, 600], [970, 250], [320, 50],
          [320, 100], [468, 60], [234, 60]
        ];
        for (const [aw, ah] of adSizes) {
          if (Math.abs(w - aw) <= 5 && Math.abs(h - ah) <= 5) {
            const parentClass = iframe.parentElement?.className || '';
            if (/ad|sponsor|promo/i.test(parentClass)) {
              hideElement(iframe, `iframe-ad-size:${w}x${h}`);
            }
            break;
          }
        }
      }
    }
  }

  function scanStickyAds() {
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (blockedElements.has(el)) continue;
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        const cls = el.className?.toString?.() || '';
        const id = el.id || '';
        if (/ad|banner|sticky.*ad|floating.*ad/i.test(cls) ||
            /ad|banner|sticky.*ad|floating.*ad/i.test(id)) {
          hideElement(el, `sticky-ad:${cls || id}`);
        }
      }
    }
  }

  function scanNativeAds() {
    const nativeAdSelectors = [
      '[class*="taboola"]', '[id*="taboola"]',
      '[class*="outbrain"]', '[id*="outbrain"]',
      '.OUTBRAIN', '#outbrain_widget',
      '[class*="mgid"]', '[id*="mgid"]',
      '[class*="revcontent"]', '[id*="revcontent"]',
      '[class*="zergnet"]',
      '[data-widget-id*="taboola"]',
      '[data-src*="outbrain"]',
      '.promoted-content', '.sponsored-content',
      '[class*="native-ad"]', '[class*="nativead"]',
      'aside[class*="sponsor"]', 'section[class*="sponsor"]',
      '[class*="content-ad"]', '[class*="contentad"]'
    ];

    for (const sel of nativeAdSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          hideElement(el, `native-ad:${sel}`);
        }
      } catch {}
    }
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      let needsScan = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (typeof AIEngine !== 'undefined') {
              const analysis = AIEngine.scoreElement(node);
              if (analysis.isAd) {
                hideElement(node, analysis.reasons.join(', '));
                continue;
              }
            }

            const cls = node.className?.toString?.() || '';
            const id = node.id || '';
            if (/ad|sponsor|promo|taboola|outbrain/i.test(cls) ||
                /ad|sponsor|promo|taboola|outbrain/i.test(id)) {
              needsScan = true;
            }

            if (node.tagName === 'IFRAME' || node.tagName === 'INS') {
              needsScan = true;
            }
          }
        }
      }

      if (needsScan) {
        requestAnimationFrame(() => scanAndHide());
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function getStats() {
    return { totalBlocked, timestamp: Date.now() };
  }

  function init() {
    scanAndHide();
    startObserver();

    setTimeout(scanAndHide, 1000);
    setTimeout(scanAndHide, 3000);
    setTimeout(scanAndHide, 6000);
    setTimeout(scanAndHide, 10000);
  }

  return { init, scanAndHide, hideElement, getStats, startObserver };
})();
