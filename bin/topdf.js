#!/usr/bin/env node

import { Command } from 'commander';
import { readFile, stat } from 'fs/promises';
import { resolve, basename, extname, join } from 'path';
import chalk from 'chalk';
import { glob } from 'glob';
import chokidar from 'chokidar';
import { Renderer } from '../src/renderer.js';

const program = new Command();

program
  .name('topdf')
  .description('Convert Markdown to high-quality PDF')
  .version('1.0.0')
  .argument('<inputs...>', 'Input markdown files or glob patterns')
  .option('-o, --output <path>', 'Output directory or file path')
  .option('-w, --watch', 'Watch for changes and reconvert')
  .option('-c, --css <path>', 'Custom CSS file path')
  .option('-t, --template <path>', 'Custom HTML template path')
  .option('-m, --margin <margin>', 'Page margin (e.g., 20mm)', '20mm')
  .option('--toc', 'Generate a Table of Contents')
  .action(async (inputs, options) => {
    const renderer = new Renderer({
      customCss: options.css ? resolve(options.css) : null,
      template: options.template ? resolve(options.template) : null,
      margin: options.margin,
      toc: options.toc
    });

    async function convert(file) {
      try {
        const inputPath = resolve(file);
        const s = await stat(inputPath);
        if (s.isDirectory()) return;

        const markdown = await readFile(inputPath, 'utf-8');
        let outputPath = options.output;
        
        if (!outputPath || inputs.length > 1 || (await glob(inputs[0])).length > 1) {
          const name = basename(inputPath, extname(inputPath));
          const dir = (options.output && inputs.length > 1) ? resolve(options.output) : resolve(inputPath, '..');
          outputPath = join(dir, `${name}.pdf`);
        } else {
          outputPath = resolve(outputPath);
        }

        console.log(chalk.blue(`Converting ${chalk.bold(file)} → ${chalk.bold(outputPath)}...`));
        await renderer.generatePdf(markdown, outputPath);
        console.log(chalk.green(`✔ Done: ${basename(outputPath)}`));
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
      }
    }

    const initialFiles = [];
    for (const input of inputs) {
      const matches = await glob(input);
      initialFiles.push(...matches.filter(f => {
        const ext = extname(f).toLowerCase();
        return ext === '.md' || ext === '.markdown';
      }));
    }

    if (initialFiles.length === 0) {
      console.error(chalk.red('Error: No input files found.'));
      process.exit(1);
    }

    // Initial conversion
    for (const file of initialFiles) {
      await convert(file);
    }

    if (options.watch) {
      console.log(chalk.yellow('\nWatching for changes... (Press Ctrl+C to stop)'));
      
      const watcher = chokidar.watch(inputs, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true
      });

      watcher.on('change', async (path) => {
        console.log(chalk.cyan(`\nChange detected in ${path}`));
        await convert(path);
      });
    } else {
      console.log(chalk.green(`\n✔ Successfully converted ${initialFiles.length} file(s).`));
    }
  });

program.parse();
