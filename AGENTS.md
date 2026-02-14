# Working Guidelines: convpdf

**IMPORTANT: EXPLORE THE CODEBASE THOROUGHLY AND ANALYZE ALL SYSTEM DEPENDENCIES BEFORE STARTING ANY TASK.**

## Agent Responsibilities
- **MAINTAIN THIS DOCUMENT**: `AGENTS.md` is a living artifact. You **MUST** proactively update, rewrite, and expand these guidelines as the codebase evolves, ensuring they remain the definitive and most useful resource for future agents.

## Core Philosophy
- **ROBUST & RELIABLE**: Implementation **MUST** be correct, well-behaved, and handle edge cases gracefully. **NO HACKS.**
- **SANE DEFAULTS**: The tool must be **GREAT OUT OF THE BOX**—working beautifully and providing a high-quality experience with **ZERO CONFIGURATION**, while remaining flexible.
- **PREDICTABLE POWER**: Aim for feature-rich, high-fidelity results while ensuring **ZERO WEIRDNESS**. **NEVER** introduce unexpected or implicit behaviors, whether explicit or hidden, that deviate from what a user would naturally expect from "sane defaults."
- **EXACT FIDELITY**: What is rendered in the browser **MUST BE EXACTLY** what appears in the PDF.
- **REASONABLE PERFORMANCE**: Optimize for efficiency (CPU/Memory) **WITHOUT SACRIFICING** reliability or code clarity.
- **LEVERAGE ECOSYSTEM**: Use high-quality, reliable external dependencies rather than reinventing the wheel. If a library does it better, **USE IT.**

## Technical Overview
`convpdf` is a high-fidelity Markdown-to-PDF engine built on **TypeScript** and **Puppeteer**. It prioritizes visual precision by treating PDF generation as a web-first rendering task.

- **Fidelity-First Pipeline**: Markdown is transformed into a modern HTML document via a structured pipeline: Frontmatter extraction -> Math protection -> Marked tokenization -> HTML templating.
- **Headless Precision**: Uses Puppeteer to render the final HTML, ensuring complex layouts, MathJax, and syntax highlighting are captured exactly as intended.
- **Concurrency & Parallelism**: Employs a **Page Pooling** strategy where a single browser instance is shared across multiple concurrent conversion tasks. Each task gets its own `Page`, ensuring isolation and resource efficiency.
- **Modular Design**: The system is partitioned into independent domains (Markdown, HTML, Styles, Utils) orchestrated by a central `Renderer`. This makes it easy to swap parsing logic, inject custom styles, or use it as a library.
- **Developer UX**: A powerful CLI supports glob expansion, watch mode, and hierarchical configuration (`.convpdfrc*`), catering to both quick one-offs and automated CI/CD workflows. Now includes `-j, --concurrency` for high-throughput batch processing.

## Codebase Overview
- **`bin/convpdf.ts`**: The **CLI ENTRY POINT**. Responsible for command-line argument parsing (Commander), config loading (`.convpdfrc*`), deterministic input expansion, output strategy validation, and serialized watch-mode conversion.
- **`src/renderer.ts`**: The **ORCHESTRATOR**. Coordinates markdown parsing, HTML assembly, browser rendering, and PDF generation.
- **`src/markdown/`**: Markdown pipeline modules:
  - `frontmatter.ts` for frontmatter parsing/validation
  - `math.ts` for math protection/detection
  - `marked.ts` for Marked setup/extensions/safe links
  - `toc.ts` for TOC generation
- **`src/html/template.ts`**: HTML document assembly with safe token replacement and optional MathJax injection.
- **`src/utils/`**: Shared helpers:
  - `html.ts` for escaping/sanitization
  - `validation.ts` for margin/format/toc-depth validation
- **`src/types.ts`**: The **TYPE DEFINITIONS**. Contains interfaces and types used throughout the project to ensure strict type safety.
- **`src/styles/`**: Contains the **DESIGN DNA**. `default.css` provides the professional document layout, and `github.css` handles syntax highlighting themes.
- **`tests/`**: The **QUALITY GATE**. Consolidated into `unit.test.ts` (logic/parsing) and `cli.test.ts` (integration/E2E).
- **`examples/`**: Real-world scenarios, edge cases, and feature demonstrations used for **BOTH DOCUMENTATION AND FIDELITY TESTING.**
- **`.github/workflows/`**: CI/CD automation:
  - `ci.yml` runs a multi-version quality gate (typecheck/lint/format/build/test) plus package smoke checks (`npm pack --dry-run` and CLI help validation)
  - `release.yml` validates release tags against `package.json`, verifies ancestry from `main`, publishes via npm trusted publishing (`id-token` + provenance), and creates/updates GitHub Releases with generated notes

## 🚀 Agent Protocol

### 1. Mandatory Orientation
- **CODEBASE EXPLORATION**: Regardless of task size, **ALWAYS** start with a thorough exploration of the codebase and dependencies. Do not rely on memory or initial assumptions. **DO NOT SKIP THIS STEP.** Only after this initial mandatory orientation should you proceed with task-specific exploration and implementation.

### 2. Operational Rigor
- **CRITICAL MINDSET**: Do not assume the codebase is perfect. Be alert for missing logic, edge cases, or features that appear complete but are fragile.
- **COHESION PASS**: After any change, perform a targeted sanity sweep to ensure the new behavior is **fully wired** across configs, CLI options, defaults, tests, and documentation.
- **VERIFICATION**: Always run the full quality gate (`npm run ci`) and fix all issues—including linting, formatting, type errors, and tests—before considering a task finished.
  - For release pipeline edits, also validate workflow logic against the local release helper flow (`npm version` + pushed tags) so tag-triggered automation remains deterministic.
- **SYSTEM INTEGRITY**: Any change that introduces new build artifacts, temporary directories, or runtime dependencies **MUST** be reflected in `.gitignore` and documented in `README.md`.

### 3. Communication & UX
- **ASSERTIVE EXPERTISE**: If a request is ambiguous, technically flawed, or contradicts project patterns, **PUSH BACK**. Propose better alternatives.
- **UX FIRST**: Prioritize the end-user experience. Do not compromise the CLI's usability or the PDF's visual quality to simplify implementation.

## Testing Strategy
- **REFLEXIVE & CONSTANT**: **TEST AT EVERY STEP.** Do not wait until the end of a feature to write tests.
- **MULTI-LAYERED**:
    - **UNIT TESTS**: Verify individual functions (Frontmatter, TOC, HTML assembly).
    - **INTEGRATION TESTS**: Verify the interaction between the Renderer and the file system/Puppeteer.
    - **END-TO-END (E2E) TESTS**: Verify the **FULL CLI FLOW** from Markdown input to PDF output. Tests run against the compiled `dist/` output for E2E and source for units.
- **REGRESSION TESTING**: Run `npm run build && npm test` before/after substantial behavior changes.

## Coding Standards
- **TYPESCRIPT & ESM**: Strict adherence to **TYPESCRIPT** and **ES MODULES.**
- **NO ANY**: The `any` type is **STRICTLY PROHIBITED.** Use precise interfaces, unions, or `unknown` with type guards.
- **CLARITY OVER CLEVERNESS**: Code should be intuitive, readable, and easy to maintain. **AVOID UNNECESSARY ABSTRACTIONS.**
- **ASYNC/AWAIT**: Proper handling of **ASYNCHRONOUS OPERATIONS** for FS and Browser control is **MANDATORY.**
- **STANDARD COMPLIANT**: Follow modern TypeScript best practices and Puppeteer/Marked usage patterns. **NO DEPRECATED APIS.**
- **LINTING & FORMATTING**: All code must pass `eslint` and `prettier`. Run `npm run lint` and `npm run format:check` before committing.
