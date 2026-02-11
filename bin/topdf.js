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
const loadConfig = async () => {
  for (const p of ['.topdfrc', '.topdfrc.json', '.topdfrc.yaml', '.topdfrc.yml']) {
    try { return yaml.load(await readFile(resolve(p), 'utf-8')); } catch {}
  }
  return {};
};

program
  .name('topdf')
  .description('Convert Markdown to high-quality PDF.')
  .version('1.0.0')
  .argument('<inputs...>', 'Input markdown files or glob patterns')
  .option('-o, --output <path>', 'Output directory or file path')
  .option('-w, --watch', 'Watch for changes')
  .option('-c, --css <path>', 'Custom CSS')
  .option('-t, --template <path>', 'Custom HTML template')
  .option('-m, --margin <margin>', 'Page margin', '20mm')
  .option('-f, --format <format>', 'PDF format', 'A4')
  .option('--header <path>', 'Custom header template')
  .option('--footer <path>', 'Custom footer template')
  .option('--toc', 'Generate Table of Contents')
  .option('--no-math', 'Disable MathJax')
  .action(async (inputs, options) => {
    const opts = { ...await loadConfig(), ...options };
    const getFiles = async () => [...new Set((await Promise.all(inputs.map(i => glob(i)))).flat().filter(f => /\.(md|markdown)$/i.test(f)))];
    
    let files = await getFiles();
    if (!files.length) { console.error(chalk.red('Error: No input files found.')); process.exit(1); }
    if (files.length > 1 && opts.output?.endsWith('.pdf')) { console.error(chalk.red('Error: Output path cannot be a .pdf file for multiple inputs.')); process.exit(1); }

    const readTpl = async (p) => p ? readFile(resolve(p), 'utf-8') : null;
    const renderer = new Renderer({
      customCss: opts.css ? resolve(opts.css) : null,
      template: opts.template ? resolve(opts.template) : null,
      margin: opts.margin,
      format: opts.format,
      toc: opts.toc,
      math: opts.math,
      headerTemplate: await readTpl(opts.header),
      footerTemplate: await readTpl(opts.footer)
    });

    let [success, fail] = [0, 0];
    const convert = async (file) => {
      try {
        const input = resolve(file);
        if ((await stat(input)).isDirectory()) return;

        const out = opts.output ? resolve(opts.output) : null;
        const isDir = out ? (await stat(out).catch(() => null))?.isDirectory() ?? (files.length > 1 || !out.endsWith('.pdf')) : false;
        const outputPath = isDir ? join(out, `${basename(input, extname(input))}.pdf`) : (out || join(dirname(input), `${basename(input, extname(input))}.pdf`));

        await mkdir(dirname(outputPath), { recursive: true });
        console.log(chalk.blue(`Converting ${chalk.bold(file)} → ${chalk.bold(outputPath)}...`));
        await renderer.generatePdf(await readFile(input, 'utf-8'), outputPath, { basePath: dirname(input) });
        console.log(chalk.green(`✔ Done: ${basename(outputPath)}`));
        success++;
      } catch (e) { console.error(chalk.red('Error:'), e.message); fail++; }
    };

    for (const f of files) await convert(f);

    if (options.watch) {
      console.log(chalk.yellow('\nWatching for changes... (Press Ctrl+C to stop)'));
      chokidar.watch(inputs, { ignored: /(^|[\/\\])\../, persistent: true }).on('all', async (event, path) => {
        if (['add', 'change'].includes(event) && /\.(md|markdown)$/i.test(path)) {
          console.log(chalk.cyan(`\n${event === 'add' ? 'New file' : 'Change'} detected: ${path}`));
          await convert(path);
        }
      });
    } else {
      await renderer.close();
      if (success) console.log(chalk.green(`\n✔ Successfully converted ${success} file(s).`));
      if (fail) { console.log(chalk.red(`\n✖ Failed to convert ${fail} file(s).`)); process.exit(1); }
    }
  });

program.parse();
