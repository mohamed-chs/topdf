import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { join, resolve } from 'path';

describe('topdf CLI', () => {
  const testMd = resolve('examples/test.md');
  const testPdf = resolve('examples/test.pdf');

  afterAll(() => {
    if (existsSync(testPdf)) {
      unlinkSync(testPdf);
    }
  });

  it('should convert a markdown file to pdf', { timeout: 30000 }, () => {
    // Run the CLI
    execSync(`node bin/topdf.js ${testMd} -o ${testPdf}`);
    
    // Check if PDF exists
    expect(existsSync(testPdf)).toBe(true);
  });
});
