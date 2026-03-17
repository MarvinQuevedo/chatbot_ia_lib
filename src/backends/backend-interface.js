/**
 * Backend Interface — Abstract base class for all AI backends.
 *
 * All backends (Ollama, Cloud) must extend this class and implement
 * the abstract methods. This ensures the CORE engine works identically
 * regardless of which AI provider is in use.
 *
 * @abstract
 */
export class BackendInterface {
  /**
   * @param {object} config - Backend-specific configuration
   */
  constructor(config) {
    if (new.target === BackendInterface) {
      throw new Error('BackendInterface is abstract and cannot be instantiated directly.');
    }
    this.config = config;
    this.name = 'unknown';
  }

  /**
   * Send a conversation to the AI and receive a response.
   *
   * @param {import('../core/types.js').Message[]} messages - The conversation history
   * @param {import('../core/types.js').ToolDefinition[]} [tools=[]] - Available tools the AI can call
   * @returns {Promise<import('../core/types.js').AIResponse>}
   * @abstract
   */
  async chat(messages, tools = []) {
    throw new Error(`${this.constructor.name} must implement chat()`);
  }

  /**
   * Check if this backend is available and responsive.
   *
   * @returns {Promise<boolean>}
   * @abstract
   */
  async healthCheck() {
    throw new Error(`${this.constructor.name} must implement healthCheck()`);
  }

  /**
   * Get information about the currently loaded model.
   *
   * @returns {Promise<import('../core/types.js').ModelInfo>}
   * @abstract
   */
  async getModelInfo() {
    throw new Error(`${this.constructor.name} must implement getModelInfo()`);
  }
}
