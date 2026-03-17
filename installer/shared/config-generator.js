import fs from 'fs';
import path from 'path';

/**
 * Config Generator — Creates the project's configuration files from templates.
 *
 * @param {object} options
 * @param {string} options.outputDir - Where to write the config files
 * @param {'general' | 'ecommerce' | 'support'} options.template - Which starter template to use
 * @param {string} options.botName - Display name for the bot
 * @param {string} options.companyName - Business name
 * @param {object} options.aiConfig - AI backend configuration to embed
 */
export async function generateConfig(options) {
  const { outputDir, template = 'general', botName, companyName, aiConfig } = options;

  // Get the templates source directory
  const templatesDir = new URL(`../../templates/${template}`, import.meta.url).pathname;

  if (!fs.existsSync(templatesDir)) {
    throw new Error(`Template '${template}' not found at ${templatesDir}`);
  }

  // Create output directory structure
  const dirs = [
    outputDir,
    path.join(outputDir, 'prompts'),
    path.join(outputDir, 'training'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // ── Generate chatbot.config.json ─────────────────────────────

  const configTemplatePath = path.join(templatesDir, 'chatbot.config.json');
  const baseConfig = JSON.parse(fs.readFileSync(configTemplatePath, 'utf-8'));

  const finalConfig = {
    ...baseConfig,
    botName: botName || baseConfig.botName,
    companyName: companyName || baseConfig.companyName,
    ai: aiConfig || baseConfig.ai,
  };

  fs.writeFileSync(
    path.join(outputDir, 'chatbot.config.json'),
    JSON.stringify(finalConfig, null, 2),
  );

  // ── Copy rules.md ─────────────────────────────────────────────

  const rulesTemplatePath = path.join(templatesDir, 'rules.md');
  if (fs.existsSync(rulesTemplatePath)) {
    let rulesContent = fs.readFileSync(rulesTemplatePath, 'utf-8');
    // Replace template variables
    rulesContent = rulesContent
      .replace(/\{\{companyName\}\}/g, companyName || 'Your Company')
      .replace(/\{\{botName\}\}/g, botName || 'Assistant');
    fs.writeFileSync(path.join(outputDir, 'rules.md'), rulesContent);
  }

  // ── Copy tools.json ───────────────────────────────────────────

  const toolsTemplatePath = path.join(templatesDir, 'tools.json');
  if (fs.existsSync(toolsTemplatePath)) {
    fs.copyFileSync(toolsTemplatePath, path.join(outputDir, 'tools.json'));
  } else {
    fs.writeFileSync(path.join(outputDir, 'tools.json'), JSON.stringify({ tools: [] }, null, 2));
  }

  // ── Generate auth.json (empty, with instructions) ─────────────

  const authContent = {
    _comment: 'Store API credentials here. Add this file to .gitignore!',
    _example: {
      'my-api': {
        type: 'bearer',
        token: 'YOUR_TOKEN_HERE',
      },
    },
  };
  fs.writeFileSync(path.join(outputDir, 'auth.json'), JSON.stringify(authContent, null, 2));

  // ── Generate .env stub ────────────────────────────────────────

  const envContent = `# AI Provider API Keys (used when ai.type = "cloud")
# DEEPSEEK_API_KEY=sk-your-key-here
# OPENAI_API_KEY=sk-your-key-here
`;
  const envPath = path.join(path.dirname(outputDir), '.env');
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, envContent);
  }

  // ── Training directory README ─────────────────────────────────

  const trainingReadme = `# Training Data

Place your training datasets here as JSONL files.

## Format

Each line should be a valid JSON object in the conversational format:
\`\`\`jsonl
{"messages": [{"role": "user", "content": "Your question here"}, {"role": "assistant", "content": "The ideal answer here"}]}
\`\`\`

## Files

- \`faq.jsonl\` — Frequently asked questions and ideal answers
- \`corrections.jsonl\` — Incorrect AI responses that have been manually corrected

Run training with: \`chatbot-ia-lib train --dataset ./config/training/faq.jsonl\`
`;
  fs.writeFileSync(path.join(outputDir, 'training', 'README.md'), trainingReadme);

  return {
    configPath: path.join(outputDir, 'chatbot.config.json'),
    filesCreated: [
      'chatbot.config.json',
      'rules.md',
      'tools.json',
      'auth.json',
      '.env',
      'training/README.md',
    ],
  };
}
