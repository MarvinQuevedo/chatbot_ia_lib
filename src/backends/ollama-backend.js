import axios from 'axios';
import { BackendInterface } from './backend-interface.js';

/**
 * Ollama Backend — Communicates with a locally running Ollama instance.
 *
 * Ollama exposes an OpenAI-compatible REST API at localhost:11434.
 * This backend handles chat completions, tool/function calling,
 * and health checks against that local API.
 *
 * @extends {BackendInterface}
 */
export class OllamaBackend extends BackendInterface {
  /**
   * @param {object} config
   * @param {string} [config.baseUrl='http://localhost:11434'] - Ollama server URL
   * @param {string} config.model - The Ollama model tag (e.g., 'llama3.2:8b')
   * @param {number} [config.timeoutMs=60000] - Request timeout in milliseconds
   * @param {object} [config.options] - Additional Ollama model options (num_ctx, etc.)
   */
  constructor(config) {
    super(config);
    this.name = 'ollama';
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model;
    this.timeoutMs = config.timeoutMs || 60000;
    this.options = config.options || {};

    if (!this.model) {
      throw new Error('OllamaBackend requires a model name (e.g., llama3.2:8b)');
    }

    this._client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Send a conversation to Ollama and receive a completion.
   *
   * Uses Ollama's OpenAI-compatible `/v1/chat/completions` endpoint
   * to support tool calling natively.
   *
   * @param {import('../core/types.js').Message[]} messages
   * @param {import('../core/types.js').ToolDefinition[]} [tools=[]]
   * @returns {Promise<import('../core/types.js').AIResponse>}
   */
  async chat(messages, tools = []) {
    const body = {
      model: this.model,
      messages: this._formatMessages(messages),
      stream: false,
      options: this.options,
    };

    if (tools.length > 0) {
      body.tools = this._formatTools(tools);
      body.tool_choice = 'auto';
    }

    try {
      const response = await this._client.post('/v1/chat/completions', body);
      return this._parseResponse(response.data);
    } catch (error) {
      throw this._wrapError(error);
    }
  }

  /**
   * Check if Ollama is running and the configured model is available.
   *
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      const response = await this._client.get('/api/tags', { timeout: 5000 });
      const models = response.data?.models || [];
      const modelName = this.model.split(':')[0];
      return models.some((m) => m.name.startsWith(modelName));
    } catch {
      return false;
    }
  }

  /**
   * Get information about the current model.
   *
   * @returns {Promise<import('../core/types.js').ModelInfo>}
   */
  async getModelInfo() {
    try {
      const response = await this._client.post('/api/show', { name: this.model });
      const details = response.data;

      // Try to extract context window from model parameters
      const numCtx = this.options?.num_ctx
        || parseInt(details?.parameters?.match(/num_ctx\s+(\d+)/)?.[1] || '4096');

      return {
        name: this.model,
        contextWindow: numCtx,
        supportsToolCalls: true, // Llama 3.x models support function calling via Ollama
      };
    } catch {
      return {
        name: this.model,
        contextWindow: 4096,
        supportsToolCalls: true,
      };
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────

  /**
   * Format internal Message[] to OpenAI-compatible message format.
   * @param {import('../core/types.js').Message[]} messages
   * @returns {object[]}
   */
  _formatMessages(messages) {
    return messages.map((msg) => {
      const formatted = { role: msg.role, content: msg.content };

      // Handle tool result messages
      if (msg.role === 'tool') {
        formatted.tool_call_id = msg.toolCallId;
      }

      // Handle assistant messages with tool calls
      if (msg.role === 'assistant' && msg.toolCalls?.length > 0) {
        formatted.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
        formatted.content = null; // OpenAI spec: content is null when tool_calls present
      }

      return formatted;
    });
  }

  /**
   * Format ToolDefinition[] to OpenAI-compatible tool format.
   * @param {import('../core/types.js').ToolDefinition[]} tools
   * @returns {object[]}
   */
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

  /**
   * Parse the OpenAI-compatible response into our internal AIResponse format.
   * @param {object} data - Raw API response
   * @returns {import('../core/types.js').AIResponse}
   */
  _parseResponse(data) {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('OllamaBackend: Empty response from model');
    }

    const message = choice.message;
    const rawToolCalls = message.tool_calls;

    let toolCalls = null;
    if (rawToolCalls?.length > 0) {
      toolCalls = rawToolCalls.map((tc) => ({
        id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: tc.function.name,
        arguments: typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments,
      }));
    }

    return {
      content: message.content || null,
      toolCalls,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
      },
      finishReason: choice.finish_reason || 'stop',
    };
  }

  /**
   * Wrap Axios errors with cleaner, loggable messages.
   * @param {Error} error
   * @returns {Error}
   */
  _wrapError(error) {
    if (error.code === 'ECONNREFUSED') {
      return new Error(`OllamaBackend: Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running?`);
    }
    if (error.response?.status === 404) {
      return new Error(`OllamaBackend: Model '${this.model}' not found. Run: ollama pull ${this.model}`);
    }
    if (error.code === 'ECONNABORTED') {
      return new Error(`OllamaBackend: Request timed out after ${this.timeoutMs}ms`);
    }
    return new Error(`OllamaBackend: ${error.message}`);
  }
}
