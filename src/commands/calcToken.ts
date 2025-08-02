import { CommandModule } from 'yargs';
import path from 'path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import chalk from 'chalk';
import { encoding_for_model } from 'tiktoken';

export const calcTokenCommand: CommandModule = {
  command: 'calc-token <file>',
  describe: 'calc files AI token',
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
      fileList = await fg(['./**/*', '!node_modules'], {
        cwd: filepath,
        absolute: true,
      });
    }

    console.log('file size:', fileList.length);

    console.group('Token:');

    let sum = 0;

    for (const p of fileList) {
      const code = await fs.readFile(p);

      const size = calcOpenAIToken(String(code));

      console.log(`- ${path.relative(process.cwd(), p)}: ${size}`);

      sum += size;
    }

    console.groupEnd();

    console.log('Total token:', sum);
  },
};

function calcOpenAIToken(message: string): number {
  const encoder = encoding_for_model('gpt-4o');
  const count = encoder.encode(message).length;

  encoder.free();

  return count;
}
