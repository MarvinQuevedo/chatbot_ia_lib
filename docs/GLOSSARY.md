# Glossary

Key terms and concepts used throughout the chatbot-ia-lib documentation.

---

| Term | Definition |
|:---|:---|
| **CORE Engine** | The immutable set of modules (orchestrator, session manager, prompt builder, tool executor, response formatter) that powers every chatbot deployment. Never modified per business. |
| **Configuration Layer** | The set of files (`rules.md`, `tools.json`, `prompts/`, `chatbot.config.json`, `training/`) that define all business-specific behavior. This is the only thing that changes per deployment. |
| **Smart Installer** | CLI wizard that detects system hardware, recommends an AI model, sets up the backend (Ollama or cloud), and generates starter configuration files. |
| **Orchestrator** | The main logic module in the CORE that manages the conversation loop: receives a user message, builds a prompt, sends it to the AI, processes the response (text or tool call), and returns the final answer. |
| **Session** | A single conversation between one user and the chatbot. Contains conversation history, gathered data, and metadata. Persists across messages until expiration. |
| **Tool** | A declarative description of a business API endpoint that the AI can call. Defined in `tools.json` with a name, description, parameters, and endpoint details. |
| **Function Calling** | The AI capability to decide during a conversation that it needs to call an external function/tool (e.g., check order status) instead of generating a text response. |
| **Tool Call** | An event where the AI requests execution of a specific tool with specific parameters. The CORE validates, executes, and returns the result to the AI. |
| **Prompt** | The complete text sent to the AI on each turn, assembled from: system prompt template + business rules + tool descriptions + session context + conversation history + user message. |
| **System Prompt** | The initial instructions given to the AI that define its identity, behavior, and constraints. Built from templates in `prompts/system.md` + rules from `rules.md`. |
| **Business Rules** | Natural-language descriptions of company policies, constraints, and behavior guidelines. Written in `rules.md` and injected into every AI prompt. |
| **AI Backend** | The LLM provider that generates responses. Can be local (Ollama running Llama 3) or cloud (DeepSeek API, OpenAI-compatible). |
| **Ollama** | Open-source tool for running large language models locally. Exposes a REST API that the library communicates with. Supports macOS (Metal), Linux (CUDA/ROCm), and Windows. |
| **LLM (Large Language Model)** | The AI model that understands and generates text. Examples: Llama 3, Llama 3.2, DeepSeek-V3, GPT-4o. |
| **Llama** | Meta's open-source LLM family. Llama 3 and 3.2 are the primary local models supported by this library. |
| **DeepSeek** | Cloud AI provider offering cost-effective LLMs via an OpenAI-compatible API. Used as the primary cloud backend option. |
| **Quantization** | Technique to compress LLM models by reducing numerical precision. Makes models smaller and faster at a small quality cost. Q4_K_M is the recommended default. |
| **VRAM** | Video RAM — GPU memory used to load and run AI models. More VRAM = larger/faster models. Example: 8GB VRAM can run Llama 3.2 8B quantized. |
| **Context Window** | The maximum number of tokens an AI model can process in a single prompt. Limits how much conversation history can be included. |
| **Token** | The basic unit of text for an LLM. Roughly 1 token ≈ 4 characters or ¾ of a word in English. |
| **Sliding Window** | Context management strategy that keeps only the most recent N messages. Older messages are dropped. Simple and predictable. |
| **Fine-Tuning** | The process of further training an existing AI model on custom data (JSONL conversations) to modify its behavior for a specific domain. |
| **LoRA (Low-Rank Adaptation)** | Efficient fine-tuning technique that modifies a small subset of model parameters, requiring much less GPU memory than full fine-tuning. |
| **RAG (Retrieval-Augmented Generation)** | Technique where the AI retrieves relevant documents before generating a response. "RAG-Light" in this library refers to including knowledge base files directly in the system prompt. |
| **Hallucination** | When an AI generates plausible-sounding but factually incorrect information. The validation suite tests for this. |
| **Prompt Injection** | Security attack where a user crafts input that manipulates the AI's system prompt or behavior. The library includes sanitization to mitigate this. |
| **Backend Selector** | Module that routes AI requests to the configured primary backend and falls back to the secondary if the primary fails. |
| **Response Mapping** | Configuration that controls how raw API response data is transformed into a readable format for the AI. Can be template-based or field-selection based. |
| **Hot Reload** | Ability to update configuration files and have changes take effect without restarting the service. Supported for rules, tools, and prompt templates. |
| **Escalation** | When the AI determines it cannot resolve an issue and transfers the conversation to a human agent. Triggered by configured keywords or conditions. |
| **Gathered Data** | Information collected from the user during a conversation session (name, email, order ID, etc.). Tracked by the Session Manager to avoid re-asking. |
| **Decision Matrix** | The logic used by the Smart Installer to recommend the best AI model based on detected hardware (CPU, GPU, RAM, storage). |
| **Idempotent** | A property of the installer meaning running it multiple times produces the same result — it detects existing setup and skips completed steps. |
