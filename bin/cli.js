#!/usr/bin/env node

/**
 * chatbot-ia-lib - CLI Entry Point
 *
 * Usage:
 *   npx chatbot-ia-lib init           — Start interactive setup wizard
 *   npx chatbot-ia-lib init --ui      — Launch Web-based Setup UI (coming soon)
 *   npx chatbot-ia-lib doctor         — Run diagnostics
 *   npx chatbot-ia-lib start          — Start chatbot server
 */

import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

program
  .name('chatbot-ia-lib')
  .description('AI-driven chatbot framework — configure once, deploy for any business')
  .version(pkg.version);

// ── init command ─────────────────────────────────────────────

program
  .command('init')
  .description('Interactive setup wizard — detects hardware, configures AI backend, generates starter files')
  .option('--ui', 'Launch web-based setup UI instead of CLI')
  .option('--backend <type>', 'Skip backend selection (ollama | cloud)')
  .option('--model <name>', 'Skip model recommendation (e.g., llama3.2:8b)')
  .option('--template <type>', 'Skip template selection (general | ecommerce | support)')
  .option('--output-dir <path>', 'Where to generate config files', './config')
  .action(async (options) => {
    if (options.ui) {
      console.log('[chatbot-ia-lib] Web UI installer coming in V1. Use CLI mode for now.');
      process.exit(0);
    }

    // Dynamically import to keep startup fast
    const { runCliInstaller } = await import('../installer/cli/index.js');
    await runCliInstaller(options);
  });

// ── doctor command ────────────────────────────────────────────

program
  .command('doctor')
  .description('Run all diagnostic checks (dependencies, AI backend health, config validation)')
  .option('--config-dir <path>', 'Path to config directory to validate', './config')
  .action(async (options) => {
    const { runDoctor } = await import('../installer/shared/validator.js');
    await runDoctor(options);
  });

// ── start command ─────────────────────────────────────────────

program
  .command('start')
  .description('Start the chatbot API server')
  .option('--config-dir <path>', 'Path to config directory', './config')
  .option('--port <number>', 'Port to listen on (overrides config)', parseInt)
  .action(async (options) => {
    console.log('[chatbot-ia-lib] Server command coming in V1. Use the library API directly for now.');
    console.log('Example:\n');
    console.log("  import { createChatbot } from 'chatbot-ia-lib';");
    console.log("  const bot = await createChatbot({ configDir: './config' });");
    console.log("  const result = await bot.chat({ message: 'Hello!', sessionId: null });");
    process.exit(0);
  });

// ── train command ─────────────────────────────────────────────

program
  .command('train')
  .description('Run fine-tuning pipeline (V2 feature)')
  .action(() => {
    console.log('[chatbot-ia-lib] Training pipeline is a V2 feature. Stay tuned!');
    process.exit(0);
  });

program.parse();
