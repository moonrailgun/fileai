import { CommandModule } from 'yargs';
import fs from 'fs-extra';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { env } from '../env';
import OpenAI from 'openai';

export const generateChangelogCommand: CommandModule = {
  command: 'changelog [file]',
  describe: 'Generate changelog from git diff content',
  builder: (yargs) =>
    yargs
      .example('fileai changelog changes.diff', '')
      .example('fileai changelog -m deepseek-chat', '')
      .example('fileai changelog -m deepseek-chat -l chinese', '')
      .example('git diff HEAD~1 | fileai changelog', '')
      .example('git diff HEAD~1 | fileai changelog -m deepseek-chat', '')
      .example(
        'git diff main..feature-branch | fileai changelog -m deepseek-chat -l chinese',
        ''
      )
      .positional('file', {
        description: 'git diff file path (optional, can use pipe)',
        type: 'string',
      })
      .option('model', {
        alias: 'm',
        description: 'LLM model to use',
        type: 'string',
        choices: ['deepseek-coder', 'deepseek-chat', 'gpt-4o'],
        default: env.openaiModel,
      })
      .option('language', {
        description: 'Language of the changelog',
        type: 'string',
        default: 'english',
      })
      .option('output', {
        alias: 'o',
        description: 'Output file path (optional)',
        type: 'string',
      }),

  async handler(args: any) {
    // Check API key first before reading stdin
    let openaiApiKey = process.env.OPENAI_API_KEY || env.openaiApiKey;
    if (!openaiApiKey) {
      // Check if stdin is a TTY (interactive terminal)
      if (process.stdin.isTTY) {
        const { apiKey } = await inquirer.prompt([
          {
            type: 'input',
            name: 'apiKey',
            message: "What's your OpenAI API key?",
            validate: (input) => (input.trim() ? true : 'API key is required'),
          },
        ]);
        openaiApiKey = apiKey || '';
      } else {
        // Non-interactive mode (pipe), check environment variable
        console.error(chalk.red('Error: OpenAI API key is required'));
        console.error(
          chalk.yellow(
            'Please set OPENAI_API_KEY environment variable or use interactive mode'
          )
        );
        process.exit(1);
      }
    }

    if (!openaiApiKey) {
      console.error(chalk.red('Error: OpenAI API key is required'));
      process.exit(1);
    }

    let diffContent = '';
    const filepath = args.file;

    // Read diff content from file or stdin
    if (filepath) {
      if (!(await fs.pathExists(filepath))) {
        console.error(chalk.red(`Error: File ${filepath} does not exist`));
        process.exit(1);
      }
      diffContent = await fs.readFile(filepath, 'utf-8');
    } else {
      // Read from stdin (pipe)
      diffContent = await new Promise<string>((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
          data += chunk;
        });
        process.stdin.on('end', () => {
          resolve(data);
        });
      });
    }

    if (!diffContent.trim()) {
      console.error(chalk.red('Error: No diff content provided'));
      process.exit(1);
    }

    const modelName = args.model || env.openaiModel;

    console.log(chalk.blue('Generating changelog...'));
    console.log(chalk.gray(`Using model: ${modelName}`));

    try {
      const changelog = await generateChangelog(
        diffContent,
        modelName,
        openaiApiKey,
        args.language ?? 'english'
      );

      if (args.output) {
        await fs.writeFile(args.output, changelog, 'utf-8');
        console.log(chalk.green(`Changelog saved to: ${args.output}`));
      } else {
        console.log(chalk.green('\nGenerated Changelog:'));
        console.log(chalk.cyan('='.repeat(50)));
        console.log(changelog);
        console.log(chalk.cyan('='.repeat(50)));
      }
    } catch (error) {
      console.error(chalk.red('Error generating changelog:'), error);
      process.exit(1);
    }
  },
};

async function generateChangelog(
  diffContent: string,
  modelName: string,
  apiKey: string,
  language: string
): Promise<string> {
  const openai = new OpenAI({
    apiKey,
    baseURL: modelName.includes('deepseek')
      ? 'https://api.deepseek.com/v1'
      : undefined,
  });

  const prompt = `You are a professional software developer tasked with creating concise and informative changelog entries.

Analyze the following git diff content and generate a brief, clear changelog entry that summarizes the changes made.

Requirements:
- Be concise and to the point
- Focus on user-facing changes and important technical improvements
- Use clear, professional language
- Group related changes together
- Avoid technical jargon unless necessary
- Use bullet points for multiple changes
- Keep each entry under 100 characters when possible
- Write from a business perspective, highlighting the value and impact to users or business goals
- Emphasize how the changes affect product features, user experience, or business outcomes
- Avoid using technical terms unless necessary. You are a business person, not a developer.
- Please use ${language} as the language of the changelog

Git diff content:
\`\`\`
${diffContent}
\`\`\`

Generate a changelog entry:`;

  const response = await openai.chat.completions.create({
    model: modelName,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 1000,
  });

  return (
    response.choices[0]?.message?.content?.trim() ||
    'Failed to generate changelog'
  );
}
