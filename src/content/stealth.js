'use strict';

const StealthModule = (() => {

  function injectEarly() {
    const script = document.createElement('script');
    script.textContent = `(${earlyInjection.toString()})();`;
    (document.head || document.documentElement).prepend(script);
    script.remove();
  }

  function earlyInjection() {
    const _originalDefineProperty = Object.defineProperty;
    const _originalGetComputedStyle = window.getComputedStyle;
    const _originalQuerySelector = Document.prototype.querySelector;
    const _originalQSA = Document.prototype.querySelectorAll;
    const _originalGetElementById = Document.prototype.getElementById;
    const _originalFetch = window.fetch;
    const _originalXHROpen = XMLHttpRequest.prototype.open;
    const _originalXHRSend = XMLHttpRequest.prototype.send;

    const adBlockDetectionSelectors = [
      '#ad-test', '#ad_test', '.ad-test', '.ad_test',
      '#ads-test', '#ads_test', '.ads-test', '.ads_test',
      '#adblock-test', '#adblock_test', '#detect-adblock',
      '.ad-banner-test', '#banner_ad', '#adsbox', '#ad_box',
      '#ad-tester', '.ad-tester', '#carbonads', '#ad-check',
      '.ad_status', '#adTest', '.adsbox'
    ];

    const abDetectionScripts = [
      /adblock/i, /ad[-_]?block/i, /detectAd/i, /adDetect/i,
      /blockAdBlock/i, /fuckAdBlock/i, /sniffAdBlock/i,
      /canRunAds/i, /isAdBlockActive/i, /adBlockEnabled/i,
      /checkAds/i, /adsBlocked/i, /adsbygoogle/i
    ];

    const fakeAdElements = new Map();

    function createFakeAdElement(selector) {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute!important;width:1px!important;height:1px!important;' +
        'overflow:hidden!important;clip:rect(0,0,0,0)!important;opacity:0.01!important;' +
        'pointer-events:none!important;z-index:-1!important;';

      if (selector.startsWith('#')) {
        el.id = selector.slice(1);
      } else if (selector.startsWith('.')) {
        el.className = selector.slice(1);
      }

      return el;
    }

    const spoofGetComputedStyle = new Proxy(_originalGetComputedStyle, {
      apply(target, thisArg, args) {
        const result = Reflect.apply(target, thisArg, args);
        const el = args[0];
        if (el && fakeAdElements.has(el)) {
          return new Proxy(result, {
            get(target, prop) {
              if (prop === 'display') return 'block';
              if (prop === 'visibility') return 'visible';
              if (prop === 'opacity') return '1';
              if (prop === 'height') return '1px';
              if (prop === 'width') return '1px';
              const val = target[prop];
              return typeof val === 'function' ? val.bind(target) : val;
            }
          });
        }
        return result;
      }
    });
    window.getComputedStyle = spoofGetComputedStyle;

    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

    function spoofDimensionGetter(originalDescriptor, fakeValue) {
      return {
        get() {
          if (fakeAdElements.has(this)) return fakeValue;
          return originalDescriptor.get.call(this);
        },
        configurable: true
      };
    }

    if (originalOffsetHeight) {
      _originalDefineProperty(HTMLElement.prototype, 'offsetHeight',
        spoofDimensionGetter(originalOffsetHeight, 1));
    }
    if (originalOffsetWidth) {
      _originalDefineProperty(HTMLElement.prototype, 'offsetWidth',
        spoofDimensionGetter(originalOffsetWidth, 1));
    }
    if (originalClientHeight) {
      _originalDefineProperty(HTMLElement.prototype, 'clientHeight',
        spoofDimensionGetter(originalClientHeight, 1));
    }
    if (originalClientWidth) {
      _originalDefineProperty(HTMLElement.prototype, 'clientWidth',
        spoofDimensionGetter(originalClientWidth, 1));
    }

    const originalGetBCR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function() {
      const rect = originalGetBCR.call(this);
      if (fakeAdElements.has(this)) {
        return new DOMRect(rect.x, rect.y, 1, 1);
      }
      return rect;
    };

    Document.prototype.getElementById = function(id) {
      const result = _originalGetElementById.call(this, id);
      if (!result && adBlockDetectionSelectors.includes(`#${id}`)) {
        let fake = fakeAdElements.get(`#${id}`);
        if (!fake) {
          fake = createFakeAdElement(`#${id}`);
          fakeAdElements.set(`#${id}`, fake);
          fakeAdElements.set(fake, true);
          document.body?.appendChild(fake);
        }
        return fake;
      }
      return result;
    };

    const originalXHRHandler = {
      apply(target, thisArg, args) {
        const url = args[1]?.toString() || '';
        for (const pattern of abDetectionScripts) {
          if (pattern.test(url)) {
            args[1] = 'data:text/javascript,';
            break;
          }
        }
        return Reflect.apply(target, thisArg, args);
      }
    };
    XMLHttpRequest.prototype.open = new Proxy(_originalXHROpen, originalXHRHandler);

    const originalFetchHandler = {
      apply(target, thisArg, args) {
        const url = args[0]?.toString?.() || args[0]?.url?.toString?.() || '';
        for (const pattern of abDetectionScripts) {
          if (pattern.test(url)) {
            return Promise.resolve(new Response('', { status: 200 }));
          }
        }
        return Reflect.apply(target, thisArg, args);
      }
    };
    window.fetch = new Proxy(_originalFetch, originalFetchHandler);

    const originalCreateElement = document.createElement.bind(document);
    document.createElement = function(tag, options) {
      const el = originalCreateElement(tag, options);
      if (tag.toLowerCase() === 'script') {
        const originalSetAttribute = el.setAttribute.bind(el);
        let _src = '';
        _originalDefineProperty(el, 'src', {
          get() { return _src; },
          set(val) {
            for (const pattern of abDetectionScripts) {
              if (pattern.test(val)) {
                _src = 'data:text/javascript,';
                originalSetAttribute('src', 'data:text/javascript,');
                return;
              }
            }
            _src = val;
            originalSetAttribute('src', val);
          },
          configurable: true
        });
      }
      return el;
    };

    window.canRunAds = true;
    window.isAdBlockActive = false;
    window.adBlockDetected = false;

    try { window.google_ad_status = 1; } catch {}
    try { window.adsbygoogle = window.adsbygoogle || []; } catch {}
    try {
      window.adsbygoogle.loaded = true;
      window.adsbygoogle.push = function() { return this.length; };
    } catch {}

    const _setInterval = window.setInterval;
    window.setInterval = function(fn, delay, ...args) {
      const fnStr = typeof fn === 'function' ? fn.toString() : String(fn);
      for (const pattern of abDetectionScripts) {
        if (pattern.test(fnStr)) {
          return _setInterval(() => {}, 86400000);
        }
      }
      return _setInterval(fn, delay, ...args);
    };

    const _setTimeout = window.setTimeout;
    window.setTimeout = function(fn, delay, ...args) {
      const fnStr = typeof fn === 'function' ? fn.toString() : String(fn);
      for (const pattern of abDetectionScripts) {
        if (pattern.test(fnStr)) {
          return _setTimeout(() => {}, 86400000);
        }
      }
      return _setTimeout(fn, delay, ...args);
    };

    // YouTube-specific anti-detection
    const ytHost = window.location.hostname;
    if (ytHost === 'www.youtube.com' || ytHost === 'youtube.com' || ytHost === 'm.youtube.com') {
      // Prevent YouTube's ad blocker detection from triggering
      const _ytDefineProperty = Object.defineProperty;

      // Intercept YouTube's internal ad blocker detection signals
      try {
        // Spoof the yt.config_ variables YouTube uses for detection
        const _origPush = Array.prototype.push;
        const ytConfigWatch = {
          apply(target, thisArg, args) {
            for (const arg of args) {
              if (arg && typeof arg === 'object') {
                // Neutralize ad blocker detection payloads
                if (arg.key === 'AD_BLOCKED' || arg.key === 'ad_blocked') {
                  arg.value = false;
                  continue;
                }
                if (arg.adPlacements) {
                  arg.adPlacements = [];
                }
                if (arg.playerAds) {
                  arg.playerAds = [];
                }
              }
            }
            return Reflect.apply(target, thisArg, args);
          }
        };

        // Hook into YouTube's message channel to suppress ad blocker warnings
        const _postMessage = window.postMessage;
        window.postMessage = function(data, ...rest) {
          if (typeof data === 'string') {
            try {
              const parsed = JSON.parse(data);
              if (parsed?.type === 'adBlockDetected' || parsed?.event === 'adBlockDetected') {
                return;
              }
            } catch {}
          }
          return _postMessage.call(this, data, ...rest);
        };

        // Prevent enforcement dialogs
        const _attachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function(opts) {
          const shadow = _attachShadow.call(this, opts);
          const _shadowAppendChild = shadow.appendChild.bind(shadow);

          shadow.appendChild = function(child) {
            if (child.tagName === 'STYLE' && child.textContent?.includes('enforcement')) {
              return child;
            }
            return _shadowAppendChild(child);
          };

          return shadow;
        };
      } catch {}
    }
  }

  function interceptAntiAdblockCSS() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.tagName === 'STYLE' || node.tagName === 'LINK') {
            const text = node.textContent || '';
            if (/\.ad[-_]?block/i.test(text) || /adblock[-_]?detected/i.test(text)) {
              node.textContent = '';
            }
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function removeAntiAdblockOverlays() {
    const overlaySelectors = [
      '[class*="adblock" i][class*="overlay" i]',
      '[class*="adblock" i][class*="modal" i]',
      '[class*="adblock" i][class*="wall" i]',
      '[id*="adblock" i][class*="overlay" i]',
      '[id*="adblock" i][class*="modal" i]',
      '#adblock-notice', '.adblock-notice',
      '#adblock-overlay', '.adblock-overlay',
      '#ab-wall', '.ab-wall'
    ];

    for (const selector of overlaySelectors) {
      try {
        const els = document.querySelectorAll(selector);
        for (const el of els) {
          el.remove();
        }
      } catch {}
    }

    document.body?.style?.setProperty('overflow', 'auto', 'important');
    document.documentElement?.style?.setProperty('overflow', 'auto', 'important');
  }

  function init() {
    injectEarly();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        interceptAntiAdblockCSS();
        setTimeout(removeAntiAdblockOverlays, 1000);
        setTimeout(removeAntiAdblockOverlays, 3000);
        setTimeout(removeAntiAdblockOverlays, 5000);
      });
    } else {
      interceptAntiAdblockCSS();
      setTimeout(removeAntiAdblockOverlays, 500);
      setTimeout(removeAntiAdblockOverlays, 2000);
    }
  }

  return { init, removeAntiAdblockOverlays, injectEarly };
})();
