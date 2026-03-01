'use strict';

const FeedbackSystem = (() => {

  let feedbackData = {
    reports: [],
    thresholdAdjustments: {},
    siteOverrides: {}
  };

  async function loadState() {
    try {
      const stored = await chrome.storage.local.get('feedback');
      if (stored.feedback) Object.assign(feedbackData, stored.feedback);
    } catch {}
  }

  async function saveState() {
    await chrome.storage.local.set({ feedback: feedbackData });
  }

  function reportFalsePositive(domain, selector, elementInfo) {
    feedbackData.reports.push({
      type: 'false_positive',
      domain,
      selector,
      elementInfo,
      timestamp: Date.now()
    });

    if (!feedbackData.thresholdAdjustments[domain]) {
      feedbackData.thresholdAdjustments[domain] = { offset: 0, count: 0 };
    }
    feedbackData.thresholdAdjustments[domain].offset += 5;
    feedbackData.thresholdAdjustments[domain].count++;

    if (feedbackData.reports.length > 500) {
      feedbackData.reports = feedbackData.reports.slice(-250);
    }

    saveState();
    return { success: true, newThreshold: getThresholdForDomain(domain) };
  }

  function reportFalseNegative(domain, selector, elementInfo) {
    feedbackData.reports.push({
      type: 'false_negative',
      domain,
      selector,
      elementInfo,
      timestamp: Date.now()
    });

    if (!feedbackData.thresholdAdjustments[domain]) {
      feedbackData.thresholdAdjustments[domain] = { offset: 0, count: 0 };
    }
    feedbackData.thresholdAdjustments[domain].offset -= 5;
    feedbackData.thresholdAdjustments[domain].count++;

    if (feedbackData.reports.length > 500) {
      feedbackData.reports = feedbackData.reports.slice(-250);
    }

    saveState();
    return { success: true, newThreshold: getThresholdForDomain(domain) };
  }

  function getThresholdForDomain(domain) {
    const base = 45;
    const adj = feedbackData.thresholdAdjustments[domain];
    if (!adj) return base;
    const offset = Math.max(-20, Math.min(20, adj.offset));
    return base + offset;
  }

  function getReports(limit = 50) {
    return feedbackData.reports.slice(-limit).reverse();
  }

  function getStats() {
    const fp = feedbackData.reports.filter(r => r.type === 'false_positive').length;
    const fn = feedbackData.reports.filter(r => r.type === 'false_negative').length;
    return {
      totalReports: feedbackData.reports.length,
      falsePositives: fp,
      falseNegatives: fn,
      adjustedDomains: Object.keys(feedbackData.thresholdAdjustments).length
    };
  }

  function clearReports() {
    feedbackData.reports = [];
    feedbackData.thresholdAdjustments = {};
    saveState();
  }

  return {
    loadState,
    saveState,
    reportFalsePositive,
    reportFalseNegative,
    getThresholdForDomain,
    getReports,
    getStats,
    clearReports
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FeedbackSystem;
}
