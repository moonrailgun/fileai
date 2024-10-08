import { CommandModule } from 'yargs';
import path from 'path';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import fg from 'fast-glob';
import chalk from 'chalk';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { env } from '../env';
import { CodeOutputParser } from '../utils/CodeOutputParser';
import { getLLMModel } from '../utils/llm';

export const covertToTsCommand: CommandModule = {
  command: 'convertToTs <file>',
  describe: 'Convert file from js to ts',
  builder: (yargs) =>
    yargs.positional('file', {
      demandOption: true,
      description: 'input file or dir',
      type: 'string',
    }),
  async handler(args: any) {
    const filepath = String(args.file);

    let fileList = [];
    if ((await fs.stat(filepath)).isFile() === true) {
      // is file
      fileList = [path.resolve(process.cwd(), filepath)];
    } else {
      console.log('Scanning all js files in', chalk.blue(filepath), '...');
      fileList = await fg(['./**/*.js', '!node_modules'], {
        cwd: filepath,
        absolute: true,
      });
    }

    console.group('Process file:');
    fileList.forEach((p) => console.log(`- ${p}`));
    console.groupEnd();

    const { openaiApiKey, modelName, generateType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'modelName',
        message: 'Which LLM Model did you want use?',
        choices: ['deepseek-coder', 'deepseek-chat', 'gpt-4o-mini'],
        default: 'deepseek-coder',
      },
      {
        type: 'input',
        name: 'openaiApiKey',
        message: 'Whats your openai api key?',
        default: env.openaiApiKey,
        when: () => !Boolean(env.openaiApiKey),
      },
      {
        type: 'list',
        name: 'generateType',
        choices: [
          { name: 'Replace old file', value: 'replace' },
          { name: 'Keep old file', value: 'keep' },
        ],
        default: 'keep',
      },
    ]);

    const llm = getLLMModel(modelName, openaiApiKey);

    const parser = new CodeOutputParser();

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      ['user', '{code}'],
    ]);

    for (const p of fileList) {
      const newFilePath = p.replace(/\.js$/, '.ts');

      const code = await fs.readFile(p);

      const res = await promptTemplate
        .pipe(llm)
        .pipe(parser)
        .invoke({
          code: String(code),
        });

      await fs.writeFile(newFilePath, res);

      if (generateType === 'replace') {
        await fs.remove(p);
      }
    }
  },
};

const systemPrompt = `
You are a professional front-end typescript engineer with rich programming experience.

I will give you a piece of js code.

Please help me convert it into typescript code with esmodule export according to the context.

No additional explanation required, this is very important to me:
`;
