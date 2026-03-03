'use strict';

/**
 * PageVision — Captures what the user is seeing
 * 
 * For YouTube: video title, channel, description, current time, transcript
 * For all pages: page title, main content, visible text, key elements
 */
const PageVision = (() => {

  function captureContext() {
    const hostname = window.location.hostname;
    const isYouTube = hostname.includes('youtube.com');

    if (isYouTube) {
      return captureYouTube();
    }
    return captureGenericPage();
  }

  // ─── YouTube Vision ───

  function captureYouTube() {
    const ctx = {
      type: 'youtube',
      url: window.location.href,
      videoId: new URLSearchParams(window.location.search).get('v') || null
    };

    const titleEl = document.querySelector(
      'yt-formatted-string.ytd-watch-metadata, ' +
      'h1.ytd-watch-metadata yt-formatted-string, ' +
      '#title h1 yt-formatted-string, ' +
      'h1.title'
    );
    ctx.title = titleEl?.textContent?.trim() || document.title.replace(' - YouTube', '').trim();

    const channelEl = document.querySelector(
      'ytd-channel-name yt-formatted-string a, ' +
      '#channel-name a, ' +
      'ytd-video-owner-renderer #channel-name yt-formatted-string'
    );
    ctx.channel = channelEl?.textContent?.trim() || null;

    const video = document.querySelector('video');
    if (video) {
      ctx.currentTime = formatTime(video.currentTime);
      ctx.duration = formatTime(video.duration);
      ctx.isPlaying = !video.paused;
      ctx.progress = video.duration > 0
        ? Math.round((video.currentTime / video.duration) * 100) + '%'
        : null;
    }

    const descEl = document.querySelector(
      'ytd-text-inline-expander #plain-snippet-text, ' +
      '#description-inline-expander yt-attributed-string, ' +
      'ytd-expander #content, ' +
      '#description yt-formatted-string'
    );
    ctx.description = descEl?.textContent?.trim()?.substring(0, 400) || null;

    const viewsEl = document.querySelector(
      'ytd-watch-info-text .yt-formatted-string, ' +
      '#info-strings yt-formatted-string, ' +
      'ytd-video-primary-info-renderer .view-count'
    );
    ctx.views = viewsEl?.textContent?.trim() || null;

    // Chapters / key moments
    const chapterEls = document.querySelectorAll(
      'ytd-macro-markers-list-item-renderer h4, ' +
      '.ytp-chapter-title-content'
    );
    if (chapterEls.length > 0) {
      ctx.chapters = Array.from(chapterEls).slice(0, 10)
        .map(el => el.textContent.trim()).filter(Boolean);
    }

    const currentChapter = document.querySelector('.ytp-chapter-title-content');
    ctx.currentChapter = currentChapter?.textContent?.trim() || null;

    // Live chat indicator
    ctx.isLive = !!document.querySelector(
      'ytd-badge-supported-renderer .badge-style-type-live-now, ' +
      '.ytp-live-badge-text'
    );

    // Top comments
    const commentEls = document.querySelectorAll(
      'ytd-comment-thread-renderer #content-text'
    );
    if (commentEls.length > 0) {
      ctx.topComments = Array.from(commentEls).slice(0, 3)
        .map(el => el.textContent.trim().substring(0, 100));
    }

    return buildVisionString(ctx);
  }

  // ─── Generic Page Vision ───

  function captureGenericPage() {
    const ctx = {
      type: 'webpage',
      url: window.location.href,
      title: document.title,
      hostname: window.location.hostname
    };

    const metaDesc = document.querySelector('meta[name="description"]');
    ctx.description = metaDesc?.content?.substring(0, 200) || null;

    const h1 = document.querySelector('h1');
    ctx.headline = h1?.textContent?.trim()?.substring(0, 100) || null;

    const mainContent = document.querySelector('main, article, [role="main"], #content, .content');
    if (mainContent) {
      const text = mainContent.innerText || mainContent.textContent || '';
      ctx.mainText = text.substring(0, 600).replace(/\s+/g, ' ').trim();
    } else {
      const body = document.body?.innerText || '';
      ctx.mainText = body.substring(0, 400).replace(/\s+/g, ' ').trim();
    }

    const images = document.querySelectorAll('img[alt]');
    const imgDescs = [];
    for (const img of images) {
      if (img.alt && img.alt.length > 5 && imgDescs.length < 5) {
        imgDescs.push(img.alt.substring(0, 60));
      }
    }
    if (imgDescs.length > 0) ctx.imageDescriptions = imgDescs;

    return buildVisionString(ctx);
  }

  // ─── Build readable context string ───

  function buildVisionString(ctx) {
    const parts = [];

    if (ctx.type === 'youtube') {
      parts.push(`[YouTube Video]`);
      if (ctx.title) parts.push(`Title: "${ctx.title}"`);
      if (ctx.channel) parts.push(`Channel: ${ctx.channel}`);
      if (ctx.currentTime && ctx.duration) {
        parts.push(`Playback: ${ctx.currentTime} / ${ctx.duration} (${ctx.progress})`);
      }
      if (ctx.isPlaying !== undefined) parts.push(`Status: ${ctx.isPlaying ? 'Playing' : 'Paused'}`);
      if (ctx.currentChapter) parts.push(`Current chapter: ${ctx.currentChapter}`);
      if (ctx.isLive) parts.push(`[LIVE STREAM]`);
      if (ctx.description) parts.push(`Description: ${ctx.description}`);
      if (ctx.chapters?.length) parts.push(`Chapters: ${ctx.chapters.join(', ')}`);
      if (ctx.topComments?.length) {
        parts.push(`Top comments: ${ctx.topComments.map(c => `"${c}"`).join(' | ')}`);
      }
    } else {
      parts.push(`[Webpage: ${ctx.hostname}]`);
      if (ctx.title) parts.push(`Title: "${ctx.title}"`);
      if (ctx.headline && ctx.headline !== ctx.title) parts.push(`Headline: "${ctx.headline}"`);
      if (ctx.description) parts.push(`Description: ${ctx.description}`);
      if (ctx.mainText) parts.push(`Content preview: ${ctx.mainText}`);
      if (ctx.imageDescriptions?.length) parts.push(`Images: ${ctx.imageDescriptions.join(', ')}`);
    }

    return parts.join('\n');
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return {
    captureContext,
    captureYouTube,
    captureGenericPage
  };
})();
