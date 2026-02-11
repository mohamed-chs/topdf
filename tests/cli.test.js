import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, resolve } from 'path';

const bin = resolve('bin/topdf.js');
const out = resolve('tests/output_cli');

describe('CLI', () => {
  beforeAll(() => { if (!existsSync(out)) mkdirSync(out, { recursive: true }); });

  it('converts single file', { timeout: 30000 }, () => {
    execSync(`node ${bin} examples/test.md -o ${out}/test.pdf`);
    expect(existsSync(`${out}/test.pdf`)).toBe(true);
  });

  it('converts multiple files & globs', { timeout: 60000 }, () => {
    execSync(`node ${bin} "examples/*.md" -o ${out}`);
    expect(existsSync(`${out}/test.pdf`)).toBe(true);
    expect(existsSync(`${out}/second.pdf`)).toBe(true);
  });

  it('generates TOC via flag', { timeout: 30000 }, () => {
    execSync(`node ${bin} examples/test.md -o ${out}/toc.pdf --toc`);
    expect(existsSync(`${out}/toc.pdf`)).toBe(true);
  });

  it('uses custom CSS, header, footer', { timeout: 30000 }, () => {
    execSync(`node ${bin} examples/test.md -o ${out}/ext.pdf --css src/styles/github.css --header examples/comprehensive/header.html --footer examples/comprehensive/footer.html`);
    expect(existsSync(`${out}/ext.pdf`)).toBe(true);
  });

  it('respects .topdfrc', { timeout: 30000 }, () => {
    const d = join(out, 'cfg');
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'i.md'), '# C');
    writeFileSync(join(d, '.topdfrc.yaml'), 'margin: 10mm');
    execSync(`node ${bin} i.md`, { cwd: d });
    expect(existsSync(join(d, 'i.pdf'))).toBe(true);
  });

  it('fails on no inputs', () => {
    expect(() => execSync(`node ${bin} nope.md`, { stdio: 'pipe' })).toThrow();
  });
});