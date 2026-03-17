import fs from 'fs';
import path from 'path';
import { OllamaSetup } from './ollama-setup.js';
import { OllamaBackend } from '../../src/backends/ollama-backend.js';
import { CloudBackend } from '../../src/backends/cloud-backend.js';

/**
 * Validator — Runs pre-flight checks to ensure the environment is correctly configured.
 *
 * Used by both the installer wizard and the `chatbot-ia-lib doctor` command.
 */
export class Validator {
  /**
   * Run all validation checks.
   *
   * @param {object} options
   * @param {string} options.configDir - Path to the configuration directory
   * @returns {Promise<ValidationReport>}
   */
  async validate(options) {
    const { configDir } = options;
    const checks = [];

    // 1. Node.js version
    checks.push(this._checkNodeVersion());

    // 2. Config directory exists
    const configCheck = this._checkConfigDir(configDir);
    checks.push(configCheck);

    if (configCheck.status === 'pass') {
      // 3. Config file is valid JSON and has required fields
      checks.push(this._checkConfigFile(configDir));

      // 4. Config-specific checks (backend health, etc.)
      const config = this._loadConfig(configDir);
      if (config) {
        checks.push(await this._checkBackend(config));

        // 5. Disk space check (for local backends)
        if (config.ai?.primary?.type === 'ollama' || config.ai?.type === 'ollama') {
          checks.push(await this._checkDiskSpace());
        }
      }
    }

    const passed = checks.filter((c) => c.status === 'pass').length;
    const failed = checks.filter((c) => c.status === 'fail').length;
    const warnings = checks.filter((c) => c.status === 'warn').length;

    return {
      checks,
      summary: {
        passed,
        failed,
        warnings,
        ready: failed === 0,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────
  // Individual checks
  // ──────────────────────────────────────────────────────────────

  _checkNodeVersion() {
    const version = parseInt(process.version.slice(1).split('.')[0]);
    return {
      name: 'Node.js Version',
      status: version >= 18 ? 'pass' : 'fail',
      message: version >= 18
        ? `Node.js ${process.version} ✓`
        : `Node.js ${process.version} detected — version 18+ required. Please upgrade.`,
    };
  }

  _checkConfigDir(configDir) {
    const exists = fs.existsSync(configDir);
    return {
      name: 'Config Directory',
      status: exists ? 'pass' : 'fail',
      message: exists
        ? `Config directory found at ${configDir} ✓`
        : `Config directory not found at ${configDir}. Run: chatbot-ia-lib init`,
    };
  }

  _checkConfigFile(configDir) {
    const configPath = path.join(configDir, 'chatbot.config.json');
    if (!fs.existsSync(configPath)) {
      return { name: 'chatbot.config.json', status: 'fail', message: 'chatbot.config.json not found in config directory' };
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const missing = [];
      if (!config.botName) missing.push('botName');
      if (!config.ai) missing.push('ai');

      return {
        name: 'chatbot.config.json',
        status: missing.length === 0 ? 'pass' : 'fail',
        message: missing.length === 0
          ? 'chatbot.config.json is valid ✓'
          : `chatbot.config.json is missing required fields: ${missing.join(', ')}`,
      };
    } catch (err) {
      return { name: 'chatbot.config.json', status: 'fail', message: `Invalid JSON: ${err.message}` };
    }
  }

  async _checkBackend(config) {
    const backendConfig = config.ai?.primary || config.ai;

    try {
      if (backendConfig.type === 'ollama') {
        const ollama = new OllamaSetup();
        const running = await ollama.isRunning();
        if (!running) {
          return { name: 'AI Backend (Ollama)', status: 'fail', message: 'Ollama service is not running. Start it with: ollama serve' };
        }

        const modelAvailable = await ollama.isModelAvailable(backendConfig.model);
        if (!modelAvailable) {
          return { name: 'AI Backend (Ollama)', status: 'fail', message: `Model '${backendConfig.model}' not downloaded. Run: ollama pull ${backendConfig.model}` };
        }

        const works = await ollama.testModel(backendConfig.model);
        return {
          name: 'AI Backend (Ollama)',
          status: works ? 'pass' : 'fail',
          message: works ? `Ollama + ${backendConfig.model} responding correctly ✓` : 'Model not responding to test request',
        };
      }

      if (backendConfig.type === 'cloud') {
        const apiKey = backendConfig.apiKey?.startsWith('${')
          ? process.env[backendConfig.apiKey.slice(2, -1)]
          : backendConfig.apiKey;

        if (!apiKey) {
          return { name: 'AI Backend (Cloud)', status: 'fail', message: 'Cloud API key not configured. Check your .env file.' };
        }

        const backend = new CloudBackend({ apiKey, model: backendConfig.model, baseUrl: backendConfig.baseUrl });
        const healthy = await backend.healthCheck();
        return {
          name: 'AI Backend (Cloud)',
          status: healthy ? 'pass' : 'fail',
          message: healthy ? `Cloud API (${backendConfig.model}) responding correctly ✓` : 'Cloud API health check failed — verify API key and model name',
        };
      }

      return { name: 'AI Backend', status: 'warn', message: `Unknown backend type: ${backendConfig.type}` };
    } catch (err) {
      return { name: 'AI Backend', status: 'fail', message: `Backend check failed: ${err.message}` };
    }
  }

  async _checkDiskSpace() {
    // Minimum 5GB free for local models
    const MIN_GB = 5;
    try {
      const { execSync } = await import('child_process');
      let freeGB = 0;

      if (process.platform === 'win32') {
        const out = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace /format:value 2>nul').toString();
        const match = out.match(/FreeSpace=(\d+)/);
        freeGB = match ? parseInt(match[1]) / (1024 ** 3) : 0;
      } else {
        const out = execSync(`df -Pk "${process.cwd()}" | tail -1`).toString();
        const parts = out.trim().split(/\s+/);
        freeGB = parts[3] ? parseInt(parts[3]) / (1024 ** 2) : 0;
      }

      return {
        name: 'Disk Space',
        status: freeGB >= MIN_GB ? 'pass' : 'warn',
        message: freeGB >= MIN_GB
          ? `${Math.round(freeGB)}GB free disk space ✓`
          : `Only ${Math.round(freeGB)}GB free — at least ${MIN_GB}GB recommended for local models`,
      };
    } catch {
      return { name: 'Disk Space', status: 'warn', message: 'Could not check disk space' };
    }
  }

  _loadConfig(configDir) {
    try {
      return JSON.parse(fs.readFileSync(path.join(configDir, 'chatbot.config.json'), 'utf-8'));
    } catch {
      return null;
    }
  }
}

/**
 * Run the doctor command (called from CLI).
 */
export async function runDoctor(options) {
  const chalk = (await import('chalk')).default;
  const { configDir = './config' } = options;

  console.log(chalk.bold('\n🏥 chatbot-ia-lib doctor\n'));

  const validator = new Validator();
  const report = await validator.validate({ configDir });

  for (const check of report.checks) {
    const icon = check.status === 'pass' ? chalk.green('✓') : check.status === 'warn' ? chalk.yellow('⚠') : chalk.red('✗');
    console.log(`  ${icon}  ${chalk.bold(check.name)}: ${check.message}`);
  }

  console.log('');
  if (report.summary.ready) {
    console.log(chalk.green.bold('✅ All checks passed! Your chatbot is ready to use.\n'));
  } else {
    console.log(chalk.red.bold(`❌ ${report.summary.failed} check(s) failed. Please fix the issues above.\n`));
    process.exit(1);
  }
}

/**
 * @typedef {object} ValidationReport
 * @property {Array<{name: string, status: 'pass'|'fail'|'warn', message: string}>} checks
 * @property {{passed: number, failed: number, warnings: number, ready: boolean}} summary
 */
