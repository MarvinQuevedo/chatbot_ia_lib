# Concept: Generic AI Chatbot Library (chatbot-ia-lib)

## Vision

To provide a **plug-and-play, AI-driven chatbot framework** that any business can install, configure, and deploy — without writing AI code. The library delivers a production-ready chatbot that understands the client's business rules, connects to their APIs, and interacts with end users in a natural, human-like way.

The key innovation is separating the **CORE engine** (which never changes) from the **configuration layer** (which adapts to each business). This means:
- A developer installs the library once
- Configures it with business-specific files (rules, tools, prompts, training data)
- Deploys a fully functional AI assistant — without touching the engine code

---

## Core Philosophy

### 1. Ease of Use
A **smart installer** handles the heavy lifting:
- Detects system hardware and recommends the best AI model
- Automatically sets up the local LLM runtime (Ollama) or configures cloud API keys
- Generates starter configuration files with documented examples
- Validates the environment is ready before first run

**Target**: A developer with no AI/ML experience should be able to deploy a working chatbot in under 30 minutes.

### 2. Autonomy & Intelligence
The chatbot shouldn't just respond to keywords. It should:
- **Understand context**: Maintain multi-turn conversation state so users don't repeat themselves
- **Enforce business rules**: Automatically apply policies (refund windows, shipping restrictions, escalation criteria) without hardcoded if/else logic
- **Gather information proactively**: If a user wants to track an order but hasn't provided a tracking number, the AI asks for it instead of failing
- **Execute actions**: Call real APIs to check inventory, create tickets, process returns — not just generate text
- **Handle ambiguity**: When user intent is unclear, ask clarifying questions rather than guessing

### 3. Local vs. Cloud Flexibility
Not every business can (or wants to) send data to external AI servers. The library supports:

| Mode | Provider | Ideal For |
|:---|:---|:---|
| **Local** | Ollama + Llama 3 | Businesses with privacy requirements, medium-to-high hardware |
| **Cloud** | DeepSeek API, OpenAI-compatible | Businesses with limited hardware or need for highest quality |
| **Hybrid** | Local primary, cloud fallback | Best of both worlds — privacy with reliability |

The architecture ensures that switching between providers requires **zero code changes** — only a configuration update.

### 4. Local Fine-Tuning ("Teaching" the AI)
The library includes a structured process for teaching the AI about the business:

#### Phase 1: Rules (Immediate, No Training Required)
Provide business rules in Markdown or JSON. These are injected as system prompts and the AI follows them immediately.
```markdown
# Business Rules
- Refund window: 30 days from purchase for defective items
- Shipping: Free for orders over $50 in continental US
- Brand voice: Professional but friendly, use the customer's first name
- Escalation: If customer mentions "lawyer" or "sue", escalate to human agent
```

#### Phase 2: API Knowledge (Configuration, No Training Required)
Define the tools/endpoints the AI can call. The AI learns *when* to use each tool from the descriptions and parameter schemas.
```json
{
  "name": "check_order_status",
  "description": "Check the current status and delivery date of a customer order",
  "parameters": { "order_id": "string", "email": "string" }
}
```

#### Phase 3: Fine-Tuning (Optional, For Advanced Customization)
For businesses that need the AI to handle domain-specific jargon, complex workflows, or historically difficult queries:
- Provide JSONL datasets of question/answer pairs
- Run local fine-tuning via the CLI
- Validate against a test suite to prevent hallucinations

### 5. Human-Like Interaction
The chatbot must **never** feel like a rigid menu system. Key interaction principles:
- **No numbered menus**: The AI guides the conversation naturally, not with "Press 1 for support"
- **Graceful fallback**: If the AI can't help, it explains why and offers alternatives (human agent, email, FAQ link)
- **Emotional intelligence**: Detect frustration and adjust tone (more empathetic, shorter responses, faster escalation)
- **Multilingual**: The AI responds in the language the user writes in, without needing separate configurations per language
- **Memory within session**: "I already told you my email" — the AI tracks all info provided in the conversation and never asks twice

---

## Target Use Cases

### 1. Customer Support
**Scenario**: An ecommerce store receives 200+ support tickets daily. Most are repetitive (order status, return requests, product questions).

**What the chatbot does**:
- Answers common queries instantly using business rules
- Checks order status, shipping tracking, and return eligibility via API calls
- Collects information for new support tickets and creates them automatically
- Escalates to human agents when confidence is low or the issue is complex
- Provides 24/7 coverage without staffing costs

**Example conversation**:
```
User: My order hasn't arrived and it's been 2 weeks
Bot:  I'm sorry to hear that! Can you share your order number so I can check?
User: It's #ORD-4521
Bot:  Let me check... Your order #ORD-4521 was shipped on March 3 and the tracking
      shows it's currently with the local carrier in your city. The estimated delivery
      is tomorrow, March 17. Would you like me to open a support case if it doesn't
      arrive by then?
```

### 2. Sales Assistant
**Scenario**: An online store wants to increase conversion rates by guiding users through product selection and purchase.

**What the chatbot does**:
- Recommends products based on user needs (not just keyword matching)
- Provides detailed specs, comparisons, and availability from live inventory
- Guides the user through checkout, collecting shipping details conversationally
- Generates payment links and tracks the purchase flow
- Follows up on abandoned carts (if integrated with notification system)

**Example conversation**:
```
User: I need a laptop for video editing, budget around $1500
Bot:  For video editing at that budget, I'd recommend our MediaPro 15 ($1,399) —
      it has an RTX 4060, 32GB RAM, and a 15" 120Hz display. Would you like to
      see the full specs or compare it with other options?
```

### 3. Issue Tracking & Field Service
**Scenario**: A telecom company needs customers to report service outages and track repair progress.

**What the chatbot does**:
- Collects issue details (location, type of service, symptoms) conversationally
- Checks against known outages in the area via API
- Creates new incident tickets with structured data
- Provides ETAs and status updates on existing tickets
- Sends proactive notifications when issues are resolved

### 4. Internal Knowledge Base
**Scenario**: A company's HR or IT department gets repetitive questions from employees.

**What the chatbot does**:
- Answers policy questions (vacation policy, expense reporting, equipment requests)
- Points to the right internal documentation
- Helps fill out forms by collecting information conversationally
- Routes complex requests to the appropriate department

### 5. Appointment Scheduling
**Scenario**: A healthcare provider, salon, or professional service needs to manage bookings.

**What the chatbot does**:
- Shows available time slots from the scheduling API
- Collects patient/client information
- Books appointments and sends confirmation
- Handles rescheduling and cancellations
- Sends reminders (if integrated with notification system)

---

## What This Library Is NOT

To avoid scope creep and keep the project focused:

- **Not a general-purpose AI framework**: This is specifically for deploying business chatbots, not for building arbitrary AI applications
- **Not a no-code platform**: A developer is needed for initial setup and API integration configuration. End users interact only with the chat interface
- **Not a training platform**: While it supports fine-tuning, it's not a tool for training new AI models from scratch. It uses existing foundation models (Llama, DeepSeek)
- **Not a UI framework**: The library ships with a reference chat UI, but it's designed to be integrated into existing frontends via API/SDK

---

## Origins

This library is the **evolution** of the [ecommerce-chatbot](../ecommerce-chatbot) proof-of-concept project. That project demonstrated the core ideas (AI + function calling + business logic) in a specific ecommerce context. This library (`chatbot-ia-lib`) generalizes those patterns into a reusable, configurable framework that works for any industry.
