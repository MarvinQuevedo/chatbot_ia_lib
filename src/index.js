import fs from 'fs';
import path from 'path';
import { Orchestrator } from './core/orchestrator.js';
import { SessionManager } from './core/session-manager.js';
import { PromptBuilder } from './core/prompt-builder.js';
import { ToolExecutor } from './core/tool-executor.js';
import { ResponseFormatter } from './core/response-formatter.js';
import { OllamaBackend } from './backends/ollama-backend.js';
import { CloudBackend } from './backends/cloud-backend.js';

/**
 * Create a fully configured chatbot instance from a configuration directory.
 *
 * This is the main factory function — the single entry point for using the library.
 *
 * @example
 * ```js
 * import { createChatbot } from 'chatbot-ia-lib';
 *
 * const chatbot = await createChatbot({ configDir: './config' });
 * const result = await chatbot.chat({ message: 'Hello!', sessionId: null });
 * console.log(result.response);
 * ```
 *
 * @param {object} options
 * @param {string} options.configDir - Path to the configuration directory
 * @returns {Promise<ChatbotInstance>}
 */
export async function createChatbot(options) {
  const { configDir } = options;

  if (!configDir) throw new Error('createChatbot requires a configDir option');
  if (!fs.existsSync(configDir)) throw new Error(`Config directory not found: ${configDir}`);

  // Load main configuration file
  const configPath = path.join(configDir, 'chatbot.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`chatbot.config.json not found in ${configDir}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Load tool definitions
  let tools = [];
  const toolsPath = path.join(configDir, 'tools.json');
  if (fs.existsSync(toolsPath)) {
    const toolsFile = JSON.parse(fs.readFileSync(toolsPath, 'utf-8'));
    tools = toolsFile.tools || toolsFile || [];
  }

  // Load auth configuration
  let authConfig = {};
  const authPath = path.join(configDir, 'auth.json');
  if (fs.existsSync(authPath)) {
    authConfig = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
  }

  // ── Build AI Backend(s) ──────────────────────────────────────

  const primaryBackend = _createBackend(config.ai?.primary || config.ai);
  const fallbackBackend = config.ai?.fallback ? _createBackend(config.ai.fallback) : null;

  // ── Build CORE components ────────────────────────────────────

  const sessionManager = new SessionManager({
    sessionTtlMs: config.session?.ttlMs,
    maxHistoryMessages: config.session?.maxHistoryMessages,
  });

  const promptBuilder = new PromptBuilder({
    promptsDir: path.join(configDir, 'prompts'),
    rulesPath: fs.existsSync(path.join(configDir, 'rules.md'))
      ? path.join(configDir, 'rules.md')
      : fs.existsSync(path.join(configDir, 'rules.json'))
        ? path.join(configDir, 'rules.json')
        : null,
    variables: {
      botName: config.botName || 'Assistant',
      companyName: config.companyName || 'Our Company',
      roleDescription: config.roleDescription || 'a helpful virtual assistant',
      ...config.templateVariables,
    },
  });

  const toolExecutor = new ToolExecutor({
    tools,
    authConfig,
    timeoutMs: config.integrations?.timeoutMs,
    maxRetries: config.integrations?.maxRetries,
  });

  const responseFormatter = new ResponseFormatter({
    maxLength: config.orchestrator?.maxResponseLength,
    outputFormat: config.outputFormat,
    blockedPhrases: config.blockedPhrases,
  });

  const orchestrator = new Orchestrator(
    {
      sessionManager,
      promptBuilder,
      toolExecutor,
      responseFormatter,
      backend: primaryBackend,
      fallbackBackend,
    },
    {
      maxToolCallsPerTurn: config.orchestrator?.maxToolCallsPerTurn,
      maxHistoryMessages: config.orchestrator?.maxHistoryMessages,
      tools,
    },
  );

  return {
    /**
     * Process a user message and return the bot's response.
     * @type {(params: { message: string, sessionId?: string | null, userId?: string }) => Promise<import('./core/orchestrator.js').ChatResult>}
     */
    chat: orchestrator.chat.bind(orchestrator),

    /**
     * Get the welcome message template.
     * @type {() => string}
     */
    getWelcomeMessage: orchestrator.getWelcomeMessage.bind(orchestrator),

    /**
     * Hot-reload business rules without restarting.
     * @type {() => void}
     */
    reloadRules: promptBuilder.reloadRules.bind(promptBuilder),

    /**
     * Access to the session manager for advanced use cases.
     * @type {import('./core/session-manager.js').SessionManager}
     */
    sessions: sessionManager,

    /** Internal components (for testing/extending) */
    _internal: { orchestrator, sessionManager, promptBuilder, toolExecutor, responseFormatter },
  };
}

/**
 * @typedef {object} ChatbotInstance
 * @property {function} chat
 * @property {function} getWelcomeMessage
 * @property {function} reloadRules
 * @property {import('./core/session-manager.js').SessionManager} sessions
 */

// ──────────────────────────────────────────────────────────────
// Private helpers
// ──────────────────────────────────────────────────────────────

function _createBackend(backendConfig) {
  if (!backendConfig) throw new Error('AI backend configuration is required');

  const type = backendConfig.type?.toLowerCase();

  if (type === 'ollama') {
    return new OllamaBackend({
      model: backendConfig.model,
      baseUrl: backendConfig.baseUrl,
      timeoutMs: backendConfig.timeoutMs,
      options: backendConfig.options,
    });
  }

  if (type === 'cloud' || type === 'openai' || type === 'deepseek') {
    const apiKey = backendConfig.apiKey?.startsWith('${')
      ? process.env[backendConfig.apiKey.slice(2, -1)]
      : backendConfig.apiKey;

    return new CloudBackend({
      apiKey,
      model: backendConfig.model,
      baseUrl: backendConfig.baseUrl,
      timeoutMs: backendConfig.timeoutMs,
    });
  }

  throw new Error(`Unknown AI backend type: '${type}'. Supported: 'ollama', 'cloud'`);
}

// Re-export core classes for advanced users who want to compose manually
export { Orchestrator, SessionManager, PromptBuilder, ToolExecutor, ResponseFormatter };
export { OllamaBackend, CloudBackend };
