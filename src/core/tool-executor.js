import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createHttpClient } from '../integrations/http-client.js';

/**
 * Tool Executor — Executes external API calls as directed by the AI.
 *
 * When the AI decides it needs to call a tool (e.g., check order status),
 * this module:
 * 1. Validates the AI-provided parameters against the tool's JSON Schema
 * 2. Authenticates the request using the configured auth strategy
 * 3. Executes the HTTP call to the business API
 * 4. Transforms the response into a concise, AI-readable summary
 *
 * The AI never sees raw API responses or stack traces — only clean summaries.
 */
export class ToolExecutor {
  /**
   * @param {object} options
   * @param {import('./types.js').ToolDefinition[]} options.tools - Available tool definitions
   * @param {object} [options.authConfig={}] - Authentication configuration per tool/service
   * @param {object} [options.globalHeaders={}] - Headers to inject into all tool requests
   * @param {number} [options.timeoutMs=10000] - Default HTTP timeout per tool call
   * @param {number} [options.maxRetries=2] - Max retries on transient failures
   */
  constructor(options = {}) {
    this.tools = new Map();
    this.authConfig = options.authConfig || {};
    this.globalHeaders = options.globalHeaders || {};
    this.timeoutMs = options.timeoutMs || 10000;
    this.maxRetries = options.maxRetries || 2;

    // Load tool definitions into a lookup map
    if (options.tools) {
      for (const tool of options.tools) {
        this.tools.set(tool.name, tool);
      }
    }

    // JSON Schema validator
    const ajv = new Ajv({ allErrors: true, coerceTypes: true });
    addFormats(ajv);
    this._ajv = ajv;
    this._validators = new Map();

    // Pre-compile validators for all tools
    for (const [name, tool] of this.tools) {
      if (tool.parameters) {
        this._validators.set(name, ajv.compile(tool.parameters));
      }
    }

    this._httpClient = createHttpClient({ timeout: this.timeoutMs });
  }

  /**
   * Execute a tool call.
   *
   * @param {string} toolName - The tool identifier
   * @param {Record<string, any>} args - Arguments from the AI
   * @returns {Promise<string>} AI-readable result or error description
   */
  async execute(toolName, args) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return `Error: Tool '${toolName}' is not defined. Available tools: ${[...this.tools.keys()].join(', ')}`;
    }

    // Step 1: Validate parameters
    const validationError = this._validate(toolName, args);
    if (validationError) return validationError;

    // Step 2: Execute with retry
    try {
      const result = await this._executeWithRetry(tool, args);
      return result;
    } catch (error) {
      return this._formatError(toolName, error);
    }
  }

  /**
   * Register a new tool at runtime (without restarting).
   *
   * @param {import('./types.js').ToolDefinition} tool
   */
  registerTool(tool) {
    this.tools.set(tool.name, tool);
    if (tool.parameters) {
      this._validators.set(tool.name, this._ajv.compile(tool.parameters));
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────────

  _validate(toolName, args) {
    const validator = this._validators.get(toolName);
    if (!validator) return null; // No schema = no validation

    const valid = validator(args);
    if (valid) return null;

    const errors = validator.errors
      .map((e) => `  - ${e.instancePath || 'root'} ${e.message}`)
      .join('\n');

    return `Validation error for tool '${toolName}':\n${errors}\nPlease ask the user to provide the missing/invalid information.`;
  }

  async _executeWithRetry(tool, args) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this._callToolEndpoint(tool, args);
      } catch (error) {
        lastError = error;
        // Only retry on network/timeout errors, not validation or auth failures
        if (error.response?.status >= 400 && error.response?.status < 500) {
          throw error; // Don't retry 4xx errors
        }
        if (attempt < this.maxRetries) {
          const delay = (attempt + 1) * 1000; // 1s, 2s
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  async _callToolEndpoint(tool, args) {
    if (!tool.endpoint) {
      throw new Error(`Tool '${tool.name}' has no endpoint defined`);
    }

    const { method = 'GET', url } = tool.endpoint;

    // Interpolate URL path parameters (e.g., /orders/{{order_id}})
    const resolvedUrl = this._interpolate(url, args);

    const headers = {
      ...this.globalHeaders,
      ...this._getAuthHeaders(tool.name),
      'Content-Type': 'application/json',
    };

    // Query params vs body depending on method
    const config = { headers };
    if (method.toUpperCase() === 'GET') {
      config.params = args;
    } else {
      config.data = args;
    }

    const response = await this._httpClient.request({
      method: method.toUpperCase(),
      url: resolvedUrl,
      ...config,
    });

    return this._formatResponse(tool, response.data, args);
  }

  _interpolate(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{${key}}`);
  }

  _getAuthHeaders(toolName) {
    const auth = this.authConfig[toolName] || this.authConfig['*'];
    if (!auth) return {};

    if (auth.type === 'bearer') return { Authorization: `Bearer ${auth.token}` };
    if (auth.type === 'api-key') return { [auth.header || 'X-API-Key']: auth.key };
    if (auth.type === 'basic') {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }
    return {};
  }

  _formatResponse(tool, data, args) {
    // If the tool has a response template, use it
    if (tool.responseMapping?.template) {
      const template = tool.responseMapping.template;
      const flatData = { ...args, ...this._flatten(data) };
      return this._interpolate(template, flatData);
    }

    // If the tool specifies which fields to extract, use those
    if (tool.responseMapping?.fields) {
      const extracted = {};
      for (const field of tool.responseMapping.fields) {
        extracted[field] = this._getNestedValue(data, field);
      }
      return JSON.stringify(extracted);
    }

    // Default: return serialized response (truncated if too large)
    const json = JSON.stringify(data);
    return json.length > 2000 ? json.substring(0, 2000) + '...[truncated]' : json;
  }

  _formatError(toolName, error) {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) return `Error: Authentication failed for tool '${toolName}'. Check API credentials.`;
      if (status === 403) return `Error: Access denied for tool '${toolName}'. Insufficient permissions.`;
      if (status === 404) return `Error: Resource not found when calling '${toolName}'.`;
      if (status === 429) return `Error: Rate limit reached for '${toolName}'. Please try again in a moment.`;
      if (status >= 500) return `Error: '${toolName}' service is temporarily unavailable. Please try again later.`;
    }
    if (error.code === 'ECONNABORTED') return `Error: '${toolName}' timed out. The service may be slow.`;
    if (error.code === 'ECONNREFUSED') return `Error: Cannot reach '${toolName}' service. It may be offline.`;
    return `Error executing '${toolName}': ${error.message}`;
  }

  _flatten(obj, prefix = '') {
    return Object.keys(obj).reduce((acc, key) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(acc, this._flatten(obj[key], fullKey));
      } else {
        acc[fullKey] = obj[key];
        acc[key] = obj[key]; // Also accessible by short key
      }
      return acc;
    }, {});
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}
