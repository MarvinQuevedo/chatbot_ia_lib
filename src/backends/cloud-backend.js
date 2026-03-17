import OpenAI from 'openai';
import { BackendInterface } from './backend-interface.js';

/**
 * Cloud Backend — Connects to any OpenAI-compatible cloud AI API.
 *
 * Supports DeepSeek, OpenAI GPT, and any provider that implements
 * the OpenAI chat completions API format.
 *
 * @extends {BackendInterface}
 */
export class CloudBackend extends BackendInterface {
  /**
   * @param {object} config
   * @param {string} config.apiKey - API key for the cloud provider
   * @param {string} config.model - Model identifier (e.g., 'deepseek-chat', 'gpt-4o')
   * @param {string} [config.baseUrl] - API base URL (for non-OpenAI providers)
   * @param {number} [config.timeoutMs=30000] - Request timeout in milliseconds
   */
  constructor(config) {
    super(config);
    this.name = 'cloud';
    this.model = config.model;
    this.timeoutMs = config.timeoutMs || 30000;

    if (!config.apiKey) {
      throw new Error('CloudBackend requires an API key');
    }
    if (!this.model) {
      throw new Error('CloudBackend requires a model name');
    }

    this._client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined,
      timeout: this.timeoutMs,
    });
  }

  /**
   * Send a conversation to the cloud AI and receive a completion.
   *
   * @param {import('../core/types.js').Message[]} messages
   * @param {import('../core/types.js').ToolDefinition[]} [tools=[]]
   * @returns {Promise<import('../core/types.js').AIResponse>}
   */
  async chat(messages, tools = []) {
    try {
      const params = {
        model: this.model,
        messages: this._formatMessages(messages),
      };

      if (tools.length > 0) {
        params.tools = this._formatTools(tools);
        params.tool_choice = 'auto';
      }

      const response = await this._client.chat.completions.create(params);
      return this._parseResponse(response);
    } catch (error) {
      throw this._wrapError(error);
    }
  }

  /**
   * Validate that the API key works and the model is accessible.
   *
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      await this._client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Return static model info (cloud APIs don't expose this endpoint uniformly).
   *
   * @returns {Promise<import('../core/types.js').ModelInfo>}
   */
  async getModelInfo() {
    // Cloud providers don't have a standard way to query context windows.
    // Use known values for common models, default to 8192 otherwise.
    const contextWindows = {
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'gpt-4-turbo': 128000,
      'gpt-3.5-turbo': 16385,
      'deepseek-chat': 65536,
      'deepseek-coder': 65536,
    };

    return {
      name: this.model,
      contextWindow: contextWindows[this.model] || 8192,
      supportsToolCalls: true,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────

  _formatMessages(messages) {
    return messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId,
        };
      }
      if (msg.role === 'assistant' && msg.toolCalls?.length > 0) {
        return {
          role: 'assistant',
          content: null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      return { role: msg.role, content: msg.content };
    });
  }

  _formatTools(tools) {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  _parseResponse(response) {
    const choice = response.choices?.[0];
    if (!choice) throw new Error('CloudBackend: Empty response from API');

    const message = choice.message;
    const rawToolCalls = message.tool_calls;

    let toolCalls = null;
    if (rawToolCalls?.length > 0) {
      toolCalls = rawToolCalls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));
    }

    return {
      content: message.content || null,
      toolCalls,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
      },
      finishReason: choice.finish_reason || 'stop',
    };
  }

  _wrapError(error) {
    if (error.status === 401) {
      return new Error('CloudBackend: Invalid API key. Check your credentials.');
    }
    if (error.status === 429) {
      return new Error('CloudBackend: Rate limit exceeded. Slow down requests.');
    }
    if (error.status === 404) {
      return new Error(`CloudBackend: Model '${this.model}' not found or not accessible.`);
    }
    return new Error(`CloudBackend: ${error.message}`);
  }
}
