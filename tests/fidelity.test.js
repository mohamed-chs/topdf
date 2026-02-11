import { describe, it, expect, beforeEach } from 'vitest';
import { Renderer } from '../src/renderer.js';

describe('Renderer Fidelity', () => {
  let renderer;
  beforeEach(() => {
    renderer = new Renderer();
  });

  it('should render complex nested lists correctly', async () => {
    const md = `
1. Item 1
    - Subitem 1.1
    - Subitem 1.2
        1. Sub-subitem 1.2.1
2. Item 2
`;
    const html = await renderer.renderHtml(md);
    expect(html).toContain('<ol>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Subitem 1.1</li>');
  });

  it('should detect complex math triggers', async () => {
    const md = 'The formula is \\\\( x^2 + y^2 = z^2 \\\\) or \\\\[ E = mc^2 \\\\].';
    const html = await renderer.renderHtml(md);
    expect(html).toContain('MathJax-script');
  });

  it('should handle GFM task lists', async () => {
    const md = `
- [x] Task 1
- [ ] Task 2
`;
    const html = await renderer.renderHtml(md);
    // Marked handles task lists if gfm is true
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
  });

  it('should handle tables with alignment', async () => {
    const md = `
| Left | Center | Right |
|:-----|:------:|------:|
| L    | C      | R     |
`;
    const html = await renderer.renderHtml(md);
    expect(html).toContain('align="left"');
    expect(html).toContain('align="center"');
    expect(html).toContain('align="right"');
  });
});
