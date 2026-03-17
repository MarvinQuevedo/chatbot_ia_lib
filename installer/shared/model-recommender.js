/**
 * Model Recommender — Applies the decision matrix to select the optimal AI model.
 *
 * Based on the hardware profile from HardwareDetector, returns a ranked
 * list of model recommendations with tradeoff explanations.
 */
export class ModelRecommender {
  /**
   * Given a hardware profile, return the best model recommendation.
   *
   * @param {import('./hardware-detector.js').HardwareProfile} profile
   * @returns {ModelRecommendation}
   */
  recommend(profile) {
    const { gpu, memory, disk } = profile;
    const ramGB = memory.totalGB;
    const vramGB = gpu.vramGB;
    const hasGPU = gpu.type !== 'none';

    // ── GPU path ────────────────────────────────────────────────

    if (hasGPU && gpu.type === 'metal' && gpu.isUnifiedMemory) {
      // Apple Silicon — unified memory is shared; effective inference memory = total RAM
      if (ramGB >= 32) {
        return this._build('ollama', 'llama3.2:8b', 'Q4_K_M', ~4.7, '~30-40', gpu.type,
          'Apple Silicon with 32GB+ unified memory — excellent local inference');
      }
      if (ramGB >= 16) {
        return this._build('ollama', 'llama3.2:8b', 'Q4_K_M', ~4.7, '~20-30', gpu.type,
          'Apple Silicon with 16GB unified memory — good local inference');
      }
      return this._build('ollama', 'llama3.2:3b', 'Q4_K_M', ~2.0, '~15-20', gpu.type,
        'Apple Silicon with 8GB unified memory — 3B model recommended');
    }

    if (hasGPU && vramGB >= 24) {
      return this._build('ollama', 'llama3:70b', 'Q4_K_M', ~40, '~15-25', 'cuda',
        `${vramGB}GB VRAM — can run the large 70B model`);
    }

    if (hasGPU && vramGB >= 12) {
      return this._build('ollama', 'llama3.2:8b', 'fp16', ~16, '~40-60', gpu.type,
        `${vramGB}GB VRAM — full precision 8B for best quality`);
    }

    if (hasGPU && vramGB >= 6) {
      return this._build('ollama', 'llama3.2:8b', 'Q4_K_M', ~4.7, '~30-50', gpu.type,
        `${vramGB}GB VRAM — quantized 8B fits comfortably`);
    }

    if (hasGPU && vramGB >= 4) {
      return this._build('ollama', 'llama3.2:8b', 'Q4_0', ~4.0, '~20-35', gpu.type,
        `${vramGB}GB VRAM — smaller quantization needed`);
    }

    // ── CPU-only path ───────────────────────────────────────────

    if (ramGB >= 32) {
      return this._build('ollama', 'llama3.2:8b', 'Q4_K_M', ~4.7, '~8-15', 'cpu',
        '32GB+ RAM — 8B model works well on CPU');
    }

    if (ramGB >= 16) {
      return this._build('ollama', 'llama3.2:8b', 'Q4_K_M', ~4.7, '~3-8', 'cpu',
        '16-32GB RAM — 8B model on CPU (slower but functional)');
    }

    if (ramGB >= 8) {
      return this._build('ollama', 'llama3.2:3b', 'Q4_K_M', ~2.0, '~5-10', 'cpu',
        '8-16GB RAM — 3B model for faster responses');
    }

    // ── Cloud fallback ──────────────────────────────────────────

    return this._build('cloud', 'deepseek-chat', null, 0, 'API-dependent', 'cloud',
      'Insufficient local resources — cloud API recommended');
  }

  /** @private */
  _build(engine, model, quantization, sizeGB, speedTokensSec, accelerator, reasoning) {
    return {
      engine,        // 'ollama' | 'cloud'
      model,         // model tag
      quantization,  // null for cloud
      sizeGB,        // approximate download size
      speedTokensSec, // estimated tokens/second
      accelerator,   // 'cuda' | 'metal' | 'rocm' | 'cpu' | 'cloud'
      reasoning,     // human-readable explanation
    };
  }
}

/**
 * @typedef {object} ModelRecommendation
 * @property {'ollama' | 'cloud'} engine
 * @property {string} model
 * @property {string | null} quantization
 * @property {number} sizeGB
 * @property {string} speedTokensSec
 * @property {string} accelerator
 * @property {string} reasoning
 */
