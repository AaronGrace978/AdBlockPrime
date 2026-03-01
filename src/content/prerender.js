'use strict';

const PreRenderBlocker = (() => {

  const CRITICAL_CSS = `
    ins.adsbygoogle,
    [id^="google_ads_"],
    [id^="div-gpt-ad"],
    iframe[src*="googlesyndication"],
    iframe[src*="doubleclick.net"],
    [class*="adsbygoogle"],
    .google-auto-placed,
    amp-ad, amp-embed, amp-sticky-ad,
    [id^="taboola-"], .taboola-widget,
    [id^="outbrain_"], .OUTBRAIN,
    [class*="ad-slot"], [class*="ad_slot"],
    [class*="ad-container"], [class*="ad_container"],
    [class*="ad-wrapper"], [class*="ad_wrapper"],
    [class*="ad-banner"], [class*="ad_banner"],
    [class*="ad-unit"], [class*="ad_unit"],
    [data-ad], [data-ad-slot], [data-ad-client],
    [data-google-query-id],
    [class*="sponsor-"], [class*="sponsored-"],
    .ad-leaderboard, .ad-skyscraper, .ad-rectangle,
    .dfp-ad, [id^="dfp-"],
    iframe[src*="amazon-adsystem"],
    .ad-overlay, .ad-popup,
    ytd-ad-slot-renderer,
    ytd-banner-promo-renderer,
    ytd-promoted-sparkles-web-renderer,
    ytd-promoted-video-renderer,
    ytd-display-ad-renderer,
    ytd-compact-promoted-video-renderer,
    ytd-in-feed-ad-layout-renderer,
    ytd-action-companion-ad-renderer,
    ytd-player-legacy-desktop-watch-ads-renderer,
    #masthead-ad, #player-ads,
    .ytp-ad-overlay-container,
    .ytp-ad-module,
    [class*="ad-placement"],
    [class*="advert-"],
    [class*="advertisement"],
    [id*="sponsored"],
    [class*="promoted-content"],
    [class*="native-ad"],
    [class*="mgid"],
    [class*="revcontent"],
    [class*="zergnet"] {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      width: 0 !important;
      max-height: 0 !important;
      max-width: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      position: absolute !important;
      clip: rect(0, 0, 0, 0) !important;
      clip-path: inset(50%) !important;
    }

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
    body[class*="noscroll"],
    body[class*="scroll-locked"] {
      overflow: auto !important;
      position: static !important;
    }
  `;

  function injectImmediately() {
    try {
      const style = document.createElement('style');
      style.id = 'abp-prerender';
      style.setAttribute('data-abp', 'prerender');
      style.textContent = CRITICAL_CSS;

      if (document.documentElement) {
        document.documentElement.prepend(style);
      } else {
        const observer = new MutationObserver(() => {
          if (document.documentElement) {
            document.documentElement.prepend(style);
            observer.disconnect();
          }
        });
        observer.observe(document, { childList: true });
      }
    } catch (_) {}
  }

  function injectMainWorldFallback() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        const isFirefox = typeof browser !== 'undefined' && browser.runtime;
        if (isFirefox) {
          const s = document.createElement('script');
          s.src = chrome.runtime.getURL('src/content/prerender-main.js');
          (document.documentElement || document.head || document.body).prepend(s);
          s.onload = () => s.remove();
        }
      }
    } catch (_) {}
  }

  function init() {
    injectImmediately();
    injectMainWorldFallback();
  }

  return { init, injectImmediately };
})();

PreRenderBlocker.init();
