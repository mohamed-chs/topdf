# Project Context - topdf

## Overview
`topdf` is a CLI tool designed to bridge the gap between simple Markdown notes and professional-looking PDF documents. It leverages the power of Chromium (via Puppeteer) to ensure that what you see in a modern browser is exactly what you get in the PDF.

## Technical Stack
- **Runtime**: Node.js (ESM)
- **CLI**: `commander`
- **Markdown Parser**: `marked`
- **PDF Engine**: `puppeteer`
- **Syntax Highlighting**: `highlight.js`
- **Math**: `mathjax`
- **Progress & CLI UI**: `ora`, `chalk`
- **File System**: `fs-extra`, `glob`
- **Styles**: Custom CSS injected during rendering.

## Key Design Goals
1. **Zero Config by Default**: Sensible defaults that look great out of the box.
2. **Extensibility**: Users should be able to override styles and templates.
3. **Accuracy**: High-fidelity rendering of math, code, and tables.
4. **Performance**: Efficient batch processing for large documentation sets.
