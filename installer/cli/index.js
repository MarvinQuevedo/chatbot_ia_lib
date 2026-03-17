import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { HardwareDetector } from '../shared/hardware-detector.js';
import { ModelRecommender } from '../shared/model-recommender.js';
import { OllamaSetup } from '../shared/ollama-setup.js';
import { generateConfig } from '../shared/config-generator.js';
import { Validator } from '../shared/validator.js';

/**
 * Interactive CLI Installer  
 * Guides the user through hardware detection → model selection → backend setup → config generation.
 */
export async function runCliInstaller(options = {}) {
  console.log(chalk.bold.cyan('\n  🤖 chatbot-ia-lib — Smart Setup Wizard\n'));
  console.log('  This wizard will configure an AI chatbot for your project.\n');

  // ── Step 1: Hardware detection ─────────────────────────────────

  const spinner = ora('Scanning system hardware...').start();
  const detector = new HardwareDetector();
  let profile;

  try {
    profile = await detector.detect();
    spinner.succeed('Hardware scan complete');
  } catch (err) {
    spinner.fail(`Hardware scan failed: ${err.message}`);
    profile = { cpu: {}, gpu: { type: 'none', vramGB: 0 }, memory: { totalGB: 8, freeGB: 4 }, disk: { freeGB: 20 } };
  }

  // Display hardware summary
  console.log('\n' + chalk.bold('  System Profile:'));
  console.log(`  CPU:  ${profile.cpu.model || 'Unknown'} (${profile.cpu.cores || '?'} cores)`);
  if (profile.cpu.isAppleSilicon) console.log(chalk.green('       ↳ Apple Silicon (Metal acceleration)'));
  console.log(`  RAM:  ${profile.memory.totalGB}GB total, ${profile.memory.freeGB}GB free`);
  if (profile.gpu.type !== 'none') {
    console.log(`  GPU:  ${profile.gpu.name} — ${profile.gpu.vramGB}GB ${profile.gpu.isUnifiedMemory ? '(unified)' : 'VRAM'}`);
  } else {
    console.log('  GPU:  None detected (CPU-only inference)');
  }
  console.log(`  Disk: ${profile.disk.freeGB}GB free\n`);

  // ── Step 2: Backend selection ──────────────────────────────────

  const recommender = new ModelRecommender();
  const recommendation = recommender.recommend(profile);

  let backend = options.backend;
  let modelTag = options.model;

  if (!backend) {
    console.log(chalk.bold('  AI Backend Recommendation:'));
    if (recommendation.engine === 'ollama') {
      console.log(`  Model:  ${chalk.cyan(recommendation.model)} (${recommendation.quantization})`);
      console.log(`  Engine: Ollama (${recommendation.accelerator})`);
      console.log(`  Speed:  ${recommendation.speedTokensSec} tokens/sec`);
      console.log(`  Size:   ~${recommendation.sizeGB}GB download`);
      console.log(`  Why:    ${recommendation.reasoning}\n`);
    } else {
      console.log(`  Model:  ${chalk.cyan(recommendation.model)}`);
      console.log(`  Engine: Cloud API`);
      console.log(`  Why:    ${recommendation.reasoning}\n`);
    }

    const backendChoice = await select({
      message: 'Which AI backend do you want to use?',
      choices: [
        { name: `✓ Accept recommendation (${recommendation.engine === 'ollama' ? recommendation.model : 'Cloud API'})`, value: recommendation.engine },
        { name: 'Local (Ollama) — run AI on this machine', value: 'ollama' },
        { name: 'Cloud API — use DeepSeek or OpenAI', value: 'cloud' },
      ],
    });

    backend = backendChoice;
  }

  // ── Step 3: Backend-specific setup ────────────────────────────

  let aiConfig = {};

  if (backend === 'ollama') {
    if (!modelTag) {
      modelTag = await input({
        message: 'Ollama model tag:',
        default: recommendation.engine === 'ollama' ? `${recommendation.model}` : 'llama3.2:8b',
      });
    }

    const ollamaSetup = new OllamaSetup();

    // Check Ollama installation
    const ollamaSpinner = ora('Checking Ollama installation...').start();
    const isInstalled = ollamaSetup.isInstalled();

    if (!isInstalled) {
      ollamaSpinner.fail('Ollama is not installed.');
      console.log(`\n  Please install Ollama from: ${chalk.cyan(ollamaSetup.getInstallUrl())}`);
      console.log('  Then re-run: npx chatbot-ia-lib init\n');
      process.exit(1);
    }

    ollamaSpinner.succeed('Ollama is installed');

    // Check/start service
    const serviceSpinner = ora('Checking Ollama service...').start();
    let isRunning = await ollamaSetup.isRunning();

    if (!isRunning) {
      serviceSpinner.text = 'Starting Ollama service...';
      isRunning = await ollamaSetup.startService();
    }

    if (isRunning) {
      serviceSpinner.succeed('Ollama service is running');
    } else {
      serviceSpinner.fail('Could not start Ollama service. Try running `ollama serve` in another terminal.');
      process.exit(1);
    }

    // Check if model is already available
    const modelSpinner = ora(`Checking if ${modelTag} is available...`).start();
    const isAvailable = await ollamaSetup.isModelAvailable(modelTag);

    if (isAvailable) {
      modelSpinner.succeed(`Model ${modelTag} is already downloaded`);
    } else {
      modelSpinner.warn(`Model ${modelTag} is not downloaded yet`);

      const shouldPull = await confirm({
        message: `Download ${modelTag} now? (~${recommendation.sizeGB}GB)`,
        default: true,
      });

      if (shouldPull) {
        console.log(`\n  Run this command in another terminal to download the model:`);
        console.log(chalk.cyan(`  ollama pull ${modelTag}\n`));
        console.log('  Then re-run the installer.');
        process.exit(0);
      }
    }

    aiConfig = {
      primary: {
        type: 'ollama',
        model: modelTag,
        baseUrl: 'http://localhost:11434',
        timeoutMs: 60000,
      },
    };

  } else if (backend === 'cloud') {
    const provider = await select({
      message: 'Which cloud AI provider?',
      choices: [
        { name: 'DeepSeek (recommended — cost-effective)', value: 'deepseek' },
        { name: 'OpenAI (GPT-4o)', value: 'openai' },
        { name: 'Custom (OpenAI-compatible API)', value: 'custom' },
      ],
    });

    const defaultModels = {
      deepseek: 'deepseek-chat',
      openai: 'gpt-4o',
      custom: 'your-model-name',
    };

    const defaultUrls = {
      deepseek: 'https://api.deepseek.com',
      openai: undefined,
      custom: undefined,
    };

    const model = modelTag || await input({
      message: 'Model name:',
      default: defaultModels[provider],
    });

    let baseUrl;
    if (provider === 'custom') {
      baseUrl = await input({ message: 'API base URL:' });
    } else {
      baseUrl = defaultUrls[provider];
    }

    const envVarName = `${provider.toUpperCase()}_API_KEY`;
    console.log(`\n  Add your API key to .env as: ${chalk.cyan(envVarName)}=sk-your-key-here`);

    aiConfig = {
      primary: {
        type: 'cloud',
        model,
        baseUrl: baseUrl || undefined,
        apiKey: `\${${envVarName}}`,
      },
    };
  }

  // ── Step 4: Project customization ─────────────────────────────

  console.log('');
  const template = options.template || await select({
    message: 'What type of business will use this chatbot?',
    choices: [
      { name: '🛒 E-commerce (order tracking, returns, product questions)', value: 'ecommerce' },
      { name: '🎧 Customer Support (tickets, troubleshooting, FAQ)', value: 'support' },
      { name: '⚡ General Purpose (minimal preset rules)', value: 'general' },
    ],
  });

  const botName = await input({ message: 'Bot name:', default: 'Alex' });
  const companyName = await input({ message: 'Company/brand name:', default: 'Your Company' });
  const outputDir = await input({ message: 'Config output directory:', default: './config' });

  // ── Step 5: Generate config files ─────────────────────────────

  const genSpinner = ora('Generating configuration files...').start();

  try {
    const result = await generateConfig({
      outputDir,
      template,
      botName,
      companyName,
      aiConfig,
    });

    genSpinner.succeed('Configuration files generated');
    console.log('');
    console.log(chalk.bold('  Files created:'));
    result.filesCreated.forEach((f) => console.log(`    ${chalk.green('+')} ${outputDir}/${f}`));

  } catch (err) {
    genSpinner.fail(`Failed to generate config: ${err.message}`);
    process.exit(1);
  }

  // ── Step 6: Final validation ───────────────────────────────────

  const validateSpinner = ora('Running final validation...').start();
  const validator = new Validator();
  const report = await validator.validate({ configDir: outputDir });

  if (report.summary.ready) {
    validateSpinner.succeed('All checks passed!');
  } else {
    validateSpinner.warn('Setup complete with warnings');
    report.checks
      .filter((c) => c.status !== 'pass')
      .forEach((c) => console.log(`  ${chalk.yellow('⚠')} ${c.message}`));
  }

  // ── Done ───────────────────────────────────────────────────────

  console.log('\n  ' + chalk.green.bold('🎉 Setup complete!\n'));
  console.log('  To use your chatbot:\n');
  console.log(chalk.cyan("  import { createChatbot } from 'chatbot-ia-lib';"));
  console.log(chalk.cyan(`  const bot = await createChatbot({ configDir: '${outputDir}' });`));
  console.log(chalk.cyan("  const { response, sessionId } = await bot.chat({ message: 'Hello!', sessionId: null });"));
  console.log('\n  Run diagnostics anytime: ' + chalk.cyan('npx chatbot-ia-lib doctor') + '\n');
}
