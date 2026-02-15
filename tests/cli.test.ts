import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'fs';
import { mkdtemp, mkdir, readdir, rm, writeFile, stat, utimes } from 'fs/promises';
import { execFileSync } from 'child_process';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const bin = resolve('dist/bin/convpdf.js');

const runCli = (args: string[], cwd?: string): string => {
  const output = execFileSync('node', [bin, ...args], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf-8'
  });
  return output.trim();
};

const runCliExpectFailure = (args: string[], cwd?: string): string => {
  try {
    runCli(args, cwd);
    throw new Error('Expected CLI command to fail but it succeeded.');
  } catch (error: unknown) {
    if (!(error instanceof Error)) return String(error);
    const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '';
    const stdout = 'stdout' in error && typeof error.stdout === 'string' ? error.stdout : '';
    return `${stdout}\n${stderr}`.trim();
  }
};

describe('CLI', () => {
  beforeAll(() => {
    if (!existsSync(bin)) {
      execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
    }
  });

  it('converts a single markdown file to explicit output path', { timeout: 30000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-single-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Hello\n\nTest');
      runCli(['doc.md', '-o', 'result.pdf'], dir);
      expect(existsSync(join(dir, 'result.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('converts multiple files from glob into an output directory', { timeout: 60000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-glob-'));
    try {
      await writeFile(join(dir, 'a.md'), '# A');
      await writeFile(join(dir, 'b.markdown'), '# B');
      runCli(['*.m*', '-o', 'out'], dir);
      expect(existsSync(join(dir, 'out', 'a.pdf'))).toBe(true);
      expect(existsSync(join(dir, 'out', 'b.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('uses config file with relative custom css path', { timeout: 30000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-config-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Config Driven');
      await writeFile(join(dir, 'style.css'), 'h1 { color: red; }');
      await writeFile(join(dir, '.convpdfrc.yaml'), 'css: ./style.css\nmargin: 10mm\ntoc: true\n');
      runCli(['doc.md', '-o', 'doc.pdf'], dir);
      expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails on malformed config with actionable error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-badcfg-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# C');
      await writeFile(join(dir, '.convpdfrc.yaml'), 'margin: [');
      const output = runCliExpectFailure(['doc.md'], dir);
      expect(output).toContain('Failed to parse config');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails when config uses removed math/mermaid toggles', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-removed-config-toggles-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# C');
      await writeFile(join(dir, '.convpdfrc.yaml'), 'math: false');
      const output = runCliExpectFailure(['doc.md'], dir);
      expect(output).toContain('math');
      expect(output).toContain('no longer supported');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails when single output pdf is used with expandable inputs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-output-'));
    try {
      await writeFile(join(dir, 'a.md'), '# A');
      await writeFile(join(dir, 'b.md'), '# B');
      const output = runCliExpectFailure(['*.md', '-o', 'single.pdf'], dir);
      expect(output).toContain('can expand to multiple markdown files');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails on invalid paper format with clear error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-format-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Hello');
      const output = runCliExpectFailure(['doc.md', '--format', 'INVALID'], dir);
      expect(output).toContain('Invalid paper format');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('cleans temporary html files after conversion', { timeout: 30000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-cleanup-'));
    try {
      const beforeTmpEntries = new Set(
        (await readdir(tmpdir())).filter((entry) => entry.startsWith('convpdf-'))
      );
      await writeFile(join(dir, 'doc.md'), '# Image\n\n![x](./pixel.png)');
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64'
      );
      await writeFile(join(dir, 'pixel.png'), png);
      runCli(['doc.md', '-o', 'doc.pdf'], dir);

      const leftoverTmpEntries = (await readdir(tmpdir())).filter(
        (entry) => entry.startsWith('convpdf-') && !beforeTmpEntries.has(entry)
      );
      expect(leftoverTmpEntries).toEqual([]);
      expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails on missing inputs', () => {
    const output = runCliExpectFailure(['nope.md']);
    expect(output).toContain('No input markdown files found');
  });

  it('supports custom templates', { timeout: 30000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-template-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Title');
      await writeFile(
        join(dir, 'template.html'),
        '<!DOCTYPE html><html><head><title>{{title}}</title></head><body>{{content}}</body></html>'
      );
      runCli(['doc.md', '--template', 'template.html', '-o', 'doc.pdf'], dir);
      expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('renders mermaid diagrams in generated PDFs', { timeout: 30000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-mermaid-'));
    try {
      await writeFile(join(dir, 'diagram.md'), '```mermaid\ngraph TD;\nA --> B;\n```');
      runCli(['diagram.md', '-o', 'diagram.pdf'], dir);
      expect(existsSync(join(dir, 'diagram.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('honors toc depth validation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-tocdepth-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# A\n## B');
      const output = runCliExpectFailure(['doc.md', '--toc-depth', '0'], dir);
      expect(output).toContain('between 1 and 6');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects malformed integer values for toc depth', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-tocdepth-invalid-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# A');
      const output = runCliExpectFailure(['doc.md', '--toc-depth', '2abc'], dir);
      expect(output).toContain('Invalid integer');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects malformed integer values for concurrency', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-concurrency-invalid-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# A');
      const output = runCliExpectFailure(['doc.md', '-j', '2abc'], dir);
      expect(output).toContain('Invalid integer');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('caps concurrency to avoid runaway resource usage', { timeout: 60000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-concurrency-cap-'));
    try {
      await writeFile(join(dir, '1.md'), '# 1');
      await writeFile(join(dir, '2.md'), '# 2');
      const output = runCli(['*.md', '-j', '999'], dir);
      expect(output).toContain('Requested concurrency 999 is out of range. Using 32');
      expect(existsSync(join(dir, '1.pdf'))).toBe(true);
      expect(existsSync(join(dir, '2.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects removed math/mermaid CLI toggles', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-removed-flags-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# A');
      const output = runCliExpectFailure(['doc.md', '--no-math'], dir);
      expect(output).toContain('unknown option');
      expect(output).toContain('--no-math');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails when output directory mapping would collide', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-collision-'));
    try {
      await mkdir(join(dir, 'a'), { recursive: true });
      await mkdir(join(dir, 'b'), { recursive: true });
      await writeFile(join(dir, 'a', 'doc.md'), '# A');
      await writeFile(join(dir, 'b', 'doc.md'), '# B');
      // Passing directories will NOT collide because they mirror: out/a/doc.pdf, out/b/doc.pdf
      // But passing the files directly with their containing dirs as bases (which is what happens if you pass them as files)
      // MIGHT collide if the base ends up being the parent of doc.md.
      // Actually, to force a collision now, we'd need them to have the same relative path from their respective bases.
      // E.g. base1="a", file1="a/doc.md" -> relative="doc.md"
      //      base2="b", file2="b/doc.md" -> relative="doc.md"
      const output = runCliExpectFailure(['a/doc.md', 'b/doc.md', '-o', 'out'], dir);
      expect(output).toContain('Output path collision');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('preserves directory structure in output directory', { timeout: 30000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-mirror-'));
    try {
      await mkdir(join(dir, 'docs', 'sub'), { recursive: true });
      await writeFile(join(dir, 'docs', 'a.md'), '# A');
      await writeFile(join(dir, 'docs', 'sub', 'b.md'), '# B');
      runCli(['docs', '-o', 'out'], dir);
      expect(existsSync(join(dir, 'out', 'a.pdf'))).toBe(true);
      expect(existsSync(join(dir, 'out', 'sub', 'b.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reads custom header and footer templates', { timeout: 30000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-header-footer-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Doc');
      await writeFile(join(dir, 'header.html'), '<div style="font-size:8px">H</div>');
      await writeFile(
        join(dir, 'footer.html'),
        '<div style="font-size:8px"><span class="pageNumber"></span></div>'
      );
      runCli(
        ['doc.md', '--header', 'header.html', '--footer', 'footer.html', '-o', 'doc.pdf'],
        dir
      );
      expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes output next to markdown by default', { timeout: 30000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-default-output-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Local Output');
      runCli(['doc.md'], dir);
      expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it(
    'preserves file timestamps when --preserve-timestamp is used',
    { timeout: 30000 },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-timestamp-'));
      try {
        const mdPath = join(dir, 'doc.md');
        const pdfPath = join(dir, 'doc.pdf');
        await writeFile(mdPath, '# Timestamp');

        // Set a specific past date: 2025-01-01 00:00:00
        const pastDate = new Date(2025, 0, 1, 0, 0, 0);
        await utimes(mdPath, pastDate, pastDate);

        runCli(['doc.md', '--preserve-timestamp'], dir);

        expect(existsSync(pdfPath)).toBe(true);
        const pdfStat = await stat(pdfPath);

        // We compare timestamps in seconds to avoid sub-millisecond precision issues
        // that might occur depending on the filesystem.
        expect(Math.floor(pdfStat.mtime.getTime() / 1000)).toBe(
          Math.floor(pastDate.getTime() / 1000)
        );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  );

  it('converts multiple files concurrently with -j', { timeout: 60000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'convpdf-cli-concurrency-'));
    try {
      await writeFile(join(dir, '1.md'), '# 1');
      await writeFile(join(dir, '2.md'), '# 2');
      await writeFile(join(dir, '3.md'), '# 3');
      const output = runCli(['*.md', '-j', '2'], dir);
      expect(existsSync(join(dir, '1.pdf'))).toBe(true);
      expect(existsSync(join(dir, '2.pdf'))).toBe(true);
      expect(existsSync(join(dir, '3.pdf'))).toBe(true);
      expect(output).toContain('Converting');
      expect(output).toContain('Successfully converted 3 file(s).');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
