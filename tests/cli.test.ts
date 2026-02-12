import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'fs';
import { mkdtemp, readdir, rm, writeFile } from 'fs/promises';
import { execFileSync } from 'child_process';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const bin = resolve('dist/bin/topdf.js');

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
    const dir = await mkdtemp(join(tmpdir(), 'topdf-cli-single-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Hello\n\nTest');
      runCli(['doc.md', '-o', 'result.pdf'], dir);
      expect(existsSync(join(dir, 'result.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('converts multiple files from glob into an output directory', { timeout: 60000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'topdf-cli-glob-'));
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
    const dir = await mkdtemp(join(tmpdir(), 'topdf-cli-config-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Config Driven');
      await writeFile(join(dir, 'style.css'), 'h1 { color: red; }');
      await writeFile(join(dir, '.topdfrc.yaml'), 'css: ./style.css\nmargin: 10mm\ntoc: true\n');
      runCli(['doc.md', '-o', 'doc.pdf'], dir);
      expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails on malformed config with actionable error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'topdf-cli-badcfg-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# C');
      await writeFile(join(dir, '.topdfrc.yaml'), 'margin: [');
      const output = runCliExpectFailure(['doc.md'], dir);
      expect(output).toContain('Failed to parse config');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails when single output pdf is used with expandable inputs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'topdf-cli-output-'));
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
    const dir = await mkdtemp(join(tmpdir(), 'topdf-cli-format-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Hello');
      const output = runCliExpectFailure(['doc.md', '--format', 'INVALID'], dir);
      expect(output).toContain('Invalid paper format');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('cleans temporary html files after conversion', { timeout: 30000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'topdf-cli-cleanup-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Image\n\n![x](./pixel.png)');
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64'
      );
      await writeFile(join(dir, 'pixel.png'), png);
      runCli(['doc.md', '-o', 'doc.pdf'], dir);

      const files = await readdir(dir);
      expect(files.some((entry) => entry.startsWith('.topdf-tmp-'))).toBe(false);
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
    const dir = await mkdtemp(join(tmpdir(), 'topdf-cli-template-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Title');
      await writeFile(join(dir, 'template.html'), '<!DOCTYPE html><html><head><title>{{title}}</title></head><body>{{content}}</body></html>');
      runCli(['doc.md', '--template', 'template.html', '-o', 'doc.pdf'], dir);
      expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('honors toc depth validation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'topdf-cli-tocdepth-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# A\n## B');
      const output = runCliExpectFailure(['doc.md', '--toc-depth', '0'], dir);
      expect(output).toContain('between 1 and 6');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reads custom header and footer templates', { timeout: 30000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'topdf-cli-header-footer-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Doc');
      await writeFile(join(dir, 'header.html'), '<div style="font-size:8px">H</div>');
      await writeFile(join(dir, 'footer.html'), '<div style="font-size:8px"><span class="pageNumber"></span></div>');
      runCli(['doc.md', '--header', 'header.html', '--footer', 'footer.html', '-o', 'doc.pdf'], dir);
      expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes output next to markdown by default', { timeout: 30000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'topdf-cli-default-output-'));
    try {
      await writeFile(join(dir, 'doc.md'), '# Local Output');
      runCli(['doc.md'], dir);
      expect(existsSync(join(dir, 'doc.pdf'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
