'use strict';

const YouTubeBlocker = (() => {

  let videoPlayer = null;
  let observer = null;
  let adCheckInterval = null;
  let isActive = false;
  let adsSkipped = 0;

  const YT_AD_SELECTORS = {
    videoAd: '.ad-showing',
    skipButton: [
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      'button.ytp-ad-skip-button',
      '.ytp-ad-skip-button-slot',
      '[id="skip-button:"] button',
      '.ytp-ad-skip-button-container button',
      'button[id^="skip-button"]'
    ],
    adOverlay: [
      '.ytp-ad-overlay-container',
      '.ytp-ad-overlay-slot',
      '.ytp-ad-overlay-image',
      '.ytp-ad-overlay-close-button',
      '.ytp-ad-image-overlay',
      '.ytp-ad-text-overlay'
    ],
    adBanner: [
      '#player-ads',
      '#masthead-ad',
      '#ad_creative_3',
      'ytd-ad-slot-renderer',
      'ytd-banner-promo-renderer',
      'ytd-statement-banner-renderer',
      'ytd-in-feed-ad-layout-renderer',
      'ytd-promoted-sparkles-web-renderer',
      'ytd-promoted-video-renderer',
      'ytd-display-ad-renderer',
      'ytd-compact-promoted-video-renderer',
      'ytd-action-companion-ad-renderer',
      'ytd-rich-item-renderer:has(.ytd-ad-slot-renderer)',
      '.ytd-rich-section-renderer:has(ytd-ad-slot-renderer)',
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
      '#related ytd-promoted-sparkles-web-renderer',
      'ytd-merch-shelf-renderer',
      'ytd-player-legacy-desktop-watch-ads-renderer'
    ],
    adContainer: [
      '.ytp-ad-module',
      '.ytp-ad-player-overlay',
      '.ytp-ad-player-overlay-layout',
      '.ytp-ad-action-interstitial',
      '.ytp-ad-image-overlay',
      '.ytp-ad-feedback-dialog-container',
      '.ytp-ad-preview-container',
      '.ytp-ad-message-container'
    ],
    antiAdblock: [
      'ytd-enforcement-message-view-model',
      'tp-yt-paper-dialog:has(.yt-playability-error-supported-renderers)',
      '#dialog:has(yt-playability-error-supported-renderers)',
      'yt-playability-error-supported-renderers'
    ]
  };

  function injectPreemptiveCSS() {
    const style = document.createElement('style');
    style.id = 'abp-youtube';
    style.textContent = `
      ${YT_AD_SELECTORS.adBanner.join(',\n      ')} {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        opacity: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
        position: absolute !important;
        visibility: hidden !important;
      }

      ${YT_AD_SELECTORS.adOverlay.join(',\n      ')} {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
      }

      ${YT_AD_SELECTORS.adContainer.join(',\n      ')} {
        display: none !important;
        opacity: 0 !important;
      }

      .ytp-ad-preview-container,
      .ytp-ad-preview-text,
      .ytp-ad-badge,
      .ytp-ad-visit-advertiser-button {
        display: none !important;
      }

      ${YT_AD_SELECTORS.antiAdblock.join(',\n      ')} {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).prepend(style);
  }

  function getPlayer() {
    if (videoPlayer) return videoPlayer;
    videoPlayer = document.querySelector('video.html5-main-video') ||
                  document.querySelector('video.video-stream') ||
                  document.querySelector('#movie_player video') ||
                  document.querySelector('video');
    return videoPlayer;
  }

  function isAdPlaying() {
    const player = document.querySelector('#movie_player');
    if (!player) return false;

    if (player.classList.contains('ad-showing')) return true;
    if (player.classList.contains('ad-interrupting')) return true;

    const adModule = player.querySelector('.ytp-ad-module');
    if (adModule && adModule.children.length > 0) {
      const style = getComputedStyle(adModule);
      if (style.display !== 'none' && style.visibility !== 'hidden') return true;
    }

    const adPreview = player.querySelector('.ytp-ad-preview-container');
    if (adPreview) {
      const style = getComputedStyle(adPreview);
      if (style.display !== 'none') return true;
    }

    return false;
  }

  function skipVideoAd() {
    for (const sel of YT_AD_SELECTORS.skipButton) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        btn.click();
        adsSkipped++;
        reportAdBlocked('skip-button');
        return true;
      }
    }

    const video = getPlayer();
    if (video && isAdPlaying()) {
      if (video.duration && isFinite(video.duration)) {
        video.currentTime = video.duration;
        video.playbackRate = 16;
        adsSkipped++;
        reportAdBlocked('seek-to-end');
        return true;
      }
    }

    return false;
  }

  function muteVideoAd() {
    const video = getPlayer();
    if (video && isAdPlaying()) {
      video.muted = true;
      video.volume = 0;
    }
  }

  function unmuteAfterAd() {
    const video = getPlayer();
    if (video && !isAdPlaying()) {
      video.muted = false;
      video.volume = 1;
      video.playbackRate = 1;
    }
  }

  function removeAdOverlays() {
    for (const sel of YT_AD_SELECTORS.adOverlay) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        el.style.cssText = 'display:none!important;opacity:0!important;visibility:hidden!important;';
      }
    }
  }

  function removeBannerAds() {
    for (const sel of YT_AD_SELECTORS.adBanner) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          el.style.cssText = 'display:none!important;height:0!important;overflow:hidden!important;' +
            'visibility:hidden!important;opacity:0!important;position:absolute!important;';
          el.setAttribute('data-abp-yt', 'blocked');
        }
      } catch {}
    }
  }

  function handleAntiAdblock() {
    for (const sel of YT_AD_SELECTORS.antiAdblock) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          el.remove();
        }
      } catch {}
    }

    const dialogs = document.querySelectorAll('tp-yt-paper-dialog');
    for (const dialog of dialogs) {
      const text = dialog.textContent?.toLowerCase() || '';
      if (text.includes('ad blocker') || text.includes('ad-blocking') ||
          text.includes('allow ads') || text.includes('whitelist') ||
          text.includes('ad blockers violate')) {
        dialog.remove();

        document.body.style.overflow = 'auto';
        document.body.classList.remove('no-scroll');

        const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop');
        if (backdrop) backdrop.remove();

        const video = getPlayer();
        if (video && video.paused) {
          video.play().catch(() => {});
        }
      }
    }
  }

  function checkAndSkipAd() {
    if (isAdPlaying()) {
      muteVideoAd();
      skipVideoAd();

      const video = getPlayer();
      if (video && video.duration && isFinite(video.duration) && video.duration < 120) {
        video.currentTime = video.duration - 0.1;
      }
    } else {
      unmuteAfterAd();
    }

    removeAdOverlays();
    removeBannerAds();
    handleAntiAdblock();
  }

  function injectPlayerInterceptor() {
    const script = document.createElement('script');
    script.textContent = `(${(() => {
      const _fetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0]?.url || args[0]?.toString?.() || '';
        if (typeof url === 'string') {
          if (url.includes('/get_midroll_') || url.includes('&ad_type=') ||
              url.includes('/pagead/') || url.includes('/ptracking') ||
              url.includes('doubleclick.net') || url.includes('/api/stats/ads') ||
              url.includes('googleads') || url.includes('/log_interaction')) {
            return Promise.resolve(new Response('{}', {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }));
          }
        }
        return _fetch.apply(this, args);
      };

      const _xhrOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        const urlStr = url?.toString?.() || '';
        if (urlStr.includes('/get_midroll_') || urlStr.includes('&ad_type=') ||
            urlStr.includes('/pagead/') || urlStr.includes('/ptracking') ||
            urlStr.includes('doubleclick.net') || urlStr.includes('/api/stats/ads') ||
            urlStr.includes('googleads') || urlStr.includes('/log_interaction')) {
          this._abpBlocked = true;
          return _xhrOpen.call(this, method, 'data:application/json,{}', ...rest);
        }
        return _xhrOpen.call(this, method, url, ...rest);
      };

      if (typeof navigator.serviceWorker !== 'undefined') {
        try {
          Object.defineProperty(navigator, 'serviceWorker', {
            get() { return undefined; },
            configurable: true
          });
        } catch {}
      }
    }).toString()})();`;
    (document.head || document.documentElement).prepend(script);
    script.remove();
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      let needsCheck = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const tag = node.tagName?.toLowerCase();

          if (tag === 'ytd-ad-slot-renderer' ||
              tag === 'ytd-promoted-sparkles-web-renderer' ||
              tag === 'ytd-display-ad-renderer' ||
              tag === 'ytd-banner-promo-renderer' ||
              tag === 'ytd-in-feed-ad-layout-renderer' ||
              tag === 'ytd-compact-promoted-video-renderer') {
            node.style.cssText = 'display:none!important;height:0!important;overflow:hidden!important;' +
              'visibility:hidden!important;opacity:0!important;position:absolute!important;';
            node.setAttribute('data-abp-yt', 'blocked');
            reportAdBlocked(`yt-element:${tag}`);
            continue;
          }

          const cls = node.className?.toString?.() || '';
          if (cls.includes('ad-showing') || cls.includes('ad-interrupting') ||
              cls.includes('ytp-ad-') || cls.includes('ytd-ad-')) {
            needsCheck = true;
          }
        }

        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const cls = mutation.target?.className?.toString?.() || '';
          if (cls.includes('ad-showing') || cls.includes('ad-interrupting')) {
            needsCheck = true;
          }
        }
      }

      if (needsCheck) {
        checkAndSkipAd();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  function reportAdBlocked(reason) {
    chrome.runtime?.sendMessage?.({
      type: 'AD_BLOCKED',
      data: {
        tag: 'YT-AD',
        reason: `youtube:${reason}`,
        url: window.location.href,
        timestamp: Date.now()
      }
    }).catch(() => {});
  }

  function getStats() {
    return { adsSkipped, isActive };
  }

  function init() {
    if (isActive) return;
    isActive = true;

    injectPreemptiveCSS();
    injectPlayerInterceptor();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        startObserver();
        checkAndSkipAd();
      });
    } else {
      startObserver();
      checkAndSkipAd();
    }

    adCheckInterval = setInterval(checkAndSkipAd, 500);
    setTimeout(() => {
      clearInterval(adCheckInterval);
      adCheckInterval = setInterval(checkAndSkipAd, 1000);
    }, 30000);

    document.addEventListener('yt-navigate-finish', () => {
      videoPlayer = null;
      setTimeout(checkAndSkipAd, 500);
      setTimeout(removeBannerAds, 1000);
      setTimeout(handleShortsAds, 800);
    });

    window.addEventListener('yt-page-data-updated', () => {
      setTimeout(checkAndSkipAd, 300);
    });

    setInterval(handleShortsAds, 2000);
    setInterval(handleYTMusicAds, 3000);

    console.log('[AdBlockPrime] YouTube blocker active');
  }

  // ─── YouTube Shorts Ads ───

  function handleShortsAds() {
    if (!window.location.pathname.startsWith('/shorts')) return;

    const shortsAdSelectors = [
      'ytd-ad-slot-renderer',
      'ytd-reel-video-renderer:has(.ytd-ad-slot-renderer)',
      '[is-ad]',
      'ytd-promoted-sparkles-web-renderer'
    ];

    for (const sel of shortsAdSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (!el.getAttribute('data-abp-yt')) {
            el.style.cssText = 'display:none!important;height:0!important;overflow:hidden!important;';
            el.setAttribute('data-abp-yt', 'shorts-blocked');
            reportAdBlocked('shorts-ad');
          }
        }
      } catch {}
    }

    const shortsContainer = document.querySelector('ytd-shorts');
    if (shortsContainer) {
      const adOverlays = shortsContainer.querySelectorAll(
        '[class*="ad-badge"], [class*="ad-text"], .ytp-ad-module'
      );
      for (const overlay of adOverlays) {
        overlay.style.cssText = 'display:none!important;';
      }
    }
  }

  // ─── YouTube Music Ads ───

  function handleYTMusicAds() {
    const isYTMusic = window.location.hostname === 'music.youtube.com';
    if (!isYTMusic) return;

    const musicAdSelectors = [
      'ytmusic-player-bar:has(.advertisement)',
      '.ytmusic-player-bar__ad-container',
      'tp-yt-paper-dialog:has([class*="ad"])',
      'ytmusic-promoted-sparkles-renderer',
      '[class*="ad-container"]',
      '.ad-showing .ytmusic-player-bar',
      'ytmusic-mealbar-promo-renderer'
    ];

    for (const sel of musicAdSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          el.style.cssText = 'display:none!important;height:0!important;';
        }
      } catch {}
    }

    if (isAdPlaying()) {
      skipVideoAd();
    }
  }

  return { init, getStats, checkAndSkipAd, isAdPlaying, handleShortsAds, handleYTMusicAds, YT_AD_SELECTORS };
})();
