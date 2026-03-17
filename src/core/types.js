/**
 * @fileoverview Shared TypeScript-style type definitions (as JSDoc).
 *
 * These are NOT runtime objects — they serve as documentation and IDE
 * type-checking hints throughout the project.
 */

/**
 * A single message in a conversation.
 * @typedef {object} Message
 * @property {'user' | 'assistant' | 'system' | 'tool'} role - Who sent the message
 * @property {string} content - Message text content
 * @property {Date} [timestamp] - When the message was sent
 * @property {string} [toolCallId] - ID linking a tool result to its tool call
 * @property {ToolCall[]} [toolCalls] - Tool calls requested by the assistant
 */

/**
 * A tool call requested by the AI.
 * @typedef {object} ToolCall
 * @property {string} id - Unique ID for this tool call (OpenAI-compatible)
 * @property {string} name - The tool function name
 * @property {Record<string, any>} arguments - Parsed arguments for the tool
 */

/**
 * A tool/function definition that the AI can invoke.
 * @typedef {object} ToolDefinition
 * @property {string} name - Unique identifier (e.g., 'check_order_status')
 * @property {string} description - Human-readable purpose; guides AI decisions
 * @property {object} parameters - JSON Schema for parameters
 * @property {object} [endpoint] - HTTP endpoint configuration
 * @property {object} [responseMapping] - How to format the API response for the AI
 */

/**
 * The response from an AI backend after processing a turn.
 * @typedef {object} AIResponse
 * @property {string | null} content - Text response (null if tool call only)
 * @property {ToolCall[] | null} toolCalls - Tool calls requested (null if text only)
 * @property {{ promptTokens: number, completionTokens: number }} usage - Token usage
 * @property {'stop' | 'tool_calls' | 'length'} finishReason - Why generation ended
 */

/**
 * Information about the AI model currently in use.
 * @typedef {object} ModelInfo
 * @property {string} name - Model identifier
 * @property {number} contextWindow - Maximum context window in tokens
 * @property {boolean} supportsToolCalls - Whether this model supports function calling
 */

/**
 * A user's conversation session.
 * @typedef {object} Session
 * @property {string} id - Unique session ID
 * @property {string} userId - User identifier
 * @property {Date} createdAt - When the session started
 * @property {Date} lastActivityAt - Last interaction time
 * @property {Message[]} conversationHistory - All messages in the session
 * @property {Record<string, any>} gatheredData - Data collected during the conversation
 * @property {{ tokensUsed: number, toolCallsTotal: number, escalated: boolean }} metadata
 */

/**
 * Configuration for the chatbot instance.
 * @typedef {object} ChatbotConfig
 * @property {string} botName - Display name for the assistant
 * @property {string} companyName - The business name
 * @property {object} ai - AI backend configuration
 * @property {object} [orchestrator] - Orchestrator tuning parameters
 * @property {object} [session] - Session management settings
 */

// This file only exports JSDoc types, no runtime exports needed.
export {};
