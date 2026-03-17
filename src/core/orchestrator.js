/**
 * Orchestrator — The main control loop of the chatbot engine.
 *
 * This is the heart of the CORE. It coordinates every component to process
 * a single user message from input to final response.
 *
 * Flow per message:
 *   1. Load/create user session
 *   2. Build prompt (system + rules + history + user message)
 *   3. Send to AI backend
 *   4. If AI responds with text → format and return
 *   5. If AI requests tool calls → execute tools → feed results back to AI → repeat
 *   6. Apply loop limit to prevent infinite tool-calling chains
 *   7. Update session with all new messages
 */
export class Orchestrator {
  /**
   * @param {object} deps - Injected dependencies
   * @param {import('./session-manager.js').SessionManager} deps.sessionManager
   * @param {import('./prompt-builder.js').PromptBuilder} deps.promptBuilder
   * @param {import('./tool-executor.js').ToolExecutor} deps.toolExecutor
   * @param {import('./response-formatter.js').ResponseFormatter} deps.responseFormatter
   * @param {import('../backends/backend-interface.js').BackendInterface} deps.backend - Primary AI backend
   * @param {import('../backends/backend-interface.js').BackendInterface} [deps.fallbackBackend] - Optional fallback
   * @param {object} [options={}]
   * @param {number} [options.maxToolCallsPerTurn=5] - Max sequential tool calls per user turn
   * @param {number} [options.maxHistoryMessages=20] - Max history messages to include in prompt
   * @param {import('./types.js').ToolDefinition[]} [options.tools=[]] - Available tools
   */
  constructor(deps, options = {}) {
    this.sessionManager = deps.sessionManager;
    this.promptBuilder = deps.promptBuilder;
    this.toolExecutor = deps.toolExecutor;
    this.responseFormatter = deps.responseFormatter;
    this.backend = deps.backend;
    this.fallbackBackend = deps.fallbackBackend || null;

    this.maxToolCallsPerTurn = options.maxToolCallsPerTurn ?? 5;
    this.maxHistoryMessages = options.maxHistoryMessages ?? 20;
    this.tools = options.tools || [];
  }

  /**
   * Process a user message and return the bot's response.
   *
   * This is the main public API of the CORE engine.
   *
   * @param {object} params
   * @param {string} params.message - The user's message text
   * @param {string | null} [params.sessionId] - Existing session ID, or null to start a new session
   * @param {string} [params.userId='anonymous'] - User identifier for session tracking
   * @returns {Promise<ChatResult>}
   */
  async chat({ message, sessionId = null, userId = 'anonymous' }) {
    // 1. Load or create session
    const session = this.sessionManager.getOrCreate(sessionId, userId);

    // 2. Build the full prompt (system + history + user message)
    const messages = this.promptBuilder.buildMessages({
      session,
      userMessage: message,
      tools: this.tools,
      maxHistoryMessages: this.maxHistoryMessages,
    });

    // 3. Add user message to session history
    this.sessionManager.addMessage(session.id, {
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    // 4. Execute the AI interaction loop (handles tool calling chains)
    let activeMessages = [...messages];
    let toolCallsThisTurn = 0;
    let finalResponse = null;

    while (toolCallsThisTurn <= this.maxToolCallsPerTurn) {
      // 4a. Get AI response (with fallback on error)
      const aiResponse = await this._callBackend(activeMessages);

      // 4b. Record token usage
      const tokensUsed = (aiResponse.usage?.promptTokens || 0) + (aiResponse.usage?.completionTokens || 0);
      this.sessionManager.recordTokenUsage(session.id, tokensUsed);

      // 4c. Text response — we're done
      if (aiResponse.finishReason !== 'tool_calls' || !aiResponse.toolCalls?.length) {
        finalResponse = aiResponse.content;
        break;
      }

      // 4d. Tool calls requested — execute them
      toolCallsThisTurn += aiResponse.toolCalls.length;
      this.sessionManager.recordToolCalls(session.id, aiResponse.toolCalls.length);

      // Add the assistant's "I want to call these tools" message to the chain
      const assistantMsg = {
        role: 'assistant',
        content: null,
        toolCalls: aiResponse.toolCalls,
        timestamp: new Date(),
      };
      activeMessages.push(assistantMsg);
      this.sessionManager.addMessage(session.id, assistantMsg);

      // Execute each tool call in parallel
      const toolResults = await Promise.all(
        aiResponse.toolCalls.map(async (toolCall) => {
          const result = await this.toolExecutor.execute(toolCall.name, toolCall.arguments);
          return {
            role: 'tool',
            content: result,
            toolCallId: toolCall.id,
            timestamp: new Date(),
          };
        }),
      );

      // Add tool results to the conversation chain
      for (const toolResult of toolResults) {
        activeMessages.push(toolResult);
        this.sessionManager.addMessage(session.id, toolResult);
      }

      // Guard: max tool calls per turn
      if (toolCallsThisTurn > this.maxToolCallsPerTurn) {
        finalResponse = "I've reached the limit for actions per message. Please ask me to continue.";
        break;
      }
    }

    // 5. Format and save the final response
    const formattedResponse = this.responseFormatter.format(finalResponse);

    this.sessionManager.addMessage(session.id, {
      role: 'assistant',
      content: formattedResponse,
      timestamp: new Date(),
    });

    return {
      response: formattedResponse,
      sessionId: session.id,
      metadata: {
        toolCallsThisTurn,
        tokensUsed: session.metadata.tokensUsed,
        escalated: session.metadata.escalated,
      },
    };
  }

  /**
   * Get the welcome message for a new session.
   * Uses the 'welcome' prompt template.
   *
   * @returns {string}
   */
  getWelcomeMessage() {
    // The welcome template uses the same variables as the system prompt
    // We can create a fake empty session and extract the welcome message
    return this.promptBuilder._renderTemplate('welcome', this.promptBuilder.variables);
  }

  // ──────────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────────

  async _callBackend(messages) {
    try {
      return await this.backend.chat(messages, this.tools);
    } catch (primaryError) {
      if (this.fallbackBackend) {
        console.warn(`[Orchestrator] Primary backend failed (${primaryError.message}), trying fallback...`);
        try {
          return await this.fallbackBackend.chat(messages, this.tools);
        } catch (fallbackError) {
          throw new Error(
            `Both primary and fallback backends failed.\n` +
            `Primary: ${primaryError.message}\n` +
            `Fallback: ${fallbackError.message}`,
          );
        }
      }
      throw primaryError;
    }
  }
}

/**
 * @typedef {object} ChatResult
 * @property {string} response - The formatted bot response
 * @property {string} sessionId - The session ID (for subsequent turns)
 * @property {object} metadata - Turn metadata (tool calls, tokens, etc.)
 */
