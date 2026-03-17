# Guide: Training and Fine-Tuning

To make the chatbot truly reflect your business, you need to provide specific rules and data.

## 1. Providing Business Rules (RAG Light)
For most cases, a simple "Rules" file is enough. This file is converted into a System Prompt.
-   **Format**: Markdown or JSON.
-   **Content**: Refund policy, shipping times, brand voice (e.g., "Always be formal"), and common FAQs.

## 2. Training on Localhost
If common rules aren't enough, the library supports local fine-tuning using Ollama/Unsloth-compatible formats.

### Process:
1.  **Dataset Preparation**: Provide a JSONL file with `question/answer` pairs.
2.  **Baseline Selection**: Choose a model (e.g., Llama 3B).
3.  **Execution**: The Installer/CLI runs the training loop on your GPU.
4.  **Validation**: A test suite runs common queries against the new model to check for "hallucinations".

## 3. Handling API Metadata
Instead of training the AI on dynamic data (like stock levels), train it on **how to use the API**.
-   Provide schemas and examples of correct API usage.
-   The AI should learn when to stop and "call" an external service instead of guessing a value.

## 4. Iterative Improvement
-   **Feedback Loop**: Interactive interface to rate AI responses.
-   **Log Analysis**: Identify queries where the AI couldn't help and add them to the next training cycle.
