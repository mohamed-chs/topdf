#!/usr/bin/env node

import { Command } from 'commander';
import { readFile, stat } from 'fs/promises';
import { resolve, basename, extname, join, dirname } from 'path';
import chalk from 'chalk';
import { glob } from 'glob';
import chokidar from 'chokidar';
import yaml from 'js-yaml';
import { Renderer } from '../src/renderer.js';

const program = new Command();

async function loadConfig() {
  const configPaths = ['.topdfrc', '.topdfrc.json', '.topdfrc.yaml', '.topdfrc.yml'];
  for (const p of configPaths) {
    try {
      return yaml.load(await readFile(resolve(p), 'utf-8'));
    } catch {}
  }
  return {};
}

program
  .name('topdf')
  .description('Convert Markdown to high-quality PDF')
  .version('1.0.0')
  .argument('<inputs...>', 'Input markdown files or glob patterns')
  .option('-o, --output <path>', 'Output directory or file path')
  .option('-w, --watch', 'Watch for changes and reconvert')
  .option('-c, --css <path>', 'Custom CSS file path')
  .option('-t, --template <path>', 'Custom HTML template path')
  .option('-m, --margin <margin>', 'Page margin', '20mm')
  .option('--header <path>', 'Custom HTML header template path')
  .option('--footer <path>', 'Custom HTML footer template path')
  .option('--toc', 'Generate a Table of Contents')
  .action(async (inputs, options) => {
    const config = await loadConfig();
    const opts = { ...config, ...options };
    
    const renderer = new Renderer({
      customCss: opts.css ? resolve(opts.css) : null,
      template: opts.template ? resolve(opts.template) : null,
      margin: opts.margin,
      toc: opts.toc,
      headerTemplate: opts.header ? await readFile(resolve(opts.header), 'utf-8') : null,
      footerTemplate: opts.footer ? await readFile(resolve(opts.footer), 'utf-8') : null
    });

    async function convert(file) {
      try {
        const inputPath = resolve(file);
        if ((await stat(inputPath)).isDirectory()) return;

        const markdown = await readFile(inputPath, 'utf-8');
        let outputPath = opts.output;
        
        if (!outputPath || inputs.length > 1 || (await glob(inputs[0])).length > 1) {
          const name = basename(inputPath, extname(inputPath));
          const dir = (opts.output && inputs.length > 1) ? resolve(opts.output) : dirname(inputPath);
          outputPath = join(dir, `${name}.pdf`);
        } else {
          outputPath = resolve(outputPath);
        }

        console.log(chalk.blue(`Converting ${chalk.bold(file)} → ${chalk.bold(outputPath)}...`));
        await renderer.generatePdf(markdown, outputPath, { basePath: dirname(inputPath) });
        console.log(chalk.green(`✔ Done: ${basename(outputPath)}`));
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
      }
    }

    const files = (await Promise.all(inputs.map(i => glob(i))))
      .flat()
      .filter(f => /\.(md|markdown)$/i.test(f));

    if (files.length === 0) {
      console.error(chalk.red('Error: No input files found.'));
      process.exit(1);
    }

    for (const file of files) await convert(file);

    if (options.watch) {
      console.log(chalk.yellow('\nWatching for changes... (Press Ctrl+C to stop)'));
      chokidar.watch(inputs, { ignored: /(^|[\/\\])\../, persistent: true })
        .on('change', path => {
          console.log(chalk.cyan(`\nChange detected in ${path}`));
          convert(path);
        });
    } else {
      console.log(chalk.green(`\n✔ Successfully converted ${files.length} file(s).`));
    }
  });

program.parse();
