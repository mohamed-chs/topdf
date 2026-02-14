#!/usr/bin/env node
import { Command } from 'commander';
import { readFile, stat, mkdir, utimes } from 'fs/promises';
import { resolve, basename, extname, join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { glob } from 'glob';
import chokidar, { type FSWatcher } from 'chokidar';
import yaml from 'js-yaml';
import pLimit from 'p-limit';
import { Renderer } from '../src/renderer.js';
import type { RendererOptions } from '../src/types.js';
import { normalizeTocDepth } from '../src/utils/validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
const pkg = JSON.parse(await readFile(await findPackageJson(__dirname), 'utf-8')) as {
  version: string;
};

interface CliOptions {
  output?: string;
  watch?: boolean;
  css?: string;
  template?: string;
  margin?: string;
  format?: RendererOptions['format'];
  header?: string;
  footer?: string;
  toc?: boolean;
  tocDepth?: number;
  math?: boolean;
  executablePath?: string;
  preserveTimestamp?: boolean;
  concurrency?: number;
}

interface ConfigFile extends RendererOptions {
  header?: string;
  footer?: string;
  css?: string;
}

interface LoadedConfig {
  values: ConfigFile;
  sourcePath: string | null;
}

type OutputMode = 'adjacent' | 'directory' | 'single-file';

interface OutputStrategy {
  mode: OutputMode;
  targetPath: string | null;
}

interface InputDescriptor {
  raw: string;
  absolute: string;
  hasGlobMagic: boolean;
  isDirectory: boolean;
}

const program = new Command();
const hasGlobMagic = (value: string): boolean => /[*?[\]{}()]/.test(value);

const parseInteger = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer "${value}"`);
  }
  return parsed;
};

const loadConfig = async (): Promise<LoadedConfig> => {
  const candidates = ['.convpdfrc', '.convpdfrc.json', '.convpdfrc.yaml', '.convpdfrc.yml'];
  for (const candidate of candidates) {
    const configPath = resolve(candidate);
    try {
      const raw = await readFile(configPath, 'utf-8');
      const parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
      if (!parsed) return { values: {}, sourcePath: configPath };
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Expected object at root of config, got ${typeof parsed}`);
      }

      const config = parsed as ConfigFile;
      const configDir = dirname(configPath);
      if (config.css) config.css = resolve(configDir, config.css);
      if (config.template) config.template = resolve(configDir, config.template);
      if (config.header) config.header = resolve(configDir, config.header);
      if (config.footer) config.footer = resolve(configDir, config.footer);
      return { values: config, sourcePath: configPath };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        continue;
      }
      throw new Error(
        `Failed to parse config "${relative(process.cwd(), configPath)}": ${message}`
      );
    }
  }
  return { values: {}, sourcePath: null };
};

const describeInputs = async (inputs: string[]): Promise<InputDescriptor[]> =>
  Promise.all(
    inputs.map(async (raw) => {
      const absolute = resolve(raw);
      try {
        const stats = await stat(absolute);
        return {
          raw,
          absolute,
          hasGlobMagic: hasGlobMagic(raw),
          isDirectory: stats.isDirectory()
        };
      } catch {
        return {
          raw,
          absolute,
          hasGlobMagic: hasGlobMagic(raw),
          isDirectory: false
        };
      }
    })
  );

const resolveMarkdownFiles = async (inputs: InputDescriptor[]): Promise<string[]> => {
  const matches = await Promise.all(
    inputs.map(async (input) => {
      try {
        const stats = await stat(input.absolute);
        if (stats.isFile()) return [input.absolute];
        if (stats.isDirectory()) {
          return glob('**/*.{md,markdown}', {
            cwd: input.absolute,
            nodir: true,
            absolute: true
          });
        }
      } catch {
        // If the direct path doesn't exist, treat it as a glob expression.
      }

      return glob(input.raw, { nodir: true, absolute: true });
    })
  );

  return [...new Set(matches.flat().filter((value) => /\.(md|markdown)$/i.test(value)))].sort(
    (a, b) => a.localeCompare(b)
  );
};

const resolveOutputStrategy = (
  outputPath: string | undefined,
  inputs: InputDescriptor[]
): OutputStrategy => {
  if (!outputPath) return { mode: 'adjacent', targetPath: null };
  const absolute = resolve(outputPath);
  if (!absolute.toLowerCase().endsWith('.pdf')) {
    return { mode: 'directory', targetPath: absolute };
  }

  const maybeMultiple =
    inputs.length > 1 || inputs.some((input) => input.isDirectory || input.hasGlobMagic);
  if (maybeMultiple) {
    throw new Error(
      'Output path cannot be a single .pdf file when inputs can expand to multiple markdown files.'
    );
  }

  return { mode: 'single-file', targetPath: absolute };
};

const toOutputPath = (inputPath: string, strategy: OutputStrategy): string => {
  if (strategy.mode === 'adjacent') {
    return join(dirname(inputPath), `${basename(inputPath, extname(inputPath))}.pdf`);
  }
  if (strategy.mode === 'single-file') {
    if (!strategy.targetPath) throw new Error('Single file output path is missing');
    return strategy.targetPath;
  }
  if (!strategy.targetPath) throw new Error('Output directory path is missing');
  return join(strategy.targetPath, `${basename(inputPath, extname(inputPath))}.pdf`);
};

const readTemplate = async (pathValue?: string): Promise<string | null> => {
  if (!pathValue) return null;
  try {
    return await readFile(resolve(pathValue), 'utf-8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read template file "${pathValue}": ${message}`);
  }
};

class ConversionQueue {
  private pending = new Set<string>();

  constructor(private limit: ReturnType<typeof pLimit>) {}

  enqueue(filePath: string, convert: (file: string) => Promise<void>): void {
    if (this.pending.has(filePath)) return;
    this.pending.add(filePath);
    void this.limit(async () => {
      try {
        await convert(filePath);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red('Queue error:'), message);
      } finally {
        this.pending.delete(filePath);
      }
    });
  }
}

program
  .name('convpdf')
  .description('Convert Markdown to high-quality PDF.')
  .version(pkg.version)
  .argument('<inputs...>', 'Input markdown files or glob patterns')
  .option('-o, --output <path>', 'Output directory or file path')
  .option('-w, --watch', 'Watch for changes')
  .option('-c, --css <path>', 'Custom CSS')
  .option('-t, --template <path>', 'Custom HTML template')
  .option('-m, --margin <margin>', 'Page margin', '15mm 10mm')
  .option('-f, --format <format>', 'PDF format', 'A4')
  .option('--header <path>', 'Custom header template')
  .option('--footer <path>', 'Custom footer template')
  .option('--toc', 'Generate Table of Contents')
  .option('--toc-depth <depth>', 'Table of Contents depth', parseInteger)
  .option('--no-math', 'Disable MathJax')
  .option('--executable-path <path>', 'Puppeteer browser executable path')
  .option('--preserve-timestamp', 'Preserve modification time from markdown file')
  .option('-j, --concurrency <number>', 'Number of concurrent conversions', parseInteger, 1)
  .action(async (inputs: string[], options: CliOptions) => {
    let watcher: FSWatcher | null = null;
    const cleanup = async (): Promise<void> => {
      if (watcher) await watcher.close().catch(() => {});
    };

    try {
      const config = await loadConfig();
      if (config.sourcePath) {
        console.log(chalk.gray(`Using config: ${relative(process.cwd(), config.sourcePath)}`));
      }

      const opts = { ...config.values, ...options };
      if (opts.tocDepth !== undefined) {
        opts.tocDepth = normalizeTocDepth(opts.tocDepth);
      }

      const concurrency = Math.max(1, opts.concurrency ?? 1);
      const limit = pLimit(concurrency);

      const describedInputs = await describeInputs(inputs);
      const outputStrategy = resolveOutputStrategy(opts.output, describedInputs);
      const files = await resolveMarkdownFiles(describedInputs);
      if (!files.length) {
        throw new Error('No input markdown files found.');
      }

      const firstInput = describedInputs[0];
      const singleInput =
        describedInputs.length === 1 &&
        firstInput &&
        !firstInput.isDirectory &&
        !firstInput.hasGlobMagic
          ? firstInput.absolute
          : null;

      const renderer = new Renderer({
        customCss: opts.css ? resolve(opts.css) : null,
        template: opts.template ? resolve(opts.template) : null,
        margin: opts.margin,
        format: opts.format,
        toc: opts.toc,
        tocDepth: opts.tocDepth,
        math: opts.math,
        headerTemplate: await readTemplate(opts.header),
        footerTemplate: await readTemplate(opts.footer),
        executablePath: opts.executablePath
      });

      const counts = { success: 0, fail: 0 };

      const convert = async (filePath: string): Promise<void> => {
        try {
          const inputPath = resolve(filePath);
          const inputStat = await stat(inputPath);
          if (!inputStat.isFile()) return;

          const relInput = relative(process.cwd(), inputPath);

          if (outputStrategy.mode === 'single-file' && singleInput && inputPath !== singleInput) {
            console.log(
              chalk.yellow(
                `Skipping ${relInput}: output is configured as a single PDF file for ${relative(
                  process.cwd(),
                  singleInput
                )}.`
              )
            );
            return;
          }

          const outputPath = toOutputPath(inputPath, outputStrategy);
          const relOutput = relative(process.cwd(), outputPath);

          await mkdir(dirname(outputPath), { recursive: true });
          console.log(chalk.blue(`Converting ${chalk.bold(relInput)} -> ${chalk.bold(relOutput)}...`));
          const markdown = await readFile(inputPath, 'utf-8');
          await renderer.generatePdf(markdown, outputPath, { basePath: dirname(inputPath) });

          if (opts.preserveTimestamp) {
            await utimes(outputPath, inputStat.atime, inputStat.mtime);
          }

          console.log(chalk.green(`Done: ${basename(outputPath)}`));
          counts.success++;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`Failed (${relative(process.cwd(), filePath)}): ${message}`));
          counts.fail++;
        }
      };

      await Promise.all(files.map((filePath) => limit(() => convert(filePath))));

      const onSignal = async (): Promise<void> => {
        console.log(chalk.yellow('\nGracefully shutting down...'));
        await cleanup();
        await renderer.close();
        process.exit(0);
      };
      process.on('SIGINT', () => {
        void onSignal();
      });
      process.on('SIGTERM', () => {
        void onSignal();
      });

      if (opts.watch) {
        console.log(chalk.yellow('\nWatching for changes... (Press Ctrl+C to stop)'));
        const queue = new ConversionQueue(limit);
        watcher = chokidar.watch(inputs, {
          ignored: /(^|[\/\\])\../,
          persistent: true,
          ignoreInitial: true
        });
        watcher.on('all', (event: string, changedPath: string) => {
          if (!['add', 'change'].includes(event) || !/\.(md|markdown)$/i.test(changedPath)) return;
          const absoluteChangedPath = resolve(changedPath);
          console.log(
            chalk.cyan(
              `\n${event === 'add' ? 'New file' : 'Change'} detected: ${relative(
                process.cwd(),
                absoluteChangedPath
              )}`
            )
          );
          queue.enqueue(absoluteChangedPath, convert);
        });
      } else {
        await renderer.close();
        if (counts.success) {
          console.log(chalk.green(`\nSuccessfully converted ${counts.success} file(s).`));
        }
        if (counts.fail) {
          throw new Error(`Failed to convert ${counts.fail} file(s).`);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('Error:'), message);
      await cleanup();
      process.exit(1);
    }
  });

program.parse();
