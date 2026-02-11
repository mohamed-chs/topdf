# topdf

Convert Markdown to high-quality PDF using Node.js, Marked, and Puppeteer.

## Features
- **Zero-Config**: Beautiful defaults out of the box.
- **High Fidelity**: Professional rendering of math (MathJax), code (Highlight.js), and tables.
- **Advanced Layout**: Support for [TOC], footnotes, and `<!-- PAGE_BREAK -->`.
- **Customizable**: Override CSS, templates, headers, and footers.
- **Batch Processing**: Convert multiple files using glob patterns.
- **Watch Mode**: Live-reload PDFs as you edit your Markdown.

## Usage
```bash
# Basic conversion
topdf input.md

# Multiple files with custom output directory
topdf "docs/*.md" -o results/

# Custom styles and TOC
topdf input.md --css styles.css --toc
```

## Options
- `-o, --output <path>`: Output directory or file path.
- `-w, --watch`: Watch for changes.
- `-c, --css <path>`: Custom CSS file.
- `-t, --template <path>`: Custom HTML template.
- `-m, --margin <margin>`: Page margin (default: 20mm).
- `-f, --format <format>`: PDF format (default: A4).
- `--header <path>`: Custom header template.
- `--footer <path>`: Custom footer template.
- `--toc`: Generate Table of Contents.
- `--no-math`: Disable MathJax.

## Configuration
Supports `.topdfrc` (JSON or YAML) for persistent settings.

## Development
```bash
npm install
npm test
```
