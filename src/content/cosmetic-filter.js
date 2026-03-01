'use strict';

const CosmeticFilter = (() => {

  const GENERIC_SELECTORS = [
    'ins.adsbygoogle',
    '[id^="google_ads_"]',
    '[id^="div-gpt-ad"]',
    'iframe[src*="googlesyndication"]',
    'iframe[src*="doubleclick.net"]',
    '[class*="adsbygoogle"]',
    '.google-auto-placed',
    'amp-ad', 'amp-embed', 'amp-sticky-ad',
    '[id^="taboola-"]', '.taboola-widget',
    '[id^="outbrain_"]', '.OUTBRAIN',
    '[class*="ad-slot"]', '[class*="ad_slot"]',
    '[class*="ad-container"]', '[class*="ad_container"]',
    '[class*="ad-wrapper"]', '[class*="ad_wrapper"]',
    '[class*="ad-banner"]', '[class*="ad_banner"]',
    '[class*="ad-unit"]', '[class*="ad_unit"]',
    '[data-ad]', '[data-ad-slot]', '[data-ad-client]',
    '[data-google-query-id]',
    '[class*="sponsor-"]', '[class*="sponsored-"]',
    '.ad-leaderboard', '.ad-skyscraper', '.ad-rectangle',
    '.dfp-ad', '[id^="dfp-"]',
    'a[href*="doubleclick.net"]',
    'a[href*="googleadservices"]',
    'iframe[src*="amazon-adsystem"]',
    '.ad-overlay', '.ad-popup',
    '[class*="cookie-consent"]',
    '#onetrust-banner-sdk',
    '.CookieConsent',
    '#gdpr-consent-notice',
    '[class*="newsletter-popup"]',
    '.email-signup-overlay'
  ];

  let styleElement = null;
  let customRules = [];

  function injectStyles() {
    if (styleElement) return;

    styleElement = document.createElement('style');
    styleElement.id = 'abp-cosmetic';
    styleElement.setAttribute('data-abp', 'cosmetic');

    const selectorCSS = [...GENERIC_SELECTORS, ...customRules]
      .join(',\n') + ` {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      width: 0 !important;
      min-height: 0 !important;
      min-width: 0 !important;
      max-height: 0 !important;
      max-width: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      position: absolute !important;
      z-index: -9999 !important;
    }`;

    const layoutFixes = `
    body[style*="overflow: hidden"],
    body[style*="overflow:hidden"] {
      overflow: auto !important;
    }
    html[style*="overflow: hidden"],
    html[style*="overflow:hidden"] {
      overflow: auto !important;
    }
    body[class*="modal-open"],
    body[class*="no-scroll"],
    body[class*="noscroll"] {
      overflow: auto !important;
      position: static !important;
    }
    `;

    styleElement.textContent = selectorCSS + layoutFixes;
    (document.head || document.documentElement).appendChild(styleElement);
  }

  function addCustomRule(selector) {
    if (!customRules.includes(selector)) {
      customRules.push(selector);
      refreshStyles();
    }
  }

  function removeCustomRule(selector) {
    customRules = customRules.filter(r => r !== selector);
    refreshStyles();
  }

  function refreshStyles() {
    if (styleElement) {
      styleElement.remove();
      styleElement = null;
    }
    injectStyles();
  }

  function fixEmptySpaces() {
    const hiddenAds = document.querySelectorAll('[data-abp-hidden="1"]');
    for (const el of hiddenAds) {
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          c => !c.hasAttribute('data-abp-hidden')
        );
        if (siblings.length === 0 && parent.offsetHeight < 10) {
          parent.style.display = 'none';
          parent.setAttribute('data-abp-empty', '1');
        }
      }
    }
  }

  function init() {
    injectStyles();
    setTimeout(fixEmptySpaces, 2000);
    setTimeout(fixEmptySpaces, 5000);
  }

  return {
    init,
    addCustomRule,
    removeCustomRule,
    refreshStyles,
    fixEmptySpaces,
    GENERIC_SELECTORS
  };
})();
