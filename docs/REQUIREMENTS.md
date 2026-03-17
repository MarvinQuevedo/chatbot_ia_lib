# Functional & Non-Functional Requirements

## Functional Requirements (FR)

### 1. Intelligent Installer
-   **FR1.1**: Detect system hardware (CPU, RAM, GPU/NPU) and recommend the best model (e.g., Llama 3B for low resources, 70B for high resources).
-   **FR1.2**: Automate the setup of Ollama or configuration of cloud API keys (DeepSeek).
-   **FR1.3**: Validate environment readiness (dependencies, disk space).

### 2. Core Chatbot Logic
-   **FR2.1**: Support for multiple AI backends (Ollama, DeepSeek).
-   **FR2.2**: Implementation of business rules through a structured prompt system or fine-tuning.
-   **FR2.3**: Human-like conversational flow: handling multi-turn dialogues and context retention.
-   **FR2.4**: Information gathering: The AI should proactively ask for missing data points from the user.

### 3. API & Business Integration
-   **FR3.1**: Secure connection to external business APIs (using JWT or API Keys).
-   **FR3.2**: Execute actions based on conversation flow (e.g., `POST /orders`, `GET /inventory`).
-   **FR3.3**: Flexible data mapping between AI output and API schemas.

### 4. Training and Context
-   **FR4.1**: Local interface for uploading business rules/documentation for RAG or fine-tuning.
-   **FR4.2**: Dashboard to monitor conversation history and "correct" AI behavior.

## Non-Functional Requirements (NFR)

-   **NFR1 (Security)**: All business API communication must be encrypted. Local model execution must not leak sensitive data to external servers.
-   **NFR2 (Performance)**: Response time for local models should be under 2 seconds for initial token generation on recommended hardware.
-   **NFR3 (Scalability)**: The library should handle concurrent user sessions effectively when deployed in a server environment.
-   **NFR4 (Customization)**: UI/UX must be easily brandable.
