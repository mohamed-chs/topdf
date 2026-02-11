import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const binPath = join(rootDir, 'bin/topdf.js');

describe('topdf CLI Comprehensive', () => {
  const outputDir = join(__dirname, 'output_cli');
  
  beforeAll(() => {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up output files after each test if needed
  });

  it('should convert multiple files', { timeout: 60000 }, () => {
    const file1 = join(rootDir, 'examples/test.md');
    const file2 = join(rootDir, 'examples/second.md');
    execSync(`node ${binPath} ${file1} ${file2} -o ${outputDir}`);
    
    expect(existsSync(join(outputDir, 'test.pdf'))).toBe(true);
    expect(existsSync(join(outputDir, 'second.pdf'))).toBe(true);
  });

  it('should support glob patterns', { timeout: 60000 }, () => {
    const globPattern = join(rootDir, 'examples/*.md');
    execSync(`node ${binPath} "${globPattern}" -o ${outputDir}`);
    
    expect(existsSync(join(outputDir, 'test.pdf'))).toBe(true);
    expect(existsSync(join(outputDir, 'second.pdf'))).toBe(true);
  });

  it('should generate TOC via flag', { timeout: 60000 }, () => {
    const input = join(rootDir, 'examples/test.md');
    const output = join(outputDir, 'test_toc.pdf');
    execSync(`node ${binPath} ${input} -o ${output} --toc`);
    
    expect(existsSync(output)).toBe(true);
  });

  it('should use custom CSS', { timeout: 60000 }, () => {
    const input = join(rootDir, 'examples/test.md');
    const css = join(rootDir, 'src/styles/github.css');
    const output = join(outputDir, 'test_css.pdf');
    execSync(`node ${binPath} ${input} -o ${output} --css ${css}`);
    
    expect(existsSync(output)).toBe(true);
  });

  it('should use custom header and footer', { timeout: 60000 }, () => {
    const input = join(rootDir, 'examples/test.md');
    const header = join(rootDir, 'examples/comprehensive/header.html');
    const footer = join(rootDir, 'examples/comprehensive/footer.html');
    const output = join(outputDir, 'test_header_footer.pdf');
    execSync(`node ${binPath} ${input} -o ${output} --header ${header} --footer ${footer}`);
    
    expect(existsSync(output)).toBe(true);
  });

  it('should respect .topdfrc config', { timeout: 60000 }, () => {
    const testDir = join(outputDir, 'config_test');
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    
    const input = join(testDir, 'index.md');
    writeFileSync(input, '# Config Test');
    
        const config = join(testDir, '.topdfrc.yaml');
        writeFileSync(config, 'toc: true\nmargin: 30mm');
        
        // We need to run the command from the testDir to pick up .topdfrc
        execSync(`node ${binPath} index.md`, { cwd: testDir });    
    expect(existsSync(join(testDir, 'index.pdf'))).toBe(true);
  });

  it('should fail if no input files found', () => {
    expect(() => {
      execSync(`node ${binPath} non_existent_file.md`, { stdio: 'pipe' });
    }).toThrow();
  });
});
