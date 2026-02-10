# Development Plan - topdf

A high-quality, feature-rich CLI tool for converting Markdown to PDF using Node.js, Marked, and Puppeteer.

## Phase 1: Foundation (Completed)
- [x] Initialize project with ESM and necessary dependencies.
- [x] Create basic CLI structure using `commander`.
- [x] Implement simple Markdown to HTML conversion.
- [x] Implement basic PDF generation via Puppeteer.
- [x] Create initial test suite and example files.

## Phase 2: Core Rendering Features (Completed)
- [x] Integrate `highlight.js` for code syntax highlighting.
- [x] Integrate `MathJax` for mathematical equations.
- [x] Add support for GFM (GitHub Flavored Markdown) including tables and task lists.
- [x] Implement footnote support.
- [x] Create a default "beautiful" CSS theme.

## Phase 3: CLI Enhancements (Completed)
- [x] Support for multiple files and directory batching.
- [x] Add a "watch" mode for live-reloading PDFs during editing.
- [x] Custom CSS support via CLI flags.
- [x] Custom HTML templates.

## Phase 4: Quality of Life & Polish (In Progress)
- [x] Page numbering and headers/footers (Basic margin support added).
- [x] Table of Contents (TOC) generation.
- [x] Metadata extraction (Title, Author from Frontmatter).
- [x] Detailed progress logging and error handling (Improved with ora/chalk).
- [ ] Advanced Headers/Footers (Puppeteer native support).
- [ ] Improved Image Handling (Local path resolution).
- [ ] Configuration file support (.topdfrc).

## Phase 5: Verification & Distribution
- [x] Comprehensive integration tests.
- [ ] Documentation and usage examples.
- [ ] Performance optimization for large files.
