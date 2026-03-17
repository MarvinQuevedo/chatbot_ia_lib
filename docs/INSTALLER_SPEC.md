# Specification: Intelligent Installer

The Installer is the entry point of the library, ensuring that the system is optimized for the host hardware.

## 1. Environment Analysis
The installer must perform the following checks:
-   **CPU**: Check for AVX/AVX2 support (crucial for local inference).
-   **GPU**: Detect CUDA/Metal/ROCm and available VRAM.
-   **RAM**: Total available memory.
-   **Storage**: Available disk space (LLMs can be several GBs).

## 2. Decision Matrix
Based on the analysis, the installer recommends a configuration:

| Resources | Recommended Model | Engine |
| :--- | :--- | :--- |
| < 8GB RAM, No GPU | Llama-3-8B (Quantized) / DeepSeek-Cloud | Ollama / Cloud API |
| 16GB+ RAM, 8GB+ VRAM | Llama-3-8B (Full) | Ollama |
| 32GB+ RAM, 16GB+ VRAM | Llama-3-70B | Ollama |
| Minimal Resources / Server | DeepSeek-V3 | Cloud API |

## 3. Automation Steps
1.  **Dependency Check**: Ensure Node.js/Python and Git are installed.
2.  **Engine Setup**:
    -   If Local: Download and initialize Ollama.
    -   If Cloud: Prompt for API Keys and validate them.
3.  **Model Pulling**: If using Ollama, pull the recommended model automatically.
4.  **Config Generation**: Create a `.env` or `config.json` with all paths and settings.

## 4. Resource Optimization
-   Implement dynamic offloading (moving layers between CPU/GPU).
-   Support for different quantization levels (Q4_K_M is the default recommendation).
