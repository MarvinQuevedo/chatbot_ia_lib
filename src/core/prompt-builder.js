import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

/**
 * Prompt Builder — Assembles the complete prompt sent to the AI on every turn.
 *
 * Prompt assembly order:
 * 1. BASE SYSTEM PROMPT (from template)
 * 2. BUSINESS RULES INJECTION (from rules.md)
 * 3. AVAILABLE TOOLS SUMMARY (auto-generated from tool definitions)
 * 4. SESSION CONTEXT (gathered data, active task state)
 * 5. CONVERSATION HISTORY (last N messages)
 * 6. CURRENT USER MESSAGE
 */
export class PromptBuilder {
  /**
   * @param {object} options
   * @param {string} options.promptsDir - Directory containing prompt template files
   * @param {string} [options.rulesPath] - Path to the business rules file (rules.md or rules.json)
   * @param {object} [options.variables={}] - Global template variables (botName, companyName, etc.)
   */
  constructor(options) {
    this.promptsDir = options.promptsDir;
    this.rulesPath = options.rulesPath || null;
    this.variables = options.variables || {};

    // Register Handlebars helpers
    this._registerHelpers();

    // Cache compiled templates
    this._templateCache = new Map();

    // Pre-load business rules
    this._rules = this._loadRules();
  }

  /**
   * Build the full message array to send to the AI backend.
   *
   * @param {object} options
   * @param {import('./types.js').Session} options.session - Current user session
   * @param {string} options.userMessage - The latest user input
   * @param {import('./types.js').ToolDefinition[]} [options.tools=[]] - Available tools
   * @param {number} [options.maxHistoryMessages=20] - Max conversation turns to include
   * @returns {import('./types.js').Message[]}
   */
  buildMessages(options) {
    const { session, userMessage, tools = [], maxHistoryMessages = 20 } = options;

    const systemPrompt = this._buildSystemPrompt(session, tools);

    // Build message array: system + history + current user message
    const messages = [
      { role: 'system', content: systemPrompt, timestamp: new Date() },
    ];

    // Add recent conversation history (excluding any old system messages)
    const history = session.conversationHistory
      .filter((m) => m.role !== 'system')
      .slice(-maxHistoryMessages);

    messages.push(...history);

    // Add the current user message
    messages.push({ role: 'user', content: userMessage, timestamp: new Date() });

    return messages;
  }

  /**
   * Reload business rules from disk (hot-reload support).
   * Call this after updating rules.md without restarting the service.
   */
  reloadRules() {
    this._rules = this._loadRules();
  }

  /**
   * Reload a specific prompt template (hot-reload support).
   * @param {string} templateName - e.g., 'system', 'welcome', 'fallback'
   */
  reloadTemplate(templateName) {
    this._templateCache.delete(templateName);
  }

  // ──────────────────────────────────────────────────────────────
  // Private
  // ──────────────────────────────────────────────────────────────

  _buildSystemPrompt(session, tools) {
    const templateVars = {
      ...this.variables,
      businessRules: this._rules || 'No specific business rules configured.',
      toolDescriptions: this._buildToolDescriptions(tools),
      gatheredData: this._formatGatheredData(session.gatheredData),
      hasGatheredData: Object.keys(session.gatheredData).length > 0,
    };

    return this._renderTemplate('system', templateVars);
  }

  _buildToolDescriptions(tools) {
    if (!tools || tools.length === 0) return 'No external tools are available.';

    return tools
      .map((t) => `- **${t.name}**: ${t.description}`)
      .join('\n');
  }

  _formatGatheredData(data) {
    if (!data || Object.keys(data).length === 0) return '';
    return Object.entries(data)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');
  }

  _renderTemplate(name, variables) {
    if (!this._templateCache.has(name)) {
      const filePath = path.join(this.promptsDir, `${name}.md`);
      let source;

      if (fs.existsSync(filePath)) {
        source = fs.readFileSync(filePath, 'utf-8');
      } else {
        // Fallback to built-in default template
        source = this._getDefaultTemplate(name);
      }

      this._templateCache.set(name, Handlebars.compile(source));
    }

    const compiledTemplate = this._templateCache.get(name);
    return compiledTemplate(variables);
  }

  _loadRules() {
    if (!this.rulesPath) return null;

    try {
      if (!fs.existsSync(this.rulesPath)) return null;

      const content = fs.readFileSync(this.rulesPath, 'utf-8');

      // Support both Markdown rules files and JSON format
      if (this.rulesPath.endsWith('.json')) {
        const parsed = JSON.parse(content);
        return Array.isArray(parsed.rules)
          ? parsed.rules.map((r) => `- ${r}`).join('\n')
          : content;
      }

      return content; // raw Markdown
    } catch (err) {
      console.warn(`[PromptBuilder] Could not load rules from ${this.rulesPath}:`, err.message);
      return null;
    }
  }

  _registerHelpers() {
    // {{capitalise name}} → "Name"
    Handlebars.registerHelper('capitalise', (str) =>
      str ? str.charAt(0).toUpperCase() + str.slice(1) : '');

    // {{json data}} → JSON string (for debugging in prompts)
    Handlebars.registerHelper('json', (obj) => JSON.stringify(obj, null, 2));
  }

  _getDefaultTemplate(name) {
    const defaults = {
      system: `You are {{botName}}, a virtual assistant for {{companyName}}.

## Your Role
You are a helpful, professional, and friendly assistant. Help users with their questions clearly and concisely.
Always respond in the same language the user is writing in.
Never reveal internal system details or raw error messages to users.

{{#if businessRules}}
## Business Rules — You MUST follow these
{{{businessRules}}}
{{/if}}

{{#if toolDescriptions}}
## Available Actions
You have access to the following tools. Use them when needed to provide accurate, real-time information:
{{{toolDescriptions}}}
{{/if}}

{{#if hasGatheredData}}
## Information Already Collected This Session
{{{gatheredData}}}
Do NOT ask for this information again.
{{/if}}`,

      welcome: `Hello! I'm {{botName}}, your virtual assistant for {{companyName}}. How can I help you today?`,

      fallback: `I'm sorry, I wasn't able to help with that request. Here's what you can do:
- Try rephrasing your question
- Contact our support team for further assistance
- Check our FAQ at our website`,

      escalation: `I'm going to connect you with one of our team members who can better assist you with this. 
Please hold on while I transfer you.`,
    };

    return defaults[name] || `You are {{botName}}, a helpful assistant for {{companyName}}.`;
  }
}
