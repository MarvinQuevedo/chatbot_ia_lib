# Configuration Guide

This document describes every configuration file in the library — its purpose, format, location, and all available options.

---

## Configuration Directory Structure

When you run `chatbot-ia-lib init`, the following directory is generated:

```
config/
├── chatbot.config.json     # Main configuration (backend, server, behavior)
├── rules.md                # Business rules in natural language
├── prompts/
│   ├── system.md           # Main system prompt template
│   ├── welcome.md          # Opening message for new sessions
│   ├── escalation.md       # Prompt additions when escalating
│   └── fallback.md         # When the AI can't help
├── tools.json              # API tool definitions
├── auth.json               # API authentication configuration
├── knowledge/              # Additional knowledge base files
│   └── (your markdown docs)
└── training/
    ├── faq.jsonl            # Training data for fine-tuning
    └── corrections.jsonl    # Corrected responses from feedback
```

> **Key Rule**: These are the ONLY files you need to edit to customize the chatbot. The CORE engine code is never modified.

---

## 1. `chatbot.config.json` — Main Configuration

The central config file that controls all aspects of the library.

```json
{
  "version": "1.0",

  "identity": {
    "botName": "TechBot",
    "companyName": "TechStore",
    "language": "auto",
    "welcomeEnabled": true
  },

  "ai": {
    "primary": {
      "type": "ollama",
      "model": "llama3.2:8b",
      "baseUrl": "http://localhost:11434",
      "contextWindowTokens": 4096,
      "temperature": 0.7,
      "topP": 0.9
    },
    "fallback": {
      "type": "cloud",
      "provider": "deepseek",
      "model": "deepseek-chat",
      "apiKey": "${DEEPSEEK_API_KEY}",
      "baseUrl": "https://api.deepseek.com/v1"
    },
    "fallbackEnabled": true
  },

  "orchestrator": {
    "maxToolCallsPerTurn": 5,
    "contextStrategy": "sliding_window",
    "maxHistoryMessages": 50,
    "timeoutMs": 30000,
    "retryOnError": true,
    "maxRetries": 2
  },

  "session": {
    "storage": "sqlite",
    "dbPath": "./data/sessions.db",
    "expirationMinutes": 60,
    "maxConcurrentSessions": 100
  },

  "server": {
    "port": 3001,
    "host": "0.0.0.0",
    "corsOrigins": ["http://localhost:5173"],
    "rateLimitPerMinute": 20
  },

  "security": {
    "sanitizePromptInjection": true,
    "maxMessageLength": 2000,
    "encryptSessionsAtRest": false
  },

  "observability": {
    "logLevel": "info",
    "logConversations": true,
    "logToolCalls": true,
    "dashboardEnabled": true,
    "dashboardPort": 3002
  },

  "ui": {
    "theme": {
      "primaryColor": "#6366f1",
      "backgroundColor": "#0f172a",
      "textColor": "#f8fafc",
      "fontFamily": "Inter, sans-serif"
    },
    "avatar": "./assets/bot-avatar.png",
    "widgetPosition": "bottom-right"
  }
}
```

### Field Reference

| Section | Field | Type | Default | Description |
|:---|:---|:---|:---|:---|
| `identity` | `botName` | string | "Assistant" | Name the AI uses for itself |
| `identity` | `companyName` | string | - | Business name injected into prompts |
| `identity` | `language` | string | "auto" | "auto" = match user's language, or "es", "en", etc. |
| `ai.primary` | `type` | string | - | "ollama" or "cloud" |
| `ai.primary` | `model` | string | - | Model identifier |
| `ai.primary` | `temperature` | number | 0.7 | Creativity (0 = deterministic, 1 = creative) |
| `ai.primary` | `topP` | number | 0.9 | Nucleus sampling threshold |
| `ai.primary` | `contextWindowTokens` | number | 4096 | Maximum tokens in a single prompt |
| `orchestrator` | `maxToolCallsPerTurn` | number | 5 | Prevent infinite tool-call loops |
| `orchestrator` | `contextStrategy` | string | "sliding_window" | How to manage long conversations |
| `orchestrator` | `timeoutMs` | number | 30000 | Max wait for AI response |
| `session` | `storage` | string | "sqlite" | "memory", "sqlite", or "redis" |
| `session` | `expirationMinutes` | number | 60 | Session auto-expiry after inactivity |
| `server` | `port` | number | 3001 | HTTP server port |
| `server` | `rateLimitPerMinute` | number | 20 | Max messages per session per minute |
| `security` | `sanitizePromptInjection` | boolean | true | Filter known prompt injection patterns |
| `security` | `maxMessageLength` | number | 2000 | Reject messages longer than this |

---

## 2. `rules.md` — Business Rules

Natural-language rules the AI must follow. These are injected into every prompt.

> See [TRAINING_AND_FINETUNING.md](TRAINING_AND_FINETUNING.md#phase-1-business-rules-immediate-effect) for detailed examples and formatting guidelines.

**Key points:**
- Use Markdown headers to organize rules by category
- Be specific and explicit — don't assume the AI will infer
- Include both what to do AND what NOT to do
- Changes take effect immediately on restart (no retraining needed)
- Hot-reload support in development mode

---

## 3. `prompts/` — Prompt Templates

Custom prompt templates used by the Prompt Builder.

### `system.md` — Main System Prompt

```markdown
You are {{botName}}, a virtual assistant for {{companyName}}.

## Your Role
{{roleDescription}}

## Rules You MUST Follow
{{businessRules}}

## Available Actions
{{toolDescriptions}}

## Current Session Info
{{#if gatheredData}}
Information already collected:
{{gatheredData}}
{{/if}}

## Important
- Always respond in the same language the user writes in
- If you don't know something, say so — don't make things up
- If you need to perform an action, use the appropriate tool
```

### `welcome.md` — First Message

```markdown
{{#if returningUser}}
¡Hola de nuevo, {{userName}}! ¿En qué puedo ayudarte hoy?
{{else}}
👋 ¡Hola! Soy {{botName}}, el asistente virtual de {{companyName}}. 

Puedo ayudarte con:
- 📦 Estado de pedidos y envíos
- 🛒 Encontrar productos
- 🔄 Devoluciones y reembolsos
- ❓ Preguntas frecuentes

¿En qué te puedo ayudar?
{{/if}}
```

### `escalation.md` — Escalation Message

```markdown
Entiendo tu frustración y quiero asegurarme de que recibas la mejor ayuda posible. 

Voy a transferirte con un agente humano que podrá asistirte directamente. {{#if ticketId}}Tu número de caso es **{{ticketId}}**.{{/if}}

Un agente se comunicará contigo a la brevedad. ¡Gracias por tu paciencia!
```

### `fallback.md` — Can't Help

```markdown
Lo siento, no cuento con la información necesaria para ayudarte con eso en este momento.

Te sugiero:
- 📧 Escribir a soporte@{{companyDomain}}
- 📞 Llamar a nuestra línea de atención: {{supportPhone}}
- 💬 Intentar reformular tu pregunta

¿Hay algo más en lo que pueda ayudarte?
```

### Template Variables

| Variable | Source | Description |
|:---|:---|:---|
| `{{botName}}` | `chatbot.config.json` | Bot's display name |
| `{{companyName}}` | `chatbot.config.json` | Business name |
| `{{businessRules}}` | `rules.md` | Full rules content |
| `{{toolDescriptions}}` | `tools.json` (auto) | Auto-generated from tool definitions |
| `{{gatheredData}}` | Session | Data collected during conversation |
| `{{userName}}` | Session | User's name if previously provided |

---

## 4. `tools.json` — API Tool Definitions

> See [API_INTEGRATION_GUIDE.md](API_INTEGRATION_GUIDE.md) for complete documentation with examples.

---

## 5. `auth.json` — API Authentication

> See [API_INTEGRATION_GUIDE.md](API_INTEGRATION_GUIDE.md#3-authentication-authjson) for all auth types.

---

## 6. `knowledge/` — Knowledge Base

Additional markdown files that are included in the AI's context for domain-specific knowledge.

```
config/knowledge/
├── shipping-policy.md
├── refund-policy.md  
├── product-catalog.md
├── troubleshooting-guide.md
└── faq.md
```

**How it works:**
- All `.md` files in `knowledge/` are read and injected into the system prompt
- For small knowledge bases (< 10,000 tokens total): all files are included in every prompt
- For larger knowledge bases: relevant sections are selected based on the user's message (RAG-Light approach)
- Files can be added/removed without restarting — hot-reload supported

---

## 7. `training/` — Training Data

> See [TRAINING_AND_FINETUNING.md](TRAINING_AND_FINETUNING.md#phase-3-fine-tuning-advanced) for dataset format and training pipeline.

---

## Environment Variables

Values in config files that start with `${...}` are read from environment variables.

Create a `.env` file in the project root:

```env
# AI Backend
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxx
OLLAMA_BASE_URL=http://localhost:11434

# Business API
API_BASE_URL=https://api.your-business.com/v1
BUSINESS_API_KEY=your-key-here
OAUTH_CLIENT_ID=chatbot-client
OAUTH_CLIENT_SECRET=your-secret

# Security
SESSION_SECRET=random-32-char-string
```

> ⚠️ `.env` is automatically added to `.gitignore` by the installer. Never commit secrets to version control.

---

## Config Validation

On startup, the library validates all config files against JSON Schemas:

```bash
# Manual validation
chatbot-ia-lib validate --config

# Output
✅ chatbot.config.json — Valid
✅ tools.json — Valid (4 tools defined)
✅ auth.json — Valid (JWT with auto-refresh)
✅ rules.md — Loaded (342 tokens)
✅ prompts/system.md — Valid template
✅ prompts/welcome.md — Valid template
⚠️  prompts/escalation.md — Missing (using default)
✅ knowledge/ — 3 files loaded (1,240 tokens)
```

Invalid config results in a clear error message telling you exactly what's wrong and how to fix it.
