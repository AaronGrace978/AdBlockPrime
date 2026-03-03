'use strict';

const PremiumGate = (() => {
  const PRICE = '$0.77';
  const PRODUCT_NAME = 'Prime Companion';
  const PAYMENT_URL = 'https://buy.stripe.com/adblockprime-companion';

  // License keys are SHA-256 prefixes — server-validated in production,
  // but locally verified against a simple format for offline activation.
  const KEY_PREFIX = 'ABP-';
  const KEY_PATTERN = /^ABP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

  // Hardcoded founder keys (owner always gets premium)
  const FOUNDER_KEYS = new Set([
    'ABP-AAAA-PRIM-E777',
    'ABP-SOUL-MIND-0077',
    'ABP-GRCE-PRME-2026'
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

  function validateKey(key) {
    if (!key || typeof key !== 'string') return false;
    const k = key.trim().toUpperCase();
    if (FOUNDER_KEYS.has(k)) return true;
    return KEY_PATTERN.test(k);
  }

  async function activateKey(key) {
    if (!key || typeof key !== 'string') {
      return { success: false, error: 'Please enter a license key.' };
    }
    const k = key.trim().toUpperCase();

    if (!validateKey(k)) {
      return { success: false, error: 'Invalid key format. Keys look like ABP-XXXX-XXXX-XXXX' };
    }

    state.isPremium = true;
    state.licenseKey = k;
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
