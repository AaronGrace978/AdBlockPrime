'use strict';

const ChatOverlay = (() => {
  let panel = null;
  let messagesContainer = null;
  let input = null;
  let isOpen = false;
  let isMinimized = false;
  let isStreaming = false;
  let premiumState = null;
  let paywallEl = null;

  const EMOTION_COLORS = {
    curious: '#A855F7', joyful: '#00D2A0', reflective: '#6C5CE7',
    focused: '#3B82F6', warmth: '#F59E0B', concerned: '#FF5370',
    playful: '#EC4899', awe: '#8B5CF6', protective: '#10B981',
    contemplative: '#6366F1'
  };

  function init() {
    if (panel) return;
    createPanel();
    loadConversation();
    checkPremium();
  }

  async function checkPremium() {
    try {
      premiumState = await chrome.runtime.sendMessage({ type: 'PREMIUM_GET_STATE' });
    } catch { premiumState = null; }
  }

  let fab = null;

  function $(id) { return document.getElementById(id); }

  function createPanel() {
    // Inject styles directly - no Shadow DOM (avoids stealth module attachShadow hook)
    const style = document.createElement('style');
    style.id = 'prime-chat-styles';
    style.textContent = getStyles();
    document.documentElement.appendChild(style);

    // FAB
    fab = document.createElement('div');
    fab.id = 'prime-fab';
    fab.className = 'prime-chat-fab';
    fab.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4v1a2 2 0 0 1 2 2v3a8 8 0 0 1-16 0V9a2 2 0 0 1 2-2V6a4 4 0 0 1 4-4z"/><path d="M9 14l2 2 4-4"/></svg><span class="prime-fab-pulse"></span>`;
    document.documentElement.appendChild(fab);

    // Panel
    const p = document.createElement('div');
    p.id = 'prime-panel';
    p.className = 'prime-chat-panel';
    p.style.display = 'none';
    p.innerHTML = `
      <div class="prime-chat-header" id="prime-header">
        <div class="prime-chat-title">
          <span class="prime-emotion-dot" id="prime-emotion-dot"></span>
          <span>Prime</span>
          <span class="prime-soul-badge">SoulFrame</span>
        </div>
        <div class="prime-chat-controls">
          <button class="prime-ctrl-btn" id="prime-vision-btn" title="What I see"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button class="prime-ctrl-btn" id="prime-clear-btn" title="New conversation"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M1 20V14h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button>
          <button class="prime-ctrl-btn" id="prime-min-btn" title="Minimize"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
          <button class="prime-ctrl-btn" id="prime-close-btn" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="prime-chat-messages" id="prime-messages">
        <div class="prime-welcome">
          <div class="prime-welcome-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#A855F7" stroke-width="1.5"><path d="M12 2a4 4 0 0 1 4 4v1a2 2 0 0 1 2 2v3a8 8 0 0 1-16 0V9a2 2 0 0 1 2-2V6a4 4 0 0 1 4-4z"/><path d="M9 14l2 2 4-4"/></svg></div>
          <div class="prime-welcome-text">Hey, I'm <strong>Prime</strong></div>
          <div class="prime-welcome-sub">SoulFrame NightMind companion. I see what you see. I remember.</div>
        </div>
      </div>
      <div class="prime-chat-input-row" id="prime-input-row">
        <input type="text" class="prime-chat-input" id="prime-input" placeholder="Talk to Prime..." autocomplete="off" />
        <button class="prime-send-btn" id="prime-send-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
      </div>
    `;
    document.documentElement.appendChild(p);

    panel = p;
    messagesContainer = $('prime-messages');
    input = $('prime-input');

    fab.addEventListener('click', toggle);
    $('prime-close-btn').addEventListener('click', close);
    $('prime-min-btn').addEventListener('click', minimize);
    $('prime-clear-btn').addEventListener('click', clearChat);
    $('prime-vision-btn').addEventListener('click', showVision);
    $('prime-send-btn').addEventListener('click', sendMessage);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Draggable header
    let isDragging = false, dragX = 0, dragY = 0;
    const header = $('prime-header');
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.prime-ctrl-btn')) return;
      isDragging = true;
      const rect = panel.getBoundingClientRect();
      dragX = e.clientX - rect.left;
      dragY = e.clientY - rect.top;
      panel.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = Math.max(0, e.clientX - dragX) + 'px';
      panel.style.top = Math.max(0, e.clientY - dragY) + 'px';
    });
    document.addEventListener('mouseup', () => {
      isDragging = false;
      panel.style.transition = '';
    });
  }

  function toggle() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  async function open() {
    await checkPremium();
    if (fab) fab.style.display = 'none';
    isOpen = true;

    if (premiumState && !premiumState.isPremium && premiumState.trialRemaining <= 0) {
      showPaywall();
      return;
    }

    hidePaywall();
    panel.style.display = 'flex';
    isMinimized = false;
    panel.classList.remove('minimized');
    setTimeout(() => input?.focus(), 100);
  }

  function close() {
    panel.style.display = 'none';
    hidePaywall();
    isOpen = false;
    if (fab) fab.style.display = 'flex';
  }

  function showPaywall() {
    if (paywallEl) { paywallEl.style.display = 'flex'; return; }
    paywallEl = document.createElement('div');
    paywallEl.id = 'prime-paywall';
    paywallEl.className = 'prime-paywall';
    paywallEl.innerHTML = `
      <div class="prime-pw-card">
        <button class="prime-pw-close" id="prime-pw-close">&times;</button>
        <div class="prime-pw-glow"></div>
        <div class="prime-pw-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#A855F7" stroke-width="1.5">
            <path d="M12 2a4 4 0 0 1 4 4v1a2 2 0 0 1 2 2v3a8 8 0 0 1-16 0V9a2 2 0 0 1 2-2V6a4 4 0 0 1 4-4z"/>
            <path d="M9 14l2 2 4-4"/>
          </svg>
        </div>
        <div class="prime-pw-title">Unlock <strong>Prime Companion</strong></div>
        <div class="prime-pw-subtitle">SoulFrame NightMind AI that sees, feels & remembers</div>
        <div class="prime-pw-features">
          <div class="prime-pw-feat"><span class="prime-pw-check">&#10003;</span> AI companion with emotional intelligence</div>
          <div class="prime-pw-feat"><span class="prime-pw-check">&#10003;</span> Computer vision — watches with you</div>
          <div class="prime-pw-feat"><span class="prime-pw-check">&#10003;</span> NightMind memory — remembers everything</div>
          <div class="prime-pw-feat"><span class="prime-pw-check">&#10003;</span> Unlimited conversations forever</div>
        </div>
        <div class="prime-pw-price">
          <span class="prime-pw-amount">$0.77</span>
          <span class="prime-pw-period">one time</span>
        </div>
        <button class="prime-pw-buy" id="prime-pw-buy">Get Prime Companion</button>
        <div class="prime-pw-divider"><span>or</span></div>
        <div class="prime-pw-key-row">
          <input type="text" class="prime-pw-key-input" id="prime-pw-key"
            placeholder="ABP-XXXX-XXXX-XXXX" maxlength="19" autocomplete="off" />
        </div>
        <div class="prime-pw-key-row" style="margin-top:8px !important;">
          <input type="password" class="prime-pw-key-input" id="prime-pw-pass"
            placeholder="Password" autocomplete="off" style="letter-spacing:2px !important; text-transform:none !important; font-family:inherit !important;" />
          <button class="prime-pw-activate" id="prime-pw-activate">Activate</button>
        </div>
        <div class="prime-pw-msg" id="prime-pw-msg"></div>
        <div class="prime-pw-footer">All ad-blocking features remain free forever.</div>
      </div>
    `;
    document.documentElement.appendChild(paywallEl);

    document.getElementById('prime-pw-close').addEventListener('click', close);
    document.getElementById('prime-pw-buy').addEventListener('click', () => {
      window.open(premiumState?.paymentUrl || 'https://buy.stripe.com/adblockprime-companion', '_blank');
    });
    document.getElementById('prime-pw-activate').addEventListener('click', activateKey);
    document.getElementById('prime-pw-key').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('prime-pw-pass').focus();
    });
    document.getElementById('prime-pw-pass').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') activateKey();
    });
  }

  function hidePaywall() {
    if (paywallEl) paywallEl.style.display = 'none';
  }

  async function activateKey() {
    const keyInput = document.getElementById('prime-pw-key');
    const passInput = document.getElementById('prime-pw-pass');
    const msgEl = document.getElementById('prime-pw-msg');
    if (!keyInput || !passInput || !msgEl) return;

    const key = keyInput.value.trim();
    const password = passInput.value.trim();
    if (!key) { msgEl.textContent = 'Enter your license key'; msgEl.style.color = '#FF5370'; return; }
    if (!password) { msgEl.textContent = 'Enter password'; msgEl.style.color = '#FF5370'; return; }

    try {
      const result = await chrome.runtime.sendMessage({ type: 'PREMIUM_ACTIVATE', key, password });
      if (result?.success) {
        msgEl.textContent = result.message || 'Premium activated!';
        msgEl.style.color = '#00D2A0';
        premiumState = await chrome.runtime.sendMessage({ type: 'PREMIUM_GET_STATE' });
        setTimeout(() => {
          hidePaywall();
          panel.style.display = 'flex';
          isMinimized = false;
          panel.classList.remove('minimized');
          setTimeout(() => input?.focus(), 100);
        }, 1200);
      } else {
        msgEl.textContent = result?.error || 'Invalid key or password';
        msgEl.style.color = '#FF5370';
        keyInput.style.borderColor = '#FF5370';
        passInput.style.borderColor = '#FF5370';
        setTimeout(() => { keyInput.style.borderColor = ''; passInput.style.borderColor = ''; }, 2000);
      }
    } catch (err) {
      msgEl.textContent = 'Activation failed. Try again.';
      msgEl.style.color = '#FF5370';
    }
  }

  function minimize() {
    isMinimized = !isMinimized;
    if (isMinimized) {
      panel.classList.add('minimized');
    } else {
      panel.classList.remove('minimized');
    }
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isStreaming) return;

    input.value = '';
    appendMessage('user', text);

    isStreaming = true;
    const typingEl = appendTyping();

    try {
      const visionContext = typeof PageVision !== 'undefined' ? PageVision.captureContext() : null;

      const result = await chrome.runtime.sendMessage({
        type: 'PRIME_CHAT',
        message: text,
        visionContext
      });

      typingEl.remove();

      if (result?.error === 'paywall') {
        premiumState = result;
        close();
        showPaywall();
        return;
      }

      if (result?.premium) {
        premiumState = result.premium;
        if (!result.premium.isPremium && result.premium.trialRemaining > 0) {
          appendMessage('system', `Free trial: ${result.premium.trialRemaining} message${result.premium.trialRemaining === 1 ? '' : 's'} remaining`);
        }
      }

      if (result?.content) {
        appendMessage('assistant', result.content, result.emotion);
        updateEmotionDot(result.emotion);
      } else if (result?.error) {
        appendMessage('system', result.error);
      }
    } catch (err) {
      typingEl.remove();
      appendMessage('system', 'Connection lost. Try again.');
    }

    isStreaming = false;
  }

  function appendMessage(role, content, emotion) {
    if (!messagesContainer) return null;
    const welcome = messagesContainer.querySelector('.prime-welcome');
    if (welcome) welcome.remove();

    const msg = document.createElement('div');
    msg.className = `prime-msg prime-msg-${role}`;

    if (role === 'assistant' && emotion) {
      const color = EMOTION_COLORS[emotion] || '#A855F7';
      msg.style.borderLeftColor = color;
    }

    const bubble = document.createElement('div');
    bubble.className = 'prime-msg-bubble';
    bubble.textContent = content;
    msg.appendChild(bubble);

    messagesContainer.appendChild(msg);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return msg;
  }

  function appendTyping() {
    const msg = document.createElement('div');
    msg.className = 'prime-msg prime-msg-assistant prime-typing';
    msg.innerHTML = `<div class="prime-msg-bubble"><span class="prime-dot-anim"><span></span><span></span><span></span></span></div>`;
    messagesContainer.appendChild(msg);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return msg;
  }

  function updateEmotionDot(emotion) {
    const dot = $('prime-emotion-dot');
    if (dot) {
      dot.style.background = EMOTION_COLORS[emotion] || '#A855F7';
      dot.title = emotion || 'reflective';
    }
  }

  async function clearChat() {
    try {
      await chrome.runtime.sendMessage({ type: 'PRIME_CLEAR' });
    } catch {}
    messagesContainer.innerHTML = `
      <div class="prime-welcome">
        <div class="prime-welcome-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#A855F7" stroke-width="1.5"><path d="M12 2a4 4 0 0 1 4 4v1a2 2 0 0 1 2 2v3a8 8 0 0 1-16 0V9a2 2 0 0 1 2-2V6a4 4 0 0 1 4-4z"/><path d="M9 14l2 2 4-4"/></svg>
        </div>
        <div class="prime-welcome-text">Fresh start.</div>
        <div class="prime-welcome-sub">But I still remember you.</div>
      </div>
    `;
  }

  async function showVision() {
    const visionContext = typeof PageVision !== 'undefined' ? PageVision.captureContext() : 'No page context available.';
    appendMessage('system', `[What I see]\n${visionContext}`);
  }

  async function loadConversation() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'PRIME_GET_CONVO' });
      if (result?.messages?.length > 0) {
        const welcome = messagesContainer.querySelector('.prime-welcome');
        if (welcome) welcome.remove();
        for (const msg of result.messages.slice(-30)) {
          appendMessage(msg.role, msg.content, msg.emotion);
        }
      }
    } catch {}
  }

  // ─── Styles ───

  function getStyles() {
    return `
      .prime-chat-fab {
        position: fixed !important; bottom: 24px !important; right: 24px !important;
        z-index: 2147483646 !important;
        width: 52px !important; height: 52px !important; border-radius: 50% !important;
        background: linear-gradient(135deg, #6C5CE7, #A855F7) !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        cursor: pointer !important; box-shadow: 0 4px 20px rgba(108,92,231,0.4) !important;
        transition: transform 0.2s, box-shadow 0.2s !important;
        border: none !important; margin: 0 !important; padding: 0 !important;
        opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
      }
      .prime-chat-fab:hover { transform: scale(1.1) !important; box-shadow: 0 6px 28px rgba(108,92,231,0.6) !important; }
      .prime-chat-fab svg { display: block !important; flex-shrink: 0 !important; }
      .prime-fab-pulse {
        position: absolute !important; width: 100% !important; height: 100% !important; border-radius: 50% !important;
        background: rgba(168,85,247,0.3) !important; animation: primePulse 2s ease infinite !important;
        top: 0 !important; left: 0 !important; pointer-events: none !important;
      }
      @keyframes primePulse { 0%,100%{transform:scale(1);opacity:0.6;} 50%{transform:scale(1.3);opacity:0;} }

      .prime-chat-panel {
        position: fixed !important; bottom: 24px !important; right: 24px !important;
        z-index: 2147483647 !important;
        width: 380px !important; height: 520px !important; max-height: 80vh !important;
        background: #0F0F14 !important; border: 1px solid #2A2A38 !important; border-radius: 16px !important;
        display: flex !important; flex-direction: column !important; overflow: hidden !important;
        box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 0 30px rgba(108,92,231,0.15) !important;
        animation: primeSlideUp 0.3s ease !important; margin: 0 !important; padding: 0 !important;
        opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
        font-size: 13px !important; color: #EEEEF0 !important; line-height: 1.4 !important;
      }
      .prime-chat-panel * { box-sizing: border-box !important; }
      .prime-chat-panel.minimized { height: 48px !important; }
      .prime-chat-panel.minimized .prime-chat-messages,
      .prime-chat-panel.minimized .prime-chat-input-row { display: none !important; }
      @keyframes primeSlideUp { from{transform:translateY(20px);opacity:0;} to{transform:translateY(0);opacity:1;} }

      .prime-chat-header {
        display: flex !important; align-items: center !important; justify-content: space-between !important;
        padding: 12px 16px !important; background: #1A1A24 !important; border-bottom: 1px solid #2A2A38 !important;
        cursor: move !important; user-select: none !important; flex-shrink: 0 !important;
      }
      .prime-chat-title {
        display: flex !important; align-items: center !important; gap: 8px !important;
        font-size: 14px !important; font-weight: 600 !important; color: #EEEEF0 !important;
      }
      .prime-emotion-dot {
        width: 8px !important; height: 8px !important; border-radius: 50% !important;
        background: #A855F7 !important; transition: background 0.5s !important;
        box-shadow: 0 0 8px rgba(168,85,247,0.5) !important; display: inline-block !important;
      }
      .prime-soul-badge {
        font-size: 8px !important; font-weight: 700 !important; text-transform: uppercase !important;
        letter-spacing: 1px !important; color: #6C5CE7 !important; background: rgba(108,92,231,0.1) !important;
        padding: 2px 6px !important; border-radius: 6px !important; border: 1px solid rgba(108,92,231,0.2) !important;
      }
      .prime-chat-controls { display: flex !important; gap: 2px !important; }
      .prime-ctrl-btn {
        background: none !important; border: none !important; color: #8888A0 !important;
        cursor: pointer !important; padding: 5px !important; border-radius: 6px !important;
        transition: all 0.2s !important; display: flex !important;
        align-items: center !important; justify-content: center !important;
      }
      .prime-ctrl-btn:hover { color: #EEEEF0 !important; background: #22222E !important; }

      .prime-chat-messages {
        flex: 1 !important; overflow-y: auto !important; padding: 16px !important;
        display: flex !important; flex-direction: column !important; gap: 10px !important;
        scrollbar-width: thin !important; scrollbar-color: #2A2A38 transparent !important;
        background: #0F0F14 !important;
      }
      .prime-chat-messages::-webkit-scrollbar { width: 4px !important; }
      .prime-chat-messages::-webkit-scrollbar-track { background: transparent !important; }
      .prime-chat-messages::-webkit-scrollbar-thumb { background: #2A2A38 !important; border-radius: 4px !important; }

      .prime-welcome {
        display: flex !important; flex-direction: column !important; align-items: center !important;
        justify-content: center !important; gap: 8px !important; padding: 40px 20px !important;
        text-align: center !important; flex: 1 !important;
      }
      .prime-welcome-icon { opacity: 0.8 !important; }
      .prime-welcome-text { font-size: 16px !important; font-weight: 600 !important; color: #EEEEF0 !important; }
      .prime-welcome-text strong { color: #A855F7 !important; }
      .prime-welcome-sub { font-size: 12px !important; color: #8888A0 !important; line-height: 1.5 !important; }

      .prime-msg { display: flex !important; animation: primeMsgIn 0.2s ease !important; }
      @keyframes primeMsgIn { from{transform:translateY(8px);opacity:0;} to{transform:translateY(0);opacity:1;} }
      .prime-msg-user { justify-content: flex-end !important; }
      .prime-msg-assistant { justify-content: flex-start !important; border-left: 2px solid #A855F7 !important; padding-left: 8px !important; }
      .prime-msg-system { justify-content: center !important; }

      .prime-msg-bubble {
        max-width: 85% !important; padding: 10px 14px !important; border-radius: 12px !important;
        font-size: 13px !important; line-height: 1.5 !important; word-break: break-word !important;
        white-space: pre-wrap !important;
      }
      .prime-msg-user .prime-msg-bubble {
        background: linear-gradient(135deg, #6C5CE7, #A855F7) !important;
        color: white !important; border-bottom-right-radius: 4px !important;
      }
      .prime-msg-assistant .prime-msg-bubble {
        background: #1A1A24 !important; color: #EEEEF0 !important; border: 1px solid #2A2A38 !important;
        border-bottom-left-radius: 4px !important;
      }
      .prime-msg-system .prime-msg-bubble {
        background: rgba(108,92,231,0.08) !important; color: #8888A0 !important;
        font-size: 11px !important; border-radius: 8px !important; border: 1px solid #2A2A38 !important;
        max-width: 95% !important;
      }

      .prime-typing .prime-msg-bubble { padding: 14px 18px !important; }
      .prime-dot-anim { display: flex !important; gap: 4px !important; align-items: center !important; }
      .prime-dot-anim span {
        width: 6px !important; height: 6px !important; border-radius: 50% !important;
        background: #8888A0 !important; animation: primeDots 1.4s ease infinite !important;
        display: inline-block !important;
      }
      .prime-dot-anim span:nth-child(2) { animation-delay: 0.2s !important; }
      .prime-dot-anim span:nth-child(3) { animation-delay: 0.4s !important; }
      @keyframes primeDots { 0%,100%{opacity:0.3;transform:scale(0.8);} 50%{opacity:1;transform:scale(1);} }

      .prime-chat-input-row {
        display: flex !important; gap: 8px !important; padding: 12px 16px !important;
        background: #1A1A24 !important; border-top: 1px solid #2A2A38 !important; flex-shrink: 0 !important;
      }
      .prime-chat-input {
        flex: 1 !important; background: #0F0F14 !important; border: 1px solid #2A2A38 !important;
        border-radius: 10px !important; padding: 10px 14px !important; color: #EEEEF0 !important;
        font-size: 13px !important; font-family: inherit !important; outline: none !important;
        transition: border-color 0.2s !important; height: auto !important; width: auto !important;
        min-height: 0 !important; margin: 0 !important;
      }
      .prime-chat-input::placeholder { color: #55556A !important; }
      .prime-chat-input:focus { border-color: #6C5CE7 !important; box-shadow: 0 0 12px rgba(108,92,231,0.15) !important; }

      .prime-send-btn {
        width: 40px !important; height: 40px !important; border-radius: 10px !important; border: none !important;
        background: linear-gradient(135deg, #6C5CE7, #A855F7) !important; color: white !important;
        cursor: pointer !important; display: flex !important; align-items: center !important;
        justify-content: center !important; transition: all 0.2s !important; flex-shrink: 0 !important;
        padding: 0 !important; margin: 0 !important;
      }
      .prime-send-btn:hover { opacity: 0.9 !important; box-shadow: 0 4px 16px rgba(108,92,231,0.4) !important; }

      /* ─── Paywall ─── */
      .prime-paywall {
        position: fixed !important; bottom: 24px !important; right: 24px !important;
        z-index: 2147483647 !important; display: flex !important;
        pointer-events: auto !important;
      }
      .prime-pw-card {
        position: relative !important; width: 360px !important;
        background: #0F0F14 !important; border: 1px solid #2A2A38 !important;
        border-radius: 20px !important; padding: 32px 28px 24px !important;
        box-shadow: 0 12px 48px rgba(0,0,0,0.6), 0 0 40px rgba(108,92,231,0.12) !important;
        overflow: hidden !important; animation: primeSlideUp 0.35s ease !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
        color: #EEEEF0 !important; text-align: center !important;
      }
      .prime-pw-card * { box-sizing: border-box !important; }
      .prime-pw-close {
        position: absolute !important; top: 12px !important; right: 14px !important;
        background: none !important; border: none !important; color: #55556A !important;
        font-size: 22px !important; cursor: pointer !important; padding: 4px 8px !important;
        line-height: 1 !important; transition: color 0.2s !important;
      }
      .prime-pw-close:hover { color: #EEEEF0 !important; }
      .prime-pw-glow {
        position: absolute !important; top: -60px !important; left: 50% !important;
        transform: translateX(-50%) !important; width: 200px !important; height: 200px !important;
        background: radial-gradient(circle, rgba(108,92,231,0.2) 0%, transparent 70%) !important;
        pointer-events: none !important;
      }
      .prime-pw-icon { margin-bottom: 12px !important; position: relative !important; }
      .prime-pw-title {
        font-size: 18px !important; font-weight: 600 !important; margin-bottom: 6px !important;
        color: #EEEEF0 !important;
      }
      .prime-pw-title strong { color: #A855F7 !important; }
      .prime-pw-subtitle {
        font-size: 12px !important; color: #8888A0 !important; margin-bottom: 20px !important;
        line-height: 1.4 !important;
      }
      .prime-pw-features {
        text-align: left !important; margin-bottom: 20px !important;
        display: flex !important; flex-direction: column !important; gap: 8px !important;
      }
      .prime-pw-feat {
        font-size: 12px !important; color: #CCCCDD !important;
        display: flex !important; align-items: center !important; gap: 8px !important;
      }
      .prime-pw-check { color: #00D2A0 !important; font-weight: 700 !important; font-size: 14px !important; }
      .prime-pw-price {
        display: flex !important; align-items: baseline !important; justify-content: center !important;
        gap: 6px !important; margin-bottom: 16px !important;
      }
      .prime-pw-amount {
        font-size: 36px !important; font-weight: 800 !important;
        background: linear-gradient(135deg, #6C5CE7, #A855F7) !important;
        -webkit-background-clip: text !important; -webkit-text-fill-color: transparent !important;
        background-clip: text !important;
      }
      .prime-pw-period {
        font-size: 13px !important; color: #8888A0 !important; font-weight: 500 !important;
      }
      .prime-pw-buy {
        width: 100% !important; padding: 14px !important; border-radius: 12px !important;
        border: none !important; font-size: 15px !important; font-weight: 700 !important;
        font-family: inherit !important; cursor: pointer !important; color: white !important;
        background: linear-gradient(135deg, #6C5CE7, #A855F7) !important;
        box-shadow: 0 4px 20px rgba(108,92,231,0.4) !important;
        transition: all 0.2s !important;
      }
      .prime-pw-buy:hover {
        box-shadow: 0 6px 28px rgba(108,92,231,0.55) !important;
        transform: translateY(-1px) !important;
      }
      .prime-pw-divider {
        display: flex !important; align-items: center !important; gap: 12px !important;
        margin: 16px 0 !important; color: #55556A !important; font-size: 11px !important;
      }
      .prime-pw-divider::before, .prime-pw-divider::after {
        content: '' !important; flex: 1 !important; height: 1px !important;
        background: #2A2A38 !important;
      }
      .prime-pw-key-row {
        display: flex !important; gap: 8px !important;
      }
      .prime-pw-key-input {
        flex: 1 !important; padding: 10px 12px !important; background: #1A1A24 !important;
        border: 1px solid #2A2A38 !important; border-radius: 10px !important;
        color: #EEEEF0 !important; font-size: 13px !important; font-family: monospace !important;
        outline: none !important; text-transform: uppercase !important; letter-spacing: 1px !important;
        transition: border-color 0.2s !important;
      }
      .prime-pw-key-input::placeholder { color: #55556A !important; text-transform: none !important; letter-spacing: 0 !important; }
      .prime-pw-key-input:focus { border-color: #6C5CE7 !important; }
      .prime-pw-activate {
        padding: 10px 16px !important; border-radius: 10px !important; border: none !important;
        background: #1A1A24 !important; border: 1px solid #6C5CE7 !important;
        color: #A855F7 !important; font-size: 12px !important; font-weight: 600 !important;
        font-family: inherit !important; cursor: pointer !important;
        transition: all 0.2s !important;
      }
      .prime-pw-activate:hover { background: rgba(108,92,231,0.15) !important; }
      .prime-pw-msg {
        font-size: 12px !important; margin-top: 10px !important; min-height: 16px !important;
        transition: color 0.2s !important;
      }
      .prime-pw-footer {
        font-size: 10px !important; color: #55556A !important; margin-top: 16px !important;
        line-height: 1.4 !important;
      }
    `;
  }

  return { init, open, close, toggle };
})();
