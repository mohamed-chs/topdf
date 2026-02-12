#!/usr/bin/env node
import { Command } from 'commander';
import { readFile, stat, mkdir } from 'fs/promises';
import { resolve, basename, extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { glob } from 'glob';
import chokidar from 'chokidar';
import yaml from 'js-yaml';
import { Renderer } from '../src/renderer.js';
import type { RendererOptions } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Walk up from __dirname to find package.json (works from both source `bin/` and compiled `dist/bin/`)
const findPackageJson = async (dir: string): Promise<string> => {
  const candidate = join(dir, 'package.json');
  try {
    await stat(candidate);
    return candidate;
  } catch {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('package.json not found');
    return findPackageJson(parent);
  }
};
const pkg = JSON.parse(await readFile(await findPackageJson(__dirname), 'utf-8')) as { version: string };

interface CliOptions {
  output?: string;
  watch?: boolean;
  css?: string;
  template?: string;
  margin?: string;
  format?: string;
  header?: string;
  footer?: string;
  toc?: boolean;
  tocDepth?: number;
  math?: boolean;
}

interface ConfigFile extends RendererOptions {
  header?: string;
  footer?: string;
  css?: string;
}

const program = new Command();
const loadConfig = async (): Promise<ConfigFile> => {
  for (const p of ['.topdfrc', '.topdfrc.json', '.topdfrc.yaml', '.topdfrc.yml']) {
    try {
      const configPath = resolve(p);
      const config = yaml.load(await readFile(configPath, 'utf-8')) as ConfigFile;
      if (!config) continue;

      const configDir = dirname(configPath);
      if (config.css) config.css = resolve(configDir, config.css);
      if (config.template) config.template = resolve(configDir, config.template);
      if (config.header) config.header = resolve(configDir, config.header);
      if (config.footer) config.footer = resolve(configDir, config.footer);
      return config;
    } catch {
      // Ignore errors for missing or invalid config files
    }
  }
  return {};
};

program
  .name('topdf')
  .description('Convert Markdown to high-quality PDF.')
  .version(pkg.version)
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
  .option('--toc-depth <depth>', 'Table of Contents depth', (v) => parseInt(v, 10), 6)
  .option('--no-math', 'Disable MathJax')
  .action(async (inputs: string[], options: CliOptions) => {
    const config = await loadConfig();
    const opts = { ...config, ...options };

    const getFiles = async (): Promise<string[]> => {
      const expanded = await Promise.all(inputs.map(async (i: string) => {
        try {
          const s = await stat(i);
          if (s.isDirectory()) return glob(join(i, '**/*.{md,markdown}'));
        } catch {
          // Ignore
        }
        return glob(i);
      }));
      return [...new Set(expanded.flat().filter(f => /\.(md|markdown)$/i.test(f)))];
    };

    const files = await getFiles();
    if (!files.length) {
      console.error(chalk.red('Error: No input files found.'));
      process.exit(1);
    }
    if (files.length > 1 && opts.output?.endsWith('.pdf')) {
      console.error(chalk.red('Error: Output path cannot be a .pdf file for multiple inputs.'));
      process.exit(1);
    }

    const readTpl = async (p?: string): Promise<string | null> => p ? readFile(resolve(p), 'utf-8') : null;

    const renderer = new Renderer({
      customCss: opts.css ? resolve(opts.css) : null,
      template: opts.template ? resolve(opts.template) : null,
      margin: opts.margin,
      format: opts.format,
      toc: opts.toc,
      tocDepth: opts.tocDepth,
      math: opts.math,
      headerTemplate: await readTpl(opts.header),
      footerTemplate: await readTpl(opts.footer)
    });

    let successCount = 0;
    let failCount = 0;

    const convert = async (file: string): Promise<void> => {
      try {
        const input = resolve(file);
        const inputStat = await stat(input);
        if (inputStat.isDirectory()) return;

        const out = opts.output ? resolve(opts.output) : null;
        let outputPath: string;

        if (out) {
          const outExists = await stat(out).catch(() => null);
          const isExplicitDir = outExists?.isDirectory() || (!out.toLowerCase().endsWith('.pdf'));

          if (files.length > 1 || isExplicitDir) {
            outputPath = join(out, `${basename(input, extname(input))}.pdf`);
          } else {
            outputPath = out;
          }
        } else {
          outputPath = join(dirname(input), `${basename(input, extname(input))}.pdf`);
        }

        await mkdir(dirname(outputPath), { recursive: true });
        console.log(chalk.blue(`Converting ${chalk.bold(file)} → ${chalk.bold(outputPath)}...`));
        await renderer.generatePdf(await readFile(input, 'utf-8'), outputPath, { basePath: dirname(input) });
        console.log(chalk.green(`✔ Done: ${basename(outputPath)}`));
        successCount++;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(chalk.red('Error:'), message);
        failCount++;
      }
    };

    for (const f of files) await convert(f);

    const cleanup = async (): Promise<void> => {
      console.log(chalk.yellow('\nGracefully shutting down...'));
      await renderer.close();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

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
      if (successCount) console.log(chalk.green(`\n✔ Successfully converted ${successCount} file(s).`));
      if (failCount) {
        console.log(chalk.red(`\n✖ Failed to convert ${failCount} file(s).`));
        process.exit(1);
      }
    }
  });

program.parse();
