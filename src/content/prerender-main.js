'use strict';

(function() {
  const adUrlPatterns = [
    /doubleclick\.net/i,
    /googlesyndication\.com/i,
    /googleadservices\.com/i,
    /pagead\//i,
    /adserver/i,
    /\/ads\//i,
    /amazon-adsystem/i,
    /facebook\.com\/tr/i,
    /criteo\./i,
    /taboola\.com/i,
    /outbrain\.com/i,
    /moatads\.com/i,
    /adnxs\.com/i,
    /rubiconproject/i,
    /pubmatic\.com/i,
    /chartbeat\./i,
    /scorecardresearch/i,
    /quantserve\.com/i
  ];

  function isAdUrl(url) {
    if (!url) return false;
    try {
      const str = String(url);
      for (let i = 0; i < adUrlPatterns.length; i++) {
        if (adUrlPatterns[i].test(str)) return true;
      }
    } catch (_) {}
    return false;
  }

  try {
    const _origImage = window.Image;
    const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');

    window.Image = function Image() {
      const img = new _origImage(...arguments);
      if (srcDescriptor && srcDescriptor.set) {
        try {
          Object.defineProperty(img, 'src', {
            get() { return srcDescriptor.get.call(this); },
            set(val) {
              if (isAdUrl(val)) {
                srcDescriptor.set.call(this, 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
                return;
              }
              srcDescriptor.set.call(this, val);
            },
            configurable: true
          });
        } catch (_) {}
      }
      return img;
    };
    window.Image.prototype = _origImage.prototype;
    Object.defineProperty(window.Image, 'name', { value: 'Image', configurable: true });
  } catch (_) {}

  try {
    const _sendBeacon = navigator.sendBeacon;
    if (typeof _sendBeacon === 'function') {
      navigator.sendBeacon = function sendBeacon(url) {
        if (isAdUrl(url)) return true;
        return _sendBeacon.apply(navigator, arguments);
      };
    }
  } catch (_) {}

  try {
    const _origAppendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function appendChild(child) {
      if (child && child.nodeType === 1) {
        const tag = child.nodeName;
        if (tag === 'SCRIPT') {
          const src = child.src || (child.getAttribute && child.getAttribute('src')) || '';
          if (isAdUrl(src)) {
            return _origAppendChild.call(this, document.createComment('abp-blocked'));
          }
        } else if (tag === 'IFRAME') {
          const src = child.src || (child.getAttribute && child.getAttribute('src')) || '';
          if (isAdUrl(src)) {
            child.src = 'about:blank';
            child.style.cssText = 'display:none!important;width:0!important;height:0!important;';
          }
        }
      }
      return _origAppendChild.call(this, child);
    };
  } catch (_) {}

  try {
    const _origInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function insertBefore(child, ref) {
      if (child && child.nodeType === 1) {
        const tag = child.nodeName;
        if (tag === 'SCRIPT') {
          const src = child.src || (child.getAttribute && child.getAttribute('src')) || '';
          if (isAdUrl(src)) {
            return _origInsertBefore.call(this, document.createComment('abp-blocked'), ref);
          }
        } else if (tag === 'IFRAME') {
          const src = child.src || (child.getAttribute && child.getAttribute('src')) || '';
          if (isAdUrl(src)) {
            child.src = 'about:blank';
            child.style.cssText = 'display:none!important;width:0!important;height:0!important;';
          }
        }
      }
      return _origInsertBefore.call(this, child, ref);
    };
  } catch (_) {}
})();
