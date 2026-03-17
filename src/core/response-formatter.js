/**
 * Response Formatter — Post-processes AI responses before sending to the user.
 *
 * Responsibilities:
 * - Strip internal chain-of-thought markers and XML-style thinking tags
 * - Apply length limits
 * - Sanitize content (remove prompt artifacts)
 * - Format for the output channel (raw text, markdown, etc.)
 */
export class ResponseFormatter {
  /**
   * @param {object} [options={}]
   * @param {number} [options.maxLength=3000] - Maximum response character length
   * @param {'text' | 'markdown'} [options.outputFormat='markdown'] - Output format
   * @param {string[]} [options.blockedPhrases=[]] - Phrases to remove from responses
   */
  constructor(options = {}) {
    this.maxLength = options.maxLength || 3000;
    this.outputFormat = options.outputFormat || 'markdown';
    this.blockedPhrases = options.blockedPhrases || [];
  }

  /**
   * Process and clean an AI response before delivering it to the user.
   *
   * @param {string | null} content - Raw response from the AI backend
   * @returns {string} Clean, user-ready response
   */
  format(content) {
    if (!content || typeof content !== 'string') {
      return this._getFallback();
    }

    let text = content;

    // Step 1: Remove internal chain-of-thought / XML thinking markers
    text = this._stripThinkingTags(text);

    // Step 2: Remove any system prompt leakage artifacts
    text = this._removeSystemArtifacts(text);

    // Step 3: Apply blocked phrases filter
    text = this._applyBlockList(text);

    // Step 4: Trim whitespace
    text = text.trim();

    // Step 5: Enforce length limit
    if (text.length > this.maxLength) {
      text = this._truncate(text);
    }

    // Step 6: Return empty fallback if nothing is left
    if (!text) {
      return this._getFallback();
    }

    return text;
  }

  /**
   * Format a tool execution error into a user-friendly message.
   *
   * @param {string} toolName
   * @param {string} errorDescription
   * @returns {string}
   */
  formatToolError(toolName, errorDescription) {
    return `I encountered an issue while trying to retrieve that information. ${
      errorDescription.includes('unavailable') || errorDescription.includes('timed out')
        ? 'The service appears to be temporarily unavailable. Please try again in a moment.'
        : 'Please check your information and try again, or contact support if the issue persists.'
    }`;
  }

  /**
   * Format a fallback response when the AI cannot help.
   *
   * @returns {string}
   */
  formatFallback() {
    return this._getFallback();
  }

  // ──────────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────────

  _stripThinkingTags(text) {
    // Remove <think>...</think> tags (DeepSeek, some Llama models)
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // Remove <reasoning>...</reasoning> tags
    text = text.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
    // Remove ★ markers used by some models for internal notes
    text = text.replace(/★.*?★/g, '');
    // Remove common chain-of-thought prefixes
    text = text.replace(/^(Let me think|Thinking|Analysis|Reasoning):?\s*/i, '');
    return text;
  }

  _removeSystemArtifacts(text) {
    // Remove double system/assistant markers that sometimes leak
    text = text.replace(/^(SYSTEM|ASSISTANT|USER):\s*/i, '');
    // Remove raw JSON that leaked (e.g., {"role": "assistant"...})
    text = text.replace(/^\{"role".*?\}\n?/g, '');
    return text;
  }

  _applyBlockList(text) {
    for (const phrase of this.blockedPhrases) {
      text = text.split(phrase).join('[removed]');
    }
    return text;
  }

  _truncate(text) {
    // Try to cut at a sentence boundary near the limit
    const cutoff = this.maxLength - 100;
    const slice = text.substring(0, cutoff);
    const lastPeriod = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));

    if (lastPeriod > cutoff * 0.7) {
      return slice.substring(0, lastPeriod + 1) + '\n\n*(Response truncated)*';
    }
    return slice.trim() + '...\n\n*(Response truncated)*';
  }

  _getFallback() {
    return "I'm sorry, I wasn't able to generate a response. Please try again or contact support if the issue persists.";
  }
}
