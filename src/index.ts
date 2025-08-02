import './update';
import yargs from 'yargs';
import { covertToTsCommand } from './commands/covertToTs';
import { generateUnittestCommand } from './commands/generateUnittest';
import { refactorCommand } from './commands/refactor';
import { freeCommand } from './commands/free';
import { calcTokenCommand } from './commands/calcToken';
import { generateChangelogCommand } from './commands/generateChangelog';

yargs
  .demandCommand()
  .command(covertToTsCommand)
  .command(generateUnittestCommand)
  .command(refactorCommand)
  .command(freeCommand)
  .command(calcTokenCommand)
  .command(generateChangelogCommand)
  .alias('h', 'help')
  .scriptName('fileai')
  .parse();
