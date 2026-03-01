'use strict';

const SiteModules = (() => {

  const modules = {};

  // ─── Twitch ───
  modules.twitch = {
    hosts: ['www.twitch.tv', 'twitch.tv', 'm.twitch.tv'],

    css: `
      .top-nav__ad-link, [data-a-target="top-nav__ad-link"],
      .stream-display-ad__container,
      [data-test-selector="sad-overlay"],
      .channel-leaderboard-header-rotating__animation,
      [class*="ScAdContainer"], [class*="AdBanner"],
      div[data-a-target="video-ad-countdown"],
      div[data-a-target="video-ad-label"],
      .tw-absolute:has(> .tw-c-background-overlay),
      [class*="ad-banner"], [class*="ad-manager"],
      .prime-offers, [data-a-target="prime-offers"],
      [data-a-target="bits-crate"], .channel-leaderboard,
      [data-a-target="stream-game-link"] + div:has([class*="ad"]) {
        display: none !important;
        height: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `,

    init() {
      this.injectCSS();
      this.interceptAds();
      this.observePlayer();
    },

    injectCSS() {
      const s = document.createElement('style');
      s.id = 'abp-twitch';
      s.textContent = this.css;
      (document.head || document.documentElement).prepend(s);
    },

    interceptAds() {
      const script = document.createElement('script');
      script.textContent = `(${(() => {
        const _worker = window.Worker;
        window.Worker = function(url, opts) {
          const urlStr = url?.toString?.() || '';
          if (urlStr.includes('amazon-adsystem') || urlStr.includes('imasdk')) {
            return { postMessage() {}, terminate() {}, addEventListener() {}, onmessage: null };
          }
          return new _worker(url, opts);
        };
        window.Worker.prototype = _worker.prototype;

        const _fetch = window.fetch;
        window.fetch = function(...args) {
          const url = args[0]?.url || args[0]?.toString?.() || '';
          if (typeof url === 'string' &&
              (url.includes('usher.ttvnw.net') && url.includes('&ad_') ||
               url.includes('amazon-adsystem') || url.includes('imasdk.googleapis.com'))) {
            return Promise.resolve(new Response('', { status: 204 }));
          }
          return _fetch.apply(this, args);
        };
      }).toString()})();`;
      (document.head || document.documentElement).prepend(script);
      script.remove();
    },

    observePlayer() {
      const obs = new MutationObserver(() => {
        const adOverlay = document.querySelector('[data-test-selector="sad-overlay"]');
        if (adOverlay) {
          adOverlay.style.cssText = 'display:none!important;';
          const video = document.querySelector('video');
          if (video) { video.muted = false; video.volume = 1; }
        }

        const adCountdown = document.querySelector('div[data-a-target="video-ad-countdown"]');
        if (adCountdown) {
          adCountdown.style.cssText = 'display:none!important;';
        }
      });
      if (document.body) {
        obs.observe(document.body, { childList: true, subtree: true });
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          obs.observe(document.body, { childList: true, subtree: true });
        });
      }
    }
  };

  // ─── Facebook / Meta ───
  modules.facebook = {
    hosts: ['www.facebook.com', 'facebook.com', 'web.facebook.com', 'm.facebook.com'],

    css: `
      [data-pagelet="RightRail"] > div:has([aria-label*="Sponsored" i]),
      [data-pagelet="RightRail"] > div:has(a[href*="ads"]),
      div[data-pagelet*="FeedUnit"]:has(a[href*="/ads/"]),
      div[data-pagelet*="FeedUnit"]:has(span:has-text("Sponsored")),
      [role="article"]:has(a[href*="ads.facebook"]),
      [role="article"]:has(a[aria-label*="Sponsored" i]),
      div:has(> [data-testid="fbfeed_story"]):has(a[href*="/ads/"]),
      [data-pagelet="Stories"] + div:has([class*="ad"]),
      [data-pagelet="MarketplaceDiscover"] > div:has(a[href*="sponsored"]),
      .ego_unit, .ego_section,
      ._4-u2._3-8x:has(a[href*="/ads/"]),
      div[id^="u_"] a[href*="campaign_id"],
      [data-ad-comet-preview], [data-ad-preview],
      div[aria-label="Sponsored"] {
        display: none !important;
        height: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
      }
    `,

    init() {
      this.injectCSS();
      this.hideSponsored();
    },

    injectCSS() {
      const s = document.createElement('style');
      s.id = 'abp-facebook';
      s.textContent = this.css;
      (document.head || document.documentElement).prepend(s);
    },

    hideSponsored() {
      const hide = () => {
        const articles = document.querySelectorAll('[role="article"], [data-pagelet*="FeedUnit"]');
        for (const article of articles) {
          if (article.getAttribute('data-abp-checked')) continue;
          article.setAttribute('data-abp-checked', '1');

          const links = article.querySelectorAll('a[href]');
          let isAd = false;

          for (const link of links) {
            if (link.href?.includes('/ads/') || link.href?.includes('campaign_id') ||
                link.href?.includes('ad_id=')) {
              isAd = true;
              break;
            }
          }

          if (!isAd) {
            const spans = article.querySelectorAll('span, a');
            for (const span of spans) {
              const text = span.textContent?.trim()?.toLowerCase();
              if (text === 'sponsored' || text === 'suggested for you' ||
                  text === 'paid partnership') {
                isAd = true;
                break;
              }
            }
          }

          if (isAd) {
            article.style.cssText = 'display:none!important;height:0!important;overflow:hidden!important;';
            chrome.runtime?.sendMessage?.({
              type: 'AD_BLOCKED',
              data: { tag: 'FB-AD', reason: 'facebook:sponsored', url: window.location.href, timestamp: Date.now() }
            }).catch(() => {});
          }
        }
      };

      const obs = new MutationObserver(hide);
      const start = () => obs.observe(document.body, { childList: true, subtree: true });
      if (document.body) start();
      else document.addEventListener('DOMContentLoaded', start);
      setInterval(hide, 2000);
    }
  };

  // ─── Twitter / X ───
  modules.twitter = {
    hosts: ['twitter.com', 'x.com', 'mobile.twitter.com', 'mobile.x.com'],

    css: `
      [data-testid="placementTracking"],
      article:has([data-testid="placementTracking"]),
      div[data-testid="cellInnerDiv"]:has([data-testid="placementTracking"]),
      [data-testid="trend"]:has(span:has-text("Promoted")),
      [data-testid="trend"]:has(span:has-text("Ad")),
      aside[aria-label*="relevant people" i]:has(a[href*="promoted"]),
      div[data-testid="cellInnerDiv"]:has(div[dir="ltr"]:has-text("Promoted")),
      div[data-testid="cellInnerDiv"]:has(div[dir="ltr"]:has-text("Ad")) {
        display: none !important;
        height: 0 !important;
        overflow: hidden !important;
      }
    `,

    init() {
      this.injectCSS();
      this.hidePromoted();
    },

    injectCSS() {
      const s = document.createElement('style');
      s.id = 'abp-twitter';
      s.textContent = this.css;
      (document.head || document.documentElement).prepend(s);
    },

    hidePromoted() {
      const hide = () => {
        const cells = document.querySelectorAll('[data-testid="cellInnerDiv"]');
        for (const cell of cells) {
          if (cell.getAttribute('data-abp-checked')) continue;
          cell.setAttribute('data-abp-checked', '1');

          if (cell.querySelector('[data-testid="placementTracking"]')) {
            cell.style.cssText = 'display:none!important;height:0!important;';
            chrome.runtime?.sendMessage?.({
              type: 'AD_BLOCKED',
              data: { tag: 'X-AD', reason: 'twitter:promoted', url: window.location.href, timestamp: Date.now() }
            }).catch(() => {});
            continue;
          }

          const spans = cell.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent?.trim();
            if (text === 'Promoted' || text === 'Ad') {
              cell.style.cssText = 'display:none!important;height:0!important;';
              chrome.runtime?.sendMessage?.({
                type: 'AD_BLOCKED',
                data: { tag: 'X-AD', reason: 'twitter:promoted-text', url: window.location.href, timestamp: Date.now() }
              }).catch(() => {});
              break;
            }
          }
        }
      };

      const obs = new MutationObserver(hide);
      const start = () => obs.observe(document.body, { childList: true, subtree: true });
      if (document.body) start();
      else document.addEventListener('DOMContentLoaded', start);
      setInterval(hide, 2000);
    }
  };

  // ─── Reddit ───
  modules.reddit = {
    hosts: ['www.reddit.com', 'reddit.com', 'old.reddit.com', 'new.reddit.com', 'sh.reddit.com'],

    css: `
      [data-testid="promoted-link"],
      .promotedlink, .promoted,
      shreddit-ad-post, [is-promoted],
      .listing-ad, #ad-container,
      [class*="promoted-"], [class*="ad-slot"],
      shreddit-experience-tree > div:has(shreddit-ad-post),
      .ad-banner-container, #leaderboard-ad,
      .side .spacer:has(.ad-container),
      #siteTable .thing.promoted,
      .feed-card:has([data-testid="promoted-badge"]),
      faceplate-tracker[noun="ad"], faceplate-tracker[noun="promoted"],
      [slot="full-post-link"]:has([data-testid="promoted-badge"]) {
        display: none !important;
        height: 0 !important;
        overflow: hidden !important;
      }
    `,

    init() {
      this.injectCSS();
      this.hidePromoted();
    },

    injectCSS() {
      const s = document.createElement('style');
      s.id = 'abp-reddit';
      s.textContent = this.css;
      (document.head || document.documentElement).prepend(s);
    },

    hidePromoted() {
      const hide = () => {
        const promoted = document.querySelectorAll(
          'shreddit-ad-post, [data-testid="promoted-link"], .promotedlink, .promoted, [is-promoted]'
        );
        for (const el of promoted) {
          const container = el.closest('article, .thing, shreddit-post, [data-testid="post-container"]') || el;
          if (!container.getAttribute('data-abp-hidden')) {
            container.style.cssText = 'display:none!important;height:0!important;';
            container.setAttribute('data-abp-hidden', '1');
            chrome.runtime?.sendMessage?.({
              type: 'AD_BLOCKED',
              data: { tag: 'REDDIT-AD', reason: 'reddit:promoted', url: window.location.href, timestamp: Date.now() }
            }).catch(() => {});
          }
        }
      };

      const obs = new MutationObserver(hide);
      const start = () => obs.observe(document.body, { childList: true, subtree: true });
      if (document.body) start();
      else document.addEventListener('DOMContentLoaded', start);
      setInterval(hide, 2000);
    }
  };

  // ─── Module Loader ───

  function getModuleForHost(hostname) {
    for (const [, mod] of Object.entries(modules)) {
      if (mod.hosts.some(h => hostname === h || hostname.endsWith('.' + h))) {
        return mod;
      }
    }
    return null;
  }

  function init(hostname) {
    const mod = getModuleForHost(hostname);
    if (mod) {
      mod.init();
      console.log(`[AdBlockPrime] Site module active: ${hostname}`);
      return true;
    }
    return false;
  }

  return { init, getModuleForHost, modules };
})();
