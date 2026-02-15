import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, resolve } from 'path';
import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

const bin = resolve('dist/bin/convpdf.js');

interface CliRunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

interface CliResult {
  stdout: string;
  stderr: string;
  combined: string;
}

const runCli = (args: string[], options: CliRunOptions): CliResult => {
  const stdout = execFileSync('node', [bin, ...args], {
    cwd: options.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf-8',
    timeout: 120000,
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      ...options.env
    }
  }).trim();

  return {
    stdout,
    stderr: '',
    combined: stdout
  };
};

const runCliExpectFailure = (args: string[], options: CliRunOptions): CliResult => {
  try {
    runCli(args, options);
    throw new Error('Expected CLI command to fail but it succeeded.');
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      const text = String(error);
      return { stdout: '', stderr: text, combined: text };
    }

    const stdout = 'stdout' in error && typeof error.stdout === 'string' ? error.stdout.trim() : '';
    const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr.trim() : '';
    const combined = [stdout, stderr].filter(Boolean).join('\n');

    return { stdout, stderr, combined };
  }
};

describe.sequential('CLI', () => {
  let suiteRoot = '';
  let caseId = 0;

  const createCaseDir = async (label: string): Promise<string> => {
    caseId += 1;
    const dir = join(suiteRoot, `${String(caseId).padStart(2, '0')}-${label}`);
    await mkdir(dir, { recursive: true });
    return dir;
  };

  beforeAll(async () => {
    suiteRoot = await mkdtemp(join(tmpdir(), 'convpdf-cli-suite-'));
    if (!existsSync(bin)) {
      execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
    }
  });

  afterAll(async () => {
    if (suiteRoot) {
      await rm(suiteRoot, { recursive: true, force: true });
    }
  });

  it('converts a single markdown file to explicit output path', { timeout: 40000 }, async () => {
    const dir = await createCaseDir('single-output');
    await writeFile(join(dir, 'doc.md'), '# Hello\n\nTest');

    runCli(['doc.md', '-o', 'result.pdf'], { cwd: dir });

    expect(existsSync(join(dir, 'result.pdf'))).toBe(true);
  });

  it('converts a glob batch into an output directory', { timeout: 60000 }, async () => {
    const dir = await createCaseDir('glob-output-dir');
    await writeFile(join(dir, 'a.md'), '# A');
    await writeFile(join(dir, 'b.markdown'), '# B');

    const result = runCli(['*.m*', '-o', 'out', '-j', '2'], { cwd: dir });

    expect(existsSync(join(dir, 'out', 'a.pdf'))).toBe(true);
    expect(existsSync(join(dir, 'out', 'b.pdf'))).toBe(true);
    expect(result.combined).toContain('Successfully converted 2 file(s).');
  });

  it('uses config file with relative custom css path', { timeout: 40000 }, async () => {
    const dir = await createCaseDir('config-relative-paths');
    await writeFile(join(dir, 'doc.md'), '# Config Driven');
    await writeFile(join(dir, 'style.css'), 'h1 { color: red; }');
    await writeFile(join(dir, '.convpdfrc.yaml'), 'css: ./style.css\nmargin: 10mm\ntoc: true\n');

    const result = runCli(['doc.md', '-o', 'doc.pdf'], { cwd: dir });

    expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
    expect(result.combined).toContain('Using config: .convpdfrc.yaml');
  });

  it('fails on malformed config with actionable error', async () => {
    const dir = await createCaseDir('bad-config');
    await writeFile(join(dir, 'doc.md'), '# C');
    await writeFile(join(dir, '.convpdfrc.yaml'), 'margin: [');

    const result = runCliExpectFailure(['doc.md'], { cwd: dir });

    expect(result.combined).toContain('Failed to parse config');
  });

  it('fails when config uses removed math/mermaid toggles', async () => {
    const dir = await createCaseDir('removed-config-toggles');
    await writeFile(join(dir, 'doc.md'), '# C');
    await writeFile(join(dir, '.convpdfrc.yaml'), 'math: false');

    const result = runCliExpectFailure(['doc.md'], { cwd: dir });

    expect(result.combined).toContain('math');
    expect(result.combined).toContain('no longer supported');
  });

  it('fails when single output pdf is used with expandable inputs', async () => {
    const dir = await createCaseDir('single-pdf-with-glob');
    await writeFile(join(dir, 'a.md'), '# A');
    await writeFile(join(dir, 'b.md'), '# B');

    const result = runCliExpectFailure(['*.md', '-o', 'single.pdf'], { cwd: dir });

    expect(result.combined).toContain('can expand to multiple markdown files');
  });

  it('fails on invalid paper format with clear error', async () => {
    const dir = await createCaseDir('invalid-format');
    await writeFile(join(dir, 'doc.md'), '# Hello');

    const result = runCliExpectFailure(['doc.md', '--format', 'INVALID'], { cwd: dir });

    expect(result.combined).toContain('Invalid paper format');
  });

  it(
    'cleans temporary html files after conversion (TMPDIR scoped)',
    { timeout: 50000 },
    async () => {
      const dir = await createCaseDir('tmp-cleanup');
      const isolatedTmp = join(dir, '.tmp');
      await mkdir(isolatedTmp, { recursive: true });

      await writeFile(join(dir, 'doc.md'), '# Image\n\n![x](./pixel.png)');
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64'
      );
      await writeFile(join(dir, 'pixel.png'), png);

      runCli(['doc.md', '-o', 'doc.pdf'], {
        cwd: dir,
        env: {
          TMPDIR: isolatedTmp,
          TMP: isolatedTmp,
          TEMP: isolatedTmp
        }
      });

      const leftovers = (await readdir(isolatedTmp)).filter((entry) =>
        entry.startsWith('convpdf-')
      );
      expect(leftovers).toEqual([]);
      expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
    }
  );

  it('fails on missing inputs', async () => {
    const dir = await createCaseDir('missing-inputs');
    const result = runCliExpectFailure(['nope.md'], { cwd: dir });
    expect(result.combined).toContain('No input markdown files found');
  });

  it('supports custom templates with header and footer', { timeout: 50000 }, async () => {
    const dir = await createCaseDir('template-header-footer');
    await writeFile(join(dir, 'doc.md'), '# Title');
    await writeFile(
      join(dir, 'template.html'),
      '<!DOCTYPE html><html><head><title>{{title}}</title></head><body>{{content}}</body></html>'
    );
    await writeFile(join(dir, 'header.html'), '<div style="font-size:8px">H</div>');
    await writeFile(
      join(dir, 'footer.html'),
      '<div style="font-size:8px"><span class="pageNumber"></span></div>'
    );

    runCli(
      [
        'doc.md',
        '--template',
        'template.html',
        '--header',
        'header.html',
        '--footer',
        'footer.html',
        '-o',
        'doc.pdf'
      ],
      { cwd: dir }
    );

    expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
  });

  it('renders mermaid diagrams in generated PDFs', { timeout: 50000 }, async () => {
    const dir = await createCaseDir('mermaid');
    await writeFile(join(dir, 'diagram.md'), '```mermaid\ngraph TD;\nA --> B;\n```');

    runCli(['diagram.md', '-o', 'diagram.pdf'], { cwd: dir });

    expect(existsSync(join(dir, 'diagram.pdf'))).toBe(true);
  });

  it('honors toc depth validation and integer parsing errors', async () => {
    const dir = await createCaseDir('toc-and-int-validation');
    await writeFile(join(dir, 'doc.md'), '# A\n## B');

    const badDepth = runCliExpectFailure(['doc.md', '--toc-depth', '0'], { cwd: dir });
    expect(badDepth.combined).toContain('between 1 and 6');

    const badTocInteger = runCliExpectFailure(['doc.md', '--toc-depth', '2abc'], { cwd: dir });
    expect(badTocInteger.combined).toContain('Invalid integer');

    const badConcurrencyInteger = runCliExpectFailure(['doc.md', '-j', '2abc'], { cwd: dir });
    expect(badConcurrencyInteger.combined).toContain('Invalid integer');
  });

  it('caps concurrency to avoid runaway resource usage', { timeout: 60000 }, async () => {
    const dir = await createCaseDir('concurrency-cap');
    await writeFile(join(dir, '1.md'), '# 1');
    await writeFile(join(dir, '2.md'), '# 2');

    const result = runCli(['*.md', '-j', '999'], { cwd: dir });

    expect(result.combined).toContain('Requested concurrency 999 is out of range. Using 32');
    expect(existsSync(join(dir, '1.pdf'))).toBe(true);
    expect(existsSync(join(dir, '2.pdf'))).toBe(true);
  });

  it('rejects removed math/mermaid CLI toggles', async () => {
    const dir = await createCaseDir('removed-cli-flags');
    await writeFile(join(dir, 'doc.md'), '# A');

    const result = runCliExpectFailure(['doc.md', '--no-math'], { cwd: dir });

    expect(result.combined).toContain('unknown option');
    expect(result.combined).toContain('--no-math');
  });

  it('fails when output directory mapping would collide', async () => {
    const dir = await createCaseDir('output-collision');
    await mkdir(join(dir, 'a'), { recursive: true });
    await mkdir(join(dir, 'b'), { recursive: true });
    await writeFile(join(dir, 'a', 'doc.md'), '# A');
    await writeFile(join(dir, 'b', 'doc.md'), '# B');

    const result = runCliExpectFailure(['a/doc.md', 'b/doc.md', '-o', 'out'], { cwd: dir });

    expect(result.combined).toContain('Output path collision');
  });

  it('preserves directory structure in output directory', { timeout: 50000 }, async () => {
    const dir = await createCaseDir('preserve-structure');
    await mkdir(join(dir, 'docs', 'sub'), { recursive: true });
    await writeFile(join(dir, 'docs', 'a.md'), '# A');
    await writeFile(join(dir, 'docs', 'sub', 'b.md'), '# B');

    runCli(['docs', '-o', 'out'], { cwd: dir });

    expect(existsSync(join(dir, 'out', 'a.pdf'))).toBe(true);
    expect(existsSync(join(dir, 'out', 'sub', 'b.pdf'))).toBe(true);
  });

  it('writes output next to markdown by default', { timeout: 40000 }, async () => {
    const dir = await createCaseDir('default-output');
    await writeFile(join(dir, 'doc.md'), '# Local Output');

    runCli(['doc.md'], { cwd: dir });

    expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
  });

  it(
    'preserves file timestamps when --preserve-timestamp is used',
    { timeout: 40000 },
    async () => {
      const dir = await createCaseDir('preserve-timestamp');
      const mdPath = join(dir, 'doc.md');
      const pdfPath = join(dir, 'doc.pdf');
      await writeFile(mdPath, '# Timestamp');

      const pastDate = new Date(2025, 0, 1, 0, 0, 0);
      await utimes(mdPath, pastDate, pastDate);

      runCli(['doc.md', '--preserve-timestamp'], { cwd: dir });

      expect(existsSync(pdfPath)).toBe(true);
      const pdfStats = await stat(pdfPath);
      expect(Math.floor(pdfStats.mtime.getTime() / 1000)).toBe(
        Math.floor(pastDate.getTime() / 1000)
      );
    }
  );
});
