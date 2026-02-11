#!/usr/bin/env node

import { Command } from 'commander';
import { readFile, stat, mkdir } from 'fs/promises';
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
    
    const files = (await Promise.all(inputs.map(i => glob(i))))
      .flat()
      .filter(f => /\.(md|markdown)$/i.test(f));

    if (files.length === 0) {
      console.error(chalk.red('Error: No input files found.'));
      process.exit(1);
    }

    const sharedRenderer = new Renderer({
        customCss: opts.css ? resolve(opts.css) : null,
        template: opts.template ? resolve(opts.template) : null,
        margin: opts.margin,
        toc: opts.toc,
        headerTemplate: opts.header ? await readFile(resolve(opts.header), 'utf-8') : null,
        footerTemplate: opts.footer ? await readFile(resolve(opts.footer), 'utf-8') : null
    });

    let successCount = 0;
    let failCount = 0;

    async function convert(file) {
      try {
        const inputPath = resolve(file);
        if ((await stat(inputPath)).isDirectory()) return;

        const markdown = await readFile(inputPath, 'utf-8');
        let outputPath = opts.output;
        
        if (!outputPath) {
          const name = basename(inputPath, extname(inputPath));
          outputPath = join(dirname(inputPath), `${name}.pdf`);
        } else {
          outputPath = resolve(outputPath);
          try {
            const s = await stat(outputPath);
            if (s.isDirectory()) {
              const name = basename(inputPath, extname(inputPath));
              outputPath = join(outputPath, `${name}.pdf`);
            } else if (files.length > 1) {
              // If multiple files and output is not a directory, 
              // we treat it as a base path or directory to be created
              const name = basename(inputPath, extname(inputPath));
              outputPath = join(outputPath, `${name}.pdf`);
            }
          } catch (e) {
            if (files.length > 1 || !outputPath.endsWith('.pdf')) {
              const name = basename(inputPath, extname(inputPath));
              outputPath = join(outputPath, `${name}.pdf`);
            }
          }
        }

        // Ensure output directory exists
        await mkdir(dirname(outputPath), { recursive: true });

        console.log(chalk.blue(`Converting ${chalk.bold(file)} → ${chalk.bold(outputPath)}...`));
        
        await sharedRenderer.generatePdf(markdown, outputPath, { basePath: dirname(inputPath) });
        console.log(chalk.green(`✔ Done: ${basename(outputPath)}`));
        successCount++;
      } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        failCount++;
      }
    }

    for (const file of files) await convert(file);

    if (options.watch) {
      console.log(chalk.yellow('\nWatching for changes... (Press Ctrl+C to stop)'));
      chokidar.watch(inputs, { ignored: /(^|[\/\\])\../, persistent: true })
        .on('change', async path => {
          console.log(chalk.cyan(`\nChange detected in ${path}`));
          await convert(path);
        });
    } else {
      await sharedRenderer.close();
      if (successCount > 0) {
        console.log(chalk.green(`\n✔ Successfully converted ${successCount} file(s).`));
      }
      if (failCount > 0) {
        console.log(chalk.red(`\n✖ Failed to convert ${failCount} file(s).`));
        process.exit(1);
      }
    }
  });

program.parse();