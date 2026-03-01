'use strict';

const AdBlockAgent = (() => {

  const SYSTEM_PROMPT = `You are AdBlockPrime Agent, an AI assistant specialized in detecting and blocking web advertisements, trackers, and anti-adblock scripts. You operate inside a browser extension.

Your capabilities:
1. ANALYZE page HTML snippets to identify ad elements, sponsored content, and tracking scripts
2. GENERATE CSS selectors to block newly discovered ad patterns
3. CLASSIFY ambiguous elements as ad/not-ad with confidence scores
4. DETECT anti-adblock scripts and suggest countermeasures
5. LEARN new ad patterns from page structures you haven't seen before

Rules:
- Be precise with CSS selectors - never target elements that would break page functionality
- When uncertain, err on the side of NOT blocking (false negatives > false positives)
- Always respond with valid JSON when asked for structured output
- Keep responses concise - you're running in a browser extension with limited resources`;

  const TOOLS = [
    {
      type: 'function',
      function: {
        name: 'block_element',
        description: 'Block a specific element by CSS selector',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS selector to block' },
            confidence: { type: 'number', description: 'Confidence 0-1 that this is an ad' },
            reason: { type: 'string', description: 'Why this element is an ad' }
          },
          required: ['selector', 'confidence', 'reason']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'add_network_rule',
        description: 'Add a network blocking rule for a domain or URL pattern',
        parameters: {
          type: 'object',
          properties: {
            urlPattern: { type: 'string', description: 'URL pattern to block' },
            resourceTypes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Resource types: script, image, sub_frame, etc.'
            },
            reason: { type: 'string', description: 'Why this should be blocked' }
          },
          required: ['urlPattern', 'reason']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'learn_pattern',
        description: 'Save a new ad pattern for future detection',
        parameters: {
          type: 'object',
          properties: {
            patternType: {
              type: 'string',
              enum: ['class', 'id', 'attribute', 'structure', 'network'],
              description: 'Type of pattern'
            },
            pattern: { type: 'string', description: 'The pattern (regex or selector)' },
            domain: { type: 'string', description: 'Domain this was found on, or * for global' },
            description: { type: 'string', description: 'What this pattern matches' }
          },
          required: ['patternType', 'pattern', 'description']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'report_finding',
        description: 'Report analysis findings back to the user',
        parameters: {
          type: 'object',
          properties: {
            adsFound: { type: 'number', description: 'Number of ads found' },
            trackersFound: { type: 'number', description: 'Number of trackers found' },
            antiAdblockDetected: { type: 'boolean', description: 'Whether anti-adblock was detected' },
            summary: { type: 'string', description: 'Human-readable summary' },
            newPatterns: { type: 'number', description: 'Number of new patterns learned' }
          },
          required: ['adsFound', 'summary']
        }
      }
    }
  ];

  const agentState = {
    isRunning: false,
    lastAnalysis: null,
    learnedPatterns: [],
    analysisHistory: [],
    totalAnalyses: 0,
    totalAdsFound: 0,
    totalPatternsLearned: 0
  };

  async function loadState() {
    try {
      const stored = await chrome.storage.local.get('agentState');
      if (stored.agentState) {
        Object.assign(agentState, stored.agentState);
      }
    } catch {}
  }

  async function saveState() {
    await chrome.storage.local.set({ agentState: {
      learnedPatterns: agentState.learnedPatterns,
      totalAnalyses: agentState.totalAnalyses,
      totalAdsFound: agentState.totalAdsFound,
      totalPatternsLearned: agentState.totalPatternsLearned,
      lastAnalysis: agentState.lastAnalysis
    }});
  }

  async function analyzePage(pageData) {
    if (!OllamaClient.isConfigured()) {
      return { error: 'Ollama not configured', results: [] };
    }

    if (agentState.isRunning) {
      return { error: 'Analysis already in progress', results: [] };
    }

    agentState.isRunning = true;

    try {
      const htmlSnippet = truncateHTML(pageData.html, 6000);
      const scriptSources = (pageData.scripts || []).slice(0, 30);
      const iframeSources = (pageData.iframes || []).slice(0, 15);

      const userMessage = `Analyze this webpage for ads, trackers, and anti-adblock scripts.

DOMAIN: ${pageData.domain}
URL: ${pageData.url}

PAGE HTML (truncated):
\`\`\`html
${htmlSnippet}
\`\`\`

EXTERNAL SCRIPTS (${scriptSources.length}):
${scriptSources.map(s => `- ${s}`).join('\n')}

IFRAMES (${iframeSources.length}):
${iframeSources.map(s => `- ${s}`).join('\n')}

${pageData.suspiciousElements ? `SUSPICIOUS ELEMENTS (flagged by heuristic engine, need verification):
${pageData.suspiciousElements.map(e => `- <${e.tag}> class="${e.className}" id="${e.id}" score=${e.score}`).join('\n')}` : ''}

Instructions:
1. Identify all ad elements, sponsored content, and tracking scripts
2. For each ad found, call block_element with the CSS selector
3. For any new ad network domains, call add_network_rule
4. For any new patterns you discover, call learn_pattern
5. Finally, call report_finding with a summary

Focus on precision - only block elements you are confident are ads.`;

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ];

      const results = {
        blocked: [],
        networkRules: [],
        patterns: [],
        report: null
      };

      let response = await OllamaClient.chat(messages, {
        tools: TOOLS,
        temperature: 0.2,
        maxTokens: 3000
      });

      let iterations = 0;
      const MAX_ITERATIONS = 5;

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        const msg = response.message;

        if (!msg?.tool_calls || msg.tool_calls.length === 0) {
          if (msg?.content) {
            results.report = results.report || { summary: msg.content, adsFound: results.blocked.length };
          }
          break;
        }

        messages.push(msg);

        for (const toolCall of msg.tool_calls) {
          const fn = toolCall.function;
          const args = fn.arguments;
          let toolResult = '';

          switch (fn.name) {
            case 'block_element':
              if (args.confidence >= 0.6) {
                results.blocked.push({
                  selector: args.selector,
                  confidence: args.confidence,
                  reason: args.reason
                });
                toolResult = `Blocked: ${args.selector} (confidence: ${args.confidence})`;
              } else {
                toolResult = `Skipped: ${args.selector} (confidence ${args.confidence} below threshold 0.6)`;
              }
              break;

            case 'add_network_rule':
              results.networkRules.push({
                urlPattern: args.urlPattern,
                resourceTypes: args.resourceTypes || ['script', 'image', 'sub_frame'],
                reason: args.reason
              });
              toolResult = `Network rule added: ${args.urlPattern}`;
              break;

            case 'learn_pattern':
              const pattern = {
                type: args.patternType,
                pattern: args.pattern,
                domain: args.domain || '*',
                description: args.description,
                learnedAt: Date.now()
              };
              results.patterns.push(pattern);
              agentState.learnedPatterns.push(pattern);
              if (agentState.learnedPatterns.length > 200) {
                agentState.learnedPatterns = agentState.learnedPatterns.slice(-100);
              }
              toolResult = `Pattern learned: ${args.pattern} (${args.patternType})`;
              break;

            case 'report_finding':
              results.report = {
                adsFound: args.adsFound || 0,
                trackersFound: args.trackersFound || 0,
                antiAdblockDetected: args.antiAdblockDetected || false,
                summary: args.summary || '',
                newPatterns: args.newPatterns || 0
              };
              toolResult = 'Report filed.';
              break;

            default:
              toolResult = `Unknown tool: ${fn.name}`;
          }

          messages.push({ role: 'tool', content: toolResult });
        }

        response = await OllamaClient.chat(messages, {
          tools: TOOLS,
          temperature: 0.2,
          maxTokens: 2000
        });
      }

      agentState.totalAnalyses++;
      agentState.totalAdsFound += results.blocked.length;
      agentState.totalPatternsLearned += results.patterns.length;
      agentState.lastAnalysis = {
        domain: pageData.domain,
        timestamp: Date.now(),
        adsFound: results.blocked.length,
        patternsLearned: results.patterns.length
      };

      await saveState();
      return results;

    } catch (err) {
      console.error('[AdBlockPrime Agent] Analysis error:', err);
      return { error: err.message, results: [] };
    } finally {
      agentState.isRunning = false;
    }
  }

  async function classifyElement(elementData) {
    if (!OllamaClient.isConfigured()) return { isAd: false, confidence: 0 };

    try {
      const prompt = `Classify this HTML element. Is it an advertisement? Respond with ONLY valid JSON: {"isAd": boolean, "confidence": 0.0-1.0, "reason": "string"}

Element: <${elementData.tag} class="${elementData.className}" id="${elementData.id}" ${elementData.attributes || ''}>
Inner text (first 200 chars): ${(elementData.text || '').substring(0, 200)}
Parent class: ${elementData.parentClass || ''}
Dimensions: ${elementData.width}x${elementData.height}
Source: ${elementData.src || 'none'}
Domain: ${elementData.domain}`;

      const response = await OllamaClient.generate(prompt, {
        temperature: 0.1,
        maxTokens: 200
      });

      const text = response.response || '';
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { isAd: false, confidence: 0, reason: 'Could not parse response' };
    } catch (err) {
      return { isAd: false, confidence: 0, reason: err.message };
    }
  }

  async function analyzeAntiAdblock(scriptContent, domain) {
    if (!OllamaClient.isConfigured()) return null;

    try {
      const truncated = scriptContent.substring(0, 3000);
      const response = await OllamaClient.generate(
        `Analyze this JavaScript for anti-adblock detection. Respond with JSON: {"isAntiAdblock": boolean, "techniques": ["string"], "bypasStrategy": "string"}

Script from ${domain}:
\`\`\`javascript
${truncated}
\`\`\``, {
          temperature: 0.1,
          maxTokens: 500
        }
      );

      const text = response.response || '';
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      return null;
    }
  }

  async function suggestFiltersForSite(domain, pageStructure) {
    if (!OllamaClient.isConfigured()) return [];

    try {
      const response = await OllamaClient.chat([
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Generate CSS selectors to block ads on ${domain}. Return ONLY a JSON array of objects: [{"selector": "string", "confidence": 0.0-1.0, "description": "string"}]

Page structure:
${pageStructure.substring(0, 4000)}`
        }
      ], {
        temperature: 0.2,
        maxTokens: 1500
      });

      const text = response.message?.content || '';
      const arrayMatch = text.match(/\[[\s\S]*?\]/);
      return arrayMatch ? JSON.parse(arrayMatch[0]) : [];
    } catch {
      return [];
    }
  }

  function truncateHTML(html, maxLen) {
    if (!html || html.length <= maxLen) return html || '';
    const headEnd = html.indexOf('</head>');
    if (headEnd > 0 && headEnd < maxLen / 2) {
      const head = html.substring(0, Math.min(headEnd + 7, maxLen / 3));
      const bodyStart = html.indexOf('<body');
      if (bodyStart > 0) {
        const bodyContent = html.substring(bodyStart, bodyStart + (maxLen - head.length));
        return head + '\n...\n' + bodyContent;
      }
    }
    return html.substring(0, maxLen) + '\n... [truncated]';
  }

  function getState() {
    return { ...agentState };
  }

  function getLearnedPatterns() {
    return [...agentState.learnedPatterns];
  }

  return {
    analyzePage,
    classifyElement,
    analyzeAntiAdblock,
    suggestFiltersForSite,
    loadState,
    saveState,
    getState,
    getLearnedPatterns,
    TOOLS
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdBlockAgent;
}
