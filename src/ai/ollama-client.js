'use strict';

const AIProvider = (() => {

  const PROVIDERS = {
    ollama: {
      name: 'Ollama',
      baseUrl: 'https://api.ollama.com',
      keyUrl: 'https://ollama.com/settings/keys',
      models: [
        { id: 'qwen3-coder-next', name: 'Qwen3 Coder Next (recommended)' },
        { id: 'qwen3.5', name: 'Qwen 3.5' },
        { id: 'devstral-small-2', name: 'Devstral Small 2' },
        { id: 'ministral-3', name: 'Ministral 3' },
        { id: 'glm-5', name: 'GLM 5' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
        { id: 'deepseek-v3.2', name: 'DeepSeek V3.2' }
      ],
      defaultModel: 'qwen3-coder-next'
    },
    openai: {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      keyUrl: 'https://platform.openai.com/api-keys',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o (recommended)' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (fast & cheap)' },
        { id: 'gpt-4.1', name: 'GPT-4.1' },
        { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
        { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano (fastest)' },
        { id: 'o3-mini', name: 'o3-mini (reasoning)' }
      ],
      defaultModel: 'gpt-4o-mini'
    },
    anthropic: {
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      keyUrl: 'https://console.anthropic.com/settings/keys',
      models: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (recommended)' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (fast & cheap)' },
        { id: 'claude-opus-4-20250514', name: 'Claude Opus 4 (most capable)' }
      ],
      defaultModel: 'claude-sonnet-4-20250514'
    },
    mistral: {
      name: 'Mistral',
      baseUrl: 'https://api.mistral.ai/v1',
      keyUrl: 'https://console.mistral.ai/api-keys',
      models: [
        { id: 'mistral-medium-latest', name: 'Mistral Medium (recommended)' },
        { id: 'mistral-small-latest', name: 'Mistral Small (fast)' },
        { id: 'mistral-large-latest', name: 'Mistral Large (most capable)' },
        { id: 'codestral-latest', name: 'Codestral (code-focused)' },
        { id: 'devstral-small-latest', name: 'Devstral Small' }
      ],
      defaultModel: 'mistral-small-latest'
    }
  };

  let config = {
    provider: 'ollama',
    apiKey: '',
    baseUrl: '',
    model: '',
    enabled: false,
    maxTokens: 2048,
    temperature: 0.3
  };

  async function loadConfig() {
    try {
      const stored = await chrome.storage.local.get('aiProviderConfig');
      if (stored.aiProviderConfig) {
        config = { ...config, ...stored.aiProviderConfig };
      } else {
        const legacy = await chrome.storage.local.get('ollamaConfig');
        if (legacy.ollamaConfig) {
          config = {
            ...config,
            provider: 'ollama',
            apiKey: legacy.ollamaConfig.apiKey || '',
            baseUrl: legacy.ollamaConfig.baseUrl || PROVIDERS.ollama.baseUrl,
            model: legacy.ollamaConfig.model || PROVIDERS.ollama.defaultModel,
            enabled: legacy.ollamaConfig.enabled || false
          };
          await saveConfig(config);
        }
      }
    } catch {}
    return config;
  }

  async function saveConfig(newConfig) {
    config = { ...config, ...newConfig };
    await chrome.storage.local.set({ aiProviderConfig: config });
  }

  function isConfigured() {
    return config.enabled && config.apiKey && config.apiKey.length > 5;
  }

  function getProviderInfo() {
    return PROVIDERS[config.provider] || PROVIDERS.ollama;
  }

  // ─── Unified Chat Interface ───

  async function chat(messages, options = {}) {
    if (!isConfigured()) {
      throw new Error('AI provider not configured. Set your API key in settings.');
    }

    const provider = config.provider;
    switch (provider) {
      case 'openai': return await chatOpenAI(messages, options);
      case 'anthropic': return await chatAnthropic(messages, options);
      case 'mistral': return await chatMistral(messages, options);
      case 'ollama':
      default: return await chatOllama(messages, options);
    }
  }

  async function generate(prompt, options = {}) {
    const messages = [{ role: 'user', content: prompt }];
    const result = await chat(messages, { ...options, tools: undefined });
    const content = result.message?.content || result.response || '';
    return { response: content };
  }

  // ─── Ollama ───

  async function chatOllama(messages, options) {
    const baseUrl = config.baseUrl || PROVIDERS.ollama.baseUrl;
    const body = {
      model: options.model || config.model || PROVIDERS.ollama.defaultModel,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? config.temperature,
        num_predict: options.maxTokens ?? config.maxTokens
      }
    };
    if (options.tools) body.tools = options.tools;

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`Ollama error ${response.status}: ${err}`);
    }
    return await response.json();
  }

  // ─── OpenAI ───

  async function chatOpenAI(messages, options) {
    const baseUrl = config.baseUrl || PROVIDERS.openai.baseUrl;
    const body = {
      model: options.model || config.model || PROVIDERS.openai.defaultModel,
      messages,
      max_tokens: options.maxTokens ?? config.maxTokens,
      temperature: options.temperature ?? config.temperature
    };

    if (options.tools) {
      body.tools = options.tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`OpenAI error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    return {
      message: {
        role: 'assistant',
        content: choice?.message?.content || '',
        tool_calls: choice?.message?.tool_calls?.map(tc => ({
          function: {
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments
          }
        })) || undefined
      }
    };
  }

  // ─── Anthropic ───

  async function chatAnthropic(messages, options) {
    const baseUrl = config.baseUrl || PROVIDERS.anthropic.baseUrl;

    let system = '';
    const filtered = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        system += (system ? '\n' : '') + msg.content;
      } else if (msg.role === 'tool') {
        filtered.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: msg.tool_use_id || 'tool', content: msg.content }]
        });
      } else {
        filtered.push(msg);
      }
    }

    const body = {
      model: options.model || config.model || PROVIDERS.anthropic.defaultModel,
      max_tokens: options.maxTokens ?? config.maxTokens,
      messages: filtered
    };

    if (system) body.system = system;

    if (options.tools) {
      body.tools = options.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters
      }));
    }

    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`Anthropic error ${response.status}: ${err}`);
    }

    const data = await response.json();
    let textContent = '';
    const toolCalls = [];

    for (const block of (data.content || [])) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          function: {
            name: block.name,
            arguments: block.input
          }
        });
      }
    }

    return {
      message: {
        role: 'assistant',
        content: textContent,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      }
    };
  }

  // ─── Mistral ───

  async function chatMistral(messages, options) {
    const baseUrl = config.baseUrl || PROVIDERS.mistral.baseUrl;
    const body = {
      model: options.model || config.model || PROVIDERS.mistral.defaultModel,
      messages,
      max_tokens: options.maxTokens ?? config.maxTokens,
      temperature: options.temperature ?? config.temperature
    };

    if (options.tools) {
      body.tools = options.tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`Mistral error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    return {
      message: {
        role: 'assistant',
        content: choice?.message?.content || '',
        tool_calls: choice?.message?.tool_calls?.map(tc => ({
          function: {
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments
          }
        })) || undefined
      }
    };
  }

  return {
    loadConfig,
    saveConfig,
    isConfigured,
    chat,
    generate,
    getConfig: () => ({ ...config }),
    getProviderInfo,
    PROVIDERS
  };
})();

const OllamaClient = AIProvider;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIProvider;
}
