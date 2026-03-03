'use strict';

const PremiumGate = (() => {
  const PRICE = '$0.77';
  const PRODUCT_NAME = 'Prime Companion';
  const PAYMENT_URL = 'https://buy.stripe.com/adblockprime-companion';

  const KEY_PATTERN = /^ABP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

  // Founder keys stored as HMAC-SHA256 hashes (password-protected, never plaintext)
  const FOUNDER_HASHES = new Set([
    '94dec64ba6a5b5066465928e0197c0025788377cd7e127f99d0ada19c9595e2d',
    '8231a4280ae1f6cd1ba54aa8b7a0a59359709560b3bd0d4c128978bd64fedaee',
    '77830156055e4982074946310c6e39e1286c13389cfa47fb79763deb8b702939'
  ]);

  let state = {
    isPremium: false,
    licenseKey: null,
    activatedAt: null,
    trialMessages: 0,
    maxTrialMessages: 3
  };

  async function loadState() {
    try {
      const data = await chrome.storage.local.get('premiumState');
      if (data.premiumState) {
        state = { ...state, ...data.premiumState };
      }
    } catch (e) {
      console.error('[PremiumGate] Load error:', e);
    }
  }

  async function saveState() {
    try {
      await chrome.storage.local.set({ premiumState: state });
    } catch (e) {
      console.error('[PremiumGate] Save error:', e);
    }
  }

  function isPremium() {
    return state.isPremium === true;
  }

  function getTrialRemaining() {
    return Math.max(0, state.maxTrialMessages - state.trialMessages);
  }

  function canSendMessage() {
    return state.isPremium || state.trialMessages < state.maxTrialMessages;
  }

  async function useTrialMessage() {
    if (state.isPremium) return true;
    if (state.trialMessages < state.maxTrialMessages) {
      state.trialMessages++;
      await saveState();
      return true;
    }
    return false;
  }

  async function hmacSha256(password, message) {
    const enc = new TextEncoder();
    const keyData = await crypto.subtle.importKey(
      'raw', enc.encode(password),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', keyData, enc.encode(message));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function activateKey(key, password) {
    if (!key || typeof key !== 'string') {
      return { success: false, error: 'Please enter a license key.' };
    }
    if (!password || typeof password !== 'string') {
      return { success: false, error: 'Password required.' };
    }

    const k = key.trim().toUpperCase();
    if (!KEY_PATTERN.test(k)) {
      return { success: false, error: 'Invalid key format. Keys look like ABP-XXXX-XXXX-XXXX' };
    }

    const hash = await hmacSha256(password.trim(), k);
    if (!FOUNDER_HASHES.has(hash)) {
      return { success: false, error: 'Invalid key or password.' };
    }

    state.isPremium = true;
    state.licenseKey = hash.slice(0, 12) + '...';
    state.activatedAt = Date.now();
    await saveState();

    return { success: true, message: 'Premium activated! Enjoy Prime Companion.' };
  }

  async function deactivate() {
    state.isPremium = false;
    state.licenseKey = null;
    state.activatedAt = null;
    await saveState();
    return { success: true };
  }

  function getState() {
    return {
      isPremium: state.isPremium,
      hasKey: !!state.licenseKey,
      activatedAt: state.activatedAt,
      trialMessages: state.trialMessages,
      trialRemaining: getTrialRemaining(),
      maxTrialMessages: state.maxTrialMessages,
      price: PRICE,
      paymentUrl: PAYMENT_URL,
      productName: PRODUCT_NAME
    };
  }

  return {
    loadState,
    saveState,
    isPremium,
    canSendMessage,
    useTrialMessage,
    getTrialRemaining,
    activateKey,
    deactivate,
    getState
  };
})();
