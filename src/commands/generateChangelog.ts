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

  const prompt = `Generate a changelog entry from the git diff below.

**Goal**: Create user-focused changelog entries that highlight business value.

**Style Guidelines**:
- Write in ${language}
- Use business-friendly language (avoid technical jargon)
- Focus on user impact and feature improvements
- Keep entries concise (under 100 characters when possible)
- Use bullet points for multiple changes

**Content Requirements**:
- Summarize what changed from a user perspective
- Group related changes together
- If there are multiple authors, group changes by author and include their name (e.g., "by @username")
- If all changes are by the same author, do not mention the author
- Emphasize product features, UX improvements, or business outcomes

**Example Format**:
- Added new dashboard widgets for better analytics by @john
- Fixed login timeout issues affecting mobile users by @sarah`;

  const userMessage = `Here is git diff:

\`\`\`
${diffContent}
\`\`\`
`;

  const response = await openai.chat.completions.create({
    model: modelName,
    messages: [
      {
        role: 'system',
        content: prompt,
      },
      {
        role: 'user',
        content: userMessage,
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
