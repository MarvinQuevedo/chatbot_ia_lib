import axios from 'axios';
import { execSync, spawn } from 'child_process';

const OLLAMA_BASE_URL = 'http://localhost:11434';

/**
 * Ollama Setup — Handles detection, installation, and model pulling for Ollama.
 */
export class OllamaSetup {
  /**
   * Check if Ollama is installed on this system.
   * @returns {boolean}
   */
  isInstalled() {
    try {
      execSync('ollama --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the Ollama service is currently running.
   * @returns {Promise<boolean>}
   */
  async isRunning() {
    try {
      const response = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 2000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Attempt to start the Ollama service.
   * @returns {Promise<boolean>} True if started successfully
   */
  async startService() {
    return new Promise((resolve) => {
      const child = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      // Wait up to 10s for the service to be available
      let elapsed = 0;
      const interval = setInterval(async () => {
        elapsed += 500;
        if (await this.isRunning()) {
          clearInterval(interval);
          resolve(true);
        } else if (elapsed >= 10000) {
          clearInterval(interval);
          resolve(false);
        }
      }, 500);
    });
  }

  /**
   * Get all models currently available in this Ollama installation.
   * @returns {Promise<string[]>}
   */
  async listModels() {
    try {
      const response = await axios.get(`${OLLAMA_BASE_URL}/api/tags`);
      return (response.data?.models || []).map((m) => m.name);
    } catch {
      return [];
    }
  }

  /**
   * Check if a specific model is already downloaded.
   * @param {string} modelTag
   * @returns {Promise<boolean>}
   */
  async isModelAvailable(modelTag) {
    const models = await this.listModels();
    const baseName = modelTag.split(':')[0];
    return models.some((m) => m === modelTag || m.startsWith(baseName + ':'));
  }

  /**
   * Run a quick test to verify the model responds correctly.
   * @param {string} modelTag
   * @returns {Promise<boolean>}
   */
  async testModel(modelTag) {
    try {
      const response = await axios.post(
        `${OLLAMA_BASE_URL}/v1/chat/completions`,
        {
          model: modelTag,
          messages: [{ role: 'user', content: 'Respond with the word "ok" only.' }],
          stream: false,
          options: { num_predict: 5 },
        },
        { timeout: 30000 },
      );
      const content = response.data?.choices?.[0]?.message?.content;
      return typeof content === 'string' && content.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get the Ollama installation URL for the current platform.
   * @returns {string}
   */
  getInstallUrl() {
    return 'https://ollama.ai/download';
  }
}
