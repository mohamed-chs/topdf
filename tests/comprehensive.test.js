import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, resolve } from 'path';
import { Renderer } from '../src/renderer.js';

describe('Comprehensive Integration Tests', () => {
  const outputDir = resolve('tests/output_comprehensive');

  beforeAll(() => {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
  });

  it('should convert multiple files in a directory', { timeout: 60000 }, () => {
    // We use quotes around the glob to prevent shell expansion, 
    // letting the application's glob implementation handle it.
    execSync(`node bin/topdf.js "examples/comprehensive/*.md" -o ${outputDir}`);
    
    const expectedFiles = [
      'edge-cases.pdf',
      'math-heavy.pdf',
      'deep-toc.pdf',
      'syntax-bonanza.pdf'
    ];

    expectedFiles.forEach(file => {
      const path = join(outputDir, file);
      const exists = existsSync(path);
      if (!exists) console.error(`Missing expected file: ${path}`);
      expect(exists).toBe(true);
    });
  });

  it('should handle TOC ID collisions correctly', async () => {
    const renderer = new Renderer({ toc: true });
    const md = `
# Duplicate
# Duplicate
# Duplicate
[TOC]`;
    const html = await renderer.renderHtml(md);
    
    expect(html).toContain('id="duplicate"');
    expect(html).toContain('id="duplicate-1"');
    expect(html).toContain('id="duplicate-2"');

    expect(html).toContain('href="#duplicate"');
    expect(html).toContain('href="#duplicate-1"');
    expect(html).toContain('href="#duplicate-2"');
  });

  it('should support explicit page breaks', async () => {
    const renderer = new Renderer();
    const md = `Page 1\n<!-- PAGE_BREAK -->\nPage 2`;
    const html = await renderer.renderHtml(md);
    expect(html).toContain('<div class="page-break"></div>');
  });

  it('should respect frontmatter title over default', async () => {
    const renderer = new Renderer();
    const md = `---
title: Unique Page
---
# Content`;
    const html = await renderer.renderHtml(md);
    expect(html).toContain('<title>Unique Page</title>');
  });

  it('should prioritize [TOC] placement in the middle of content', async () => {
    const renderer = new Renderer();
    const md = `# Header 1\n[TOC]\n## Header 2`;
    const html = await renderer.renderHtml(md);
    
    const tocIndex = html.indexOf('class="toc"');
    const h1Index = html.indexOf('id="header-1"');
    const h2Index = html.indexOf('id="header-2"');

    expect(tocIndex).toBeGreaterThan(h1Index);
    expect(tocIndex).toBeLessThan(h2Index);
  });
});
