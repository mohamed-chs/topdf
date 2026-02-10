# Handoff: topdf

## Project Overview
`topdf` is a high-performance, feature-rich Node.js CLI tool designed to convert Markdown files into professional-quality PDF documents. It leverages `Marked` for extensible parsing and `Puppeteer` (Headless Chromium) to ensure that the final PDF matches modern web rendering standards.

## Project Context
The tool is built to be "zero-config" by default while providing deep customization for power users. It handles complex Markdown features like mathematical equations (MathJax), code syntax highlighting (Highlight.js), GitHub Flavored Markdown (GFM), footnotes, and automated Table of Contents (TOC) generation.

**NOTE: THIS PROJECT RELIES ON PUPPETEER. IF RUNNING IN A RESTRICTED ENVIRONMENT, ALWAYS ENSURE `--no-sandbox` IS USED IN THE BROWSER LAUNCH ARGUMENTS.**

## Current Progress (State of the Union)
- **Core Engine**: The `Renderer` class in `src/renderer.js` is the heart of the project. it manages frontmatter extraction, TOC generation, and HTML template assembly.
- **Markdown Parsing**: Highly extensible setup using `Marked` with plugins for GFM, Footnotes, Heading IDs, and Highlight.js.
- **Math Support**: Implemented via client-side MathJax injection for maximum reliability within the Puppeteer context.
- **Styling**: A modern `default.css` provides a GitHub-like aesthetic. Custom CSS can be injected via CLI flags.
- **Templating**: Support for custom HTML templates using `{{title}}`, `{{css}}`, and `{{content}}` placeholders.
- **CLI Features**:
    - Batch processing (glob support).
    - Live watch mode (`chokidar`).
    - Margin control.
    - Automatic TOC insertion.
    - Page break support via `<!-- PAGE_BREAK -->`.
    - Native PDF headers and footers support.
    - Configuration file support (`.topdfrc`).
- **Testing**: Suite established using `Vitest`, covering both unit logic (HTML rendering) and integration (PDF generation).

**NOTE: THE PROJECT HAS COMPLETED PHASE 4. CORE FUNCTIONALITY IS ROBUST, AND ADVANCED POLISHING FEATURES (HEADERS, IMAGES, CONFIG) ARE IMPLEMENTED.**

**NOTE: THE `package.json` IS CONFIGURED FOR ESM (`"type": "module"`). ALL NEW FILES MUST FOLLOW ESM CONVENTIONS.**
