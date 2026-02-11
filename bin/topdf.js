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
  .description('Convert Markdown to high-quality PDF. Supports [TOC], footnotes, and <!-- PAGE_BREAK -->.')
  .version('1.0.0')
  .argument('<inputs...>', 'Input markdown files or glob patterns')
  .option('-o, --output <path>', 'Output directory (or file path if single input)')
  .option('-w, --watch', 'Watch for changes and reconvert')
  .option('-c, --css <path>', 'Custom CSS file path')
  .option('-t, --template <path>', 'Custom HTML template path')
  .option('-m, --margin <margin>', 'Page margin (e.g., 20mm, 1in)', '20mm')
  .option('-f, --format <format>', 'PDF page format (e.g., A4, Letter)', 'A4')
  .option('--header <path>', 'Custom HTML header template path')
  .option('--footer <path>', 'Custom HTML footer template path')
  .option('--toc', 'Generate a Table of Contents at the start of the document')
  .option('--no-math', 'Disable MathJax auto-detection and rendering')
  .action(async (inputs, options) => {
    const config = await loadConfig();
    const opts = { ...config, ...options };
    
    async function getFiles() {
      const found = (await Promise.all(inputs.map(i => glob(i))))
        .flat()
        .filter(f => /\.(md|markdown)$/i.test(f));
      return [...new Set(found)]; // Deduplicate
    }

    let files = await getFiles();

    if (files.length === 0) {
      console.error(chalk.red('Error: No input files found.'));
      process.exit(1);
    }

    const isSingleInputLiteral = inputs.length === 1 && !inputs[0].includes('*');

    if (files.length > 1 && opts.output && opts.output.endsWith('.pdf')) {
      console.error(chalk.red('Error: Output path cannot be a .pdf file when converting multiple inputs. Please specify a directory.'));
      process.exit(1);
    }

    const sharedRenderer = new Renderer({
        customCss: opts.css ? resolve(opts.css) : null,
        template: opts.template ? resolve(opts.template) : null,
        margin: opts.margin,
        format: opts.format,
        toc: opts.toc,
        math: opts.math,
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
            }
          } catch (e) {
            // If it doesn't exist, we decide if it's a file or dir
            // New logic: if it was a single literal input (not a glob) and ends in something that isn't .pdf, 
            // but the user might have intended it as a filename, we still respect it if it's not multiple files.
            if (files.length > 1 || (!isSingleInputLiteral && !outputPath.endsWith('.pdf'))) {
              const name = basename(inputPath, extname(inputPath));
              outputPath = join(outputPath, `${name}.pdf`);
            } else if (!outputPath.endsWith('.pdf')) {
               // Optional: maybe auto-append .pdf? Sane default: yes.
               outputPath += '.pdf';
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
          if (/\.(md|markdown)$/i.test(path)) {
            console.log(chalk.cyan(`\nChange detected in ${path}`));
            await convert(path);
          }
        })
        .on('add', async path => {
          if (/\.(md|markdown)$/i.test(path)) {
            // Check if we already have it to avoid double-triggering on startup if chokidar is fast
            // but usually 'add' is for new files during watch
            console.log(chalk.cyan(`\nNew file detected: ${path}`));
            await convert(path);
          }
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