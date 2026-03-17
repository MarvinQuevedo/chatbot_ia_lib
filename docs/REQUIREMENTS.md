# Functional & Non-Functional Requirements

## Functional Requirements (FR)

### 1. Smart Installer (CLI)

- **FR1.1 — Hardware Detection**: The installer must detect CPU features (AVX/AVX2 support), GPU type and VRAM (CUDA/Metal/ROCm), total RAM, and available disk space. Must work on macOS, Linux, and Windows.

- **FR1.2 — Model Recommendation**: Based on hardware profile, the installer must recommend the optimal AI model using the decision matrix:

  | Hardware Profile | Recommended Model | Quantization | Engine |
  |:---|:---|:---|:---|
  | < 8GB RAM, No GPU | Llama-3.2-3B | Q4_K_M | Ollama |
  | 8-16GB RAM, No GPU | Llama-3.2-8B | Q4_K_M | Ollama |
  | 16GB+ RAM, 8GB+ VRAM | Llama-3.2-8B | Full (FP16) | Ollama |
  | 32GB+ RAM, 16GB+ VRAM | Llama-3-70B | Q4_K_M | Ollama |
  | Minimal resources / Server-only | DeepSeek-V3 / GPT-4o | N/A | Cloud API |

- **FR1.3 — Automated Backend Setup**:
  - **Local**: Download and install Ollama, pull the recommended model, verify it responds correctly
  - **Cloud**: Prompt for API key, validate with a test request, store securely in environment config

- **FR1.4 — Configuration Generation**: Generate starter config files (`chatbot.config.json`, `rules.md`, `tools.json`, prompt templates) with documented examples specific to the chosen template (ecommerce, support, general).

- **FR1.5 — Environment Validation**: Pre-flight check that verifies:
  - Required runtime dependencies are installed (Node.js >= 18)
  - Sufficient disk space for model files (minimum 5GB free for local)
  - Network connectivity for cloud backends or model downloads
  - AI backend responds correctly to a test prompt
  - Generated config files are valid

- **FR1.6 — Doctor Command**: `chatbot-ia-lib doctor` command that re-runs all validation checks and diagnoses common issues (Ollama not running, model not found, API key expired, disk full).

---

### 2. Core Chatbot Logic

- **FR2.1 — Multi-Backend Support**: Support both local (Ollama) and cloud (DeepSeek, OpenAI-compatible) AI backends through a unified interface. Adding a new backend must only require implementing the backend interface — no CORE changes.

- **FR2.2 — Backend Fallback**: If the primary backend fails or is unavailable, automatically fall back to the configured secondary backend. Log the failover event. Must be configurable (enable/disable fallback, maximum retry count, timeout).

- **FR2.3 — Business Rules via Configuration**: Business rules (policies, restrictions, brand voice, escalation triggers) must be defined entirely in configuration files (Markdown or JSON). The CORE reads and injects these into prompts without hardcoded logic.

- **FR2.4 — Multi-Turn Conversation**: Maintain conversation context across multiple messages within a session. The AI must:
  - Remember all information provided by the user in the session
  - Never re-ask for data already given
  - Reference earlier parts of the conversation naturally
  - Support at least 50 turns per session

- **FR2.5 — Proactive Information Gathering**: When the AI identifies an intent that requires specific data (e.g., checking an order requires order ID and email), it must:
  - Check if the data has already been provided in the session
  - Ask for missing pieces one at a time in a natural way
  - Confirm collected data before executing actions
  - Handle corrections ("Actually my email is different")

- **FR2.6 — Prompt Template System**: Support customizable prompt templates with:
  - Variable injection (business name, bot name, etc.)
  - Conditional blocks (`{{#if}}`)
  - Iterable blocks (`{{#each}}`)
  - Multiple templates per context (welcome, support, sales, escalation, fallback)

- **FR2.7 — Conversation Context Management**: Implement context window management strategies to handle long conversations:
  - **Sliding window**: Keep only the last N messages
  - **Token budget**: Keep as many messages as fit within a token limit
  - **Summarization** (advanced): Summarize older messages to compress history
  - Configurable per deployment

- **FR2.8 — Language Auto-Detection**: The chatbot must respond in the same language the user writes in. No separate configuration needed per language. The system prompt may be in English or the business's primary language — the AI adapts the response language based on user input.

---

### 3. API & Business Integration (Function Calling / Tools)

- **FR3.1 — Declarative Tool Definitions**: Business API endpoints are defined as "tools" in `tools.json`. Each tool specifies:
  - `name`: Unique identifier (e.g., `check_order_status`)
  - `description`: Human-readable purpose (used by the AI to decide when to call it)
  - `parameters`: JSON Schema for required and optional parameters
  - `endpoint`: HTTP method + URL (`GET /api/orders/:orderId`)
  - `requestMapping`: How to map AI parameters to API request format
  - `responseMapping`: How to extract the relevant fields from the API response for the AI

  ```json
  {
    "name": "check_order_status",
    "description": "Check the shipping status and estimated delivery date for a customer order",
    "parameters": {
      "type": "object",
      "properties": {
        "order_id": { "type": "string", "description": "The order number, e.g., ORD-1234" },
        "customer_email": { "type": "string", "format": "email", "description": "Customer's email for verification" }
      },
      "required": ["order_id"]
    },
    "endpoint": {
      "method": "GET",
      "url": "{{apiBaseUrl}}/orders/{{order_id}}",
      "headers": { "X-Customer-Email": "{{customer_email}}" }
    },
    "responseMapping": {
      "template": "Order {{order_id}}: Status is {{status}}, shipped on {{ship_date}}, estimated delivery {{delivery_date}}."
    }
  }
  ```

- **FR3.2 — Authentication Support**: The integration layer must support:
  - **API Key**: Static key in headers (`Authorization: Bearer <key>` or custom header)
  - **JWT with Refresh**: Automatic token refresh using a token endpoint with client credentials
  - **OAuth 2.0**: Client credentials grant flow
  - **Custom Headers**: Arbitrary headers for proprietary auth schemes
  - All auth credentials stored in `auth.json` or environment variables (never in tool definitions)

- **FR3.3 — Parameter Validation**: Before executing an API call, validate all parameters against the tool's JSON Schema. If validation fails, return a descriptive error to the AI so it can ask the user for corrected data.

- **FR3.4 — Error Handling**: Tool execution must handle:
  - HTTP errors (4xx, 5xx) with meaningful messages for the AI
  - Timeouts (configurable, default 10s)
  - Network failures with retry logic (configurable max retries, backoff)
  - Malformed responses (missing expected fields)
  - The AI must never see raw stack traces — only sanitized error messages

- **FR3.5 — Rate Limiting**: Configurable rate limits per tool to protect business APIs:
  ```json
  {
    "rateLimiting": {
      "check_order_status": { "maxPerMinute": 30 },
      "create_support_ticket": { "maxPerMinute": 10 }
    }
  }
  ```

- **FR3.6 — Tool Call Chain Limit**: Maximum number of sequential tool calls per user turn must be configurable (default: 5). This prevents infinite loops where the AI continuously calls tools without responding.

---

### 4. Training, Fine-Tuning & Knowledge Base

- **FR4.1 — Business Rules Upload**: Provide a CLI command or API endpoint to upload/update business rules files. Changes take effect immediately (hot-reload) without restarting the service.

- **FR4.2 — FAQ/Knowledge Base via RAG-Light**: Support a `knowledge/` directory with markdown files that the chatbot can reference:
  ```
  config/knowledge/
  ├── shipping-policy.md
  ├── refund-policy.md
  ├── product-catalog.md
  └── troubleshooting-guide.md
  ```
  These are included in the system prompt (RAG-Light approach) or, for large knowledge bases, indexed for retrieval (future RAG implementation).

- **FR4.3 — Local Fine-Tuning Pipeline**: CLI command to run fine-tuning:
  1. Accept JSONL dataset with conversational examples
  2. Validate dataset format and quality (balanced, no duplicates)
  3. Execute fine-tuning using Ollama-compatible training (or Unsloth for advanced users)
  4. Run validation suite against the new model
  5. Optionally roll back if validation fails

  ```bash
  chatbot-ia-lib train --dataset ./config/training/faq.jsonl --base-model llama3.2:8b
  ```

- **FR4.4 — Training Data Formats**: Support these dataset formats:
  ```jsonl
  {"messages": [{"role": "user", "content": "What's your refund policy?"}, {"role": "assistant", "content": "We offer full refunds within 30 days of purchase for defective items. For non-defective items, we offer store credit within 14 days."}]}
  {"messages": [{"role": "user", "content": "Do you ship internationally?"}, {"role": "assistant", "content": "Yes! We ship to over 50 countries. International shipping starts at $15 and takes 7-14 business days."}]}
  ```

- **FR4.5 — Feedback Loop**: Admin interface (or API) to:
  - View conversation history
  - Mark AI responses as correct/incorrect
  - Provide corrected responses that are saved to `corrections.jsonl`
  - Corrections feed into the next fine-tuning cycle

- **FR4.6 — Hallucination Detection**: During validation, the test suite must:
  - Run predefined test queries against the model
  - Compare responses against expected answers
  - Flag potential hallucinations (invented data, contradicting business rules)
  - Generate a validation report with pass/fail status

---

### 5. User Interface (Reference Implementation)

- **FR5.1 — Embeddable Chat Widget**: Provide a JavaScript chat widget that can be embedded in any website with a single script tag:
  ```html
  <script src="https://your-server.com/chatbot-widget.js" 
          data-api-url="https://your-server.com/api"
          data-theme="dark">
  </script>
  ```

- **FR5.2 — Standalone Chat Page**: Ship a full-page chat interface for standalone deployments (reference UI in React + Vite, as in the ecommerce-chatbot PoC).

- **FR5.3 — Customizable Appearance**: All visual elements must be brandable via configuration:
  - Colors (primary, secondary, background, text)
  - Logo and avatar
  - Welcome message
  - Font family

- **FR5.4 — Rich Message Types**: Support rendering:
  - Plain text with markdown formatting
  - Product cards (image + title + price + action button)
  - Quick reply buttons
  - Links and call-to-action buttons
  - Image attachments

---

## Non-Functional Requirements (NFR)

### Security (NFR1)

- **NFR1.1**: All business API communication must use HTTPS/TLS
- **NFR1.2**: API keys and secrets must never be stored in code or config files tracked by Git. Use environment variables or encrypted secrets files
- **NFR1.3**: Local model execution must never send business data to external servers (unless explicitly using a cloud backend)
- **NFR1.4**: Input sanitization: All user input must be sanitized before inclusion in prompts to prevent prompt injection attacks
- **NFR1.5**: Tool parameters generated by AI must be validated against schemas before execution to prevent injection via malformed parameters
- **NFR1.6**: Rate limiting on the chat API to prevent abuse (configurable, default: 20 messages/minute/session)
- **NFR1.7**: Session data must be encrypted at rest when using persistent storage

### Performance (NFR2)

- **NFR2.1**: Time to first token (TTFT) for local models must be under 2 seconds on recommended hardware
- **NFR2.2**: Complete response generation should be under 10 seconds for typical queries (1-2 sentences)
- **NFR2.3**: Tool execution (API call + response) should be under 5 seconds
- **NFR2.4**: The library itself must add less than 100ms of overhead on top of the AI backend and tool execution time
- **NFR2.5**: Memory usage of the CORE engine (excluding the AI model) must stay under 200MB

### Scalability (NFR3)

- **NFR3.1**: Support at least 10 concurrent user sessions on a single server
- **NFR3.2**: Session storage must support horizontal scaling (Redis backend for multi-server)
- **NFR3.3**: Conversation history must not grow unbounded — context window strategies must keep memory stable
- **NFR3.4**: The library must support deployment behind a load balancer with sticky sessions or shared session store

### Customization (NFR4)

- **NFR4.1**: All business-specific behavior must be configurable without modifying CORE code
- **NFR4.2**: UI/UX must be fully brandable (colors, logo, welcome message, language)
- **NFR4.3**: Adding a new tool/API integration must require only a JSON file update — no code changes
- **NFR4.4**: Prompt templates must support full customization including conditional logic

### Reliability (NFR5)

- **NFR5.1**: The system must gracefully handle AI backend failures (timeout, error, unavailability) with user-friendly messages
- **NFR5.2**: Failed tool calls must not crash the conversation — the AI should inform the user and offer alternatives
- **NFR5.3**: The installer must be idempotent — running it again should detect existing setup and skip completed steps
- **NFR5.4**: All errors must be logged with sufficient context for debugging

### Maintainability (NFR6)

- **NFR6.1**: CORE code must have at least 80% unit test coverage
- **NFR6.2**: All public APIs must be documented with JSDoc
- **NFR6.3**: Configuration files must be validated against JSON Schema on startup with clear error messages for invalid config
- **NFR6.4**: Semantic versioning: CORE updates maintain backward compatibility with existing config files

### Portability (NFR7)

- **NFR7.1**: Must run on macOS (Apple Silicon + Intel), Linux (x86_64 + ARM64), and Windows (x86_64)
- **NFR7.2**: Docker image available for containerized deployment
- **NFR7.3**: No system-level dependencies beyond Node.js (Ollama is managed by the installer)
