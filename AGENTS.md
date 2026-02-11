# Working Guidelines: topdf

**IMPORTANT: EXPLORE THE CODEBASE THOROUGHLY AND ANALYZE ALL SYSTEM DEPENDENCIES BEFORE STARTING ANY TASK.**

## Core Philosophy
- **Robust & Reliable**: Implementation must be correct, well-behaved, and handle edge cases gracefully. No hacks.
- **Sane Defaults**: The tool must work beautifully "out of the box" with zero configuration, while remaining flexible.
- **High Fidelity**: What is rendered in the browser must be exactly what appears in the PDF.
- **Reasonable Performance**: Optimize for efficiency (CPU/Memory) without sacrificing reliability or code clarity.
- **Leverage Ecosystem**: Use high-quality, reliable external dependencies rather than reinventing the wheel. If a library does it better, use it.

## Codebase Overview
- **`bin/topdf.js`**: The CLI entry point. Responsible for command-line argument parsing (Commander), configuration loading (`.topdfrc`), glob pattern expansion, file system orchestration, and the live watch mode (Chokidar).
- **`src/renderer.js`**: The core engine. Manages the lifecycle of the Puppeteer browser, frontmatter extraction (YAML), Markdown lexing and parsing (Marked), Table of Contents (TOC) generation, and HTML/PDF assembly.
- **`src/styles/`**: Contains the design DNA. `default.css` provides the professional document layout, and `github.css` handles syntax highlighting themes.
- **`tests/`**: The quality gate. Consolidated into `unit.test.js` (logic/parsing) and `cli.test.js` (integration/E2E).
- **`examples/`**: Real-world scenarios, edge cases, and feature demonstrations used for both documentation and fidelity testing.

## Testing Strategy
- **Reflexive & Constant**: Test at every step. Do not wait until the end of a feature to write tests.
- **Multi-Layered**:
    - **Unit Tests**: Verify individual functions (Frontmatter, TOC, HTML assembly).
    - **Integration Tests**: Verify the interaction between the Renderer and the file system/Puppeteer.
    - **End-to-End (E2E) Tests**: Verify the full CLI flow from Markdown input to PDF output.
- **Regression Testing**: Always run `npm test` before any modification to establish a baseline and after to ensure no breaks.

## Coding Standards
- **ESM Everything**: Strict adherence to ES Modules.
- **Clarity over Cleverness**: Code should be intuitive, readable, and easy to maintain. Avoid unnecessary abstractions.
- **Async/Await**: Proper handling of asynchronous operations for FS and Browser control.
- **Standard Compliant**: Follow modern JavaScript best practices and Puppeteer/Marked usage patterns.
