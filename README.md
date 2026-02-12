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

# Watch mode
topdf "docs/**/*.md" --watch -o pdf/
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
- `--toc-depth <depth>`: TOC depth from `1` to `6`.
- `--no-math`: Disable MathJax.

## Configuration

Supports `.topdfrc`, `.topdfrc.json`, `.topdfrc.yaml`, and `.topdfrc.yml`.

Example:

```yaml
margin: 15mm
format: A4
toc: true
tocDepth: 3
css: ./styles/custom.css
template: ./templates/report.html
header: ./templates/header.html
footer: ./templates/footer.html
```

Paths in config files are resolved relative to the config file location.

## Quality Gate

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
```

Or run everything in one command:

```bash
npm run ci
```

## Linting and Formatting

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

## Development

```bash
npm install
npm run build
npm test

# Run in dev mode without building dist/
npm run dev -- input.md
```

---

> Inspired by [simonhaenisch/md-to-pdf](https://github.com/simonhaenisch/md-to-pdf)
