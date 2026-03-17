# Chatbot-IA-Lib

> A generic, plug-and-play AI chatbot library designed to be installed, configured, and deployed with minimal effort — powered by local LLMs or cloud APIs.

---

## 🎯 What Is This?

**Chatbot-IA-Lib** is a framework for deploying intelligent AI chatbots that understand your business. Instead of building a chatbot from scratch, you install the library, configure your business rules through simple files, and the AI learns how to interact with your users and services.

### The Key Idea: CORE + Configuration

```
┌─────────────────────────────────────────────────────┐
│                  Your Business                       │
│                                                     │
│  ┌──────────────┐   ┌─────────────────────────────┐ │
│  │  CONFIG FILES │   │     CORE ENGINE             │ │
│  │              │──▶│  (Never Modified)            │ │
│  │ • rules.md   │   │                             │ │
│  │ • tools.json │   │  • Orchestrator             │ │
│  │ • prompts/   │   │  • AI Backend Selector      │ │
│  │ • api.json   │   │  • Integration Layer        │ │
│  │ • training/  │   │  • Prompt Manager           │ │
│  └──────────────┘   └─────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

- **CORE**: The engine that runs the chatbot. It handles conversation flow, AI communication, tool execution, and integrations. **You never modify the CORE.**
- **Configuration**: Markdown, JSON, and JSONL files that teach the AI your business rules, define API tools, customize prompts, and provide training data. **This is the only thing you change per project.**

---

## 📖 Documentation

All detailed documentation is in the [`docs/`](docs/) directory:

| Document | Description |
|:---|:---|
| [CONCEPT.md](docs/CONCEPT.md) | Vision, philosophy, and target use cases |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, component diagrams, and data flow |
| [REQUIREMENTS.md](docs/REQUIREMENTS.md) | Functional and non-functional requirements |
| [INSTALLER_SPEC.md](docs/INSTALLER_SPEC.md) | Smart installer specification and platform support |
| [API_INTEGRATION_GUIDE.md](docs/API_INTEGRATION_GUIDE.md) | How to connect the chatbot to your business APIs |
| [TRAINING_AND_FINETUNING.md](docs/TRAINING_AND_FINETUNING.md) | Teaching the AI your business rules and data |
| [CONFIGURATION_GUIDE.md](docs/CONFIGURATION_GUIDE.md) | Complete guide to all configuration files |
| [CORE_VS_CONFIG.md](docs/CORE_VS_CONFIG.md) | Philosophy of CORE/Configuration separation |
| [PROJECT_ANALYSIS.md](docs/PROJECT_ANALYSIS.md) | Technical analysis of project structure |
| [GLOSSARY.md](docs/GLOSSARY.md) | Key terms and definitions |

---

## 🚀 Quick Start (Planned)

```bash
# 1. Install the library
npx chatbot-ia-lib init

# 2. The smart installer will:
#    - Detect your hardware (CPU, GPU, RAM)
#    - Recommend the best AI model
#    - Set up Ollama (local) or configure cloud API keys
#    - Generate config files

# 3. Configure your business
#    Edit the generated config files in ./config/

# 4. Start the chatbot
npx chatbot-ia-lib start
```

---

## 🧩 How Does the "Teaching" Process Work?

The chatbot doesn't come pre-trained for your business. Instead, you go through a structured teaching process:

1. **Define Business Rules** → Write rules in Markdown or JSON that describe your business policies (refund policy, shipping times, FAQs, brand voice)
2. **Define API Tools** → Describe the endpoints the AI can call (check order status, list products, create tickets) using a JSON schema
3. **Provide Training Data** → Optionally supply JSONL question/answer pairs for fine-tuning
4. **Validate** → Run the built-in test suite to verify the AI understands your rules correctly
5. **Iterate** → Use the feedback dashboard to rate responses and improve over time

---

## 🏗️ Project Status

This project is currently in the **documentation and design phase**. The existing [`ecommerce-chatbot`](../ecommerce-chatbot) serves as the proof-of-concept implementation. This library (`chatbot-ia-lib`) extracts and generalizes that approach into a reusable, configurable framework.

---

## 📜 License

Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).

Free to use for personal and educational purposes. Commercial use is not permitted.
