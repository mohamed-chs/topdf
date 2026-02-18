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
- **Headless Precision**: Uses Puppeteer to render the final HTML, ensuring complex layouts, MathJax, Mermaid diagrams, and syntax highlighting are captured exactly as intended.
- **Concurrency & Parallelism**: Employs a **Page Pooling** strategy where a single browser instance is shared across multiple concurrent conversion tasks. Each task gets its own `Page`, ensuring isolation and resource efficiency.
- **Modular Design**: The system is partitioned into independent domains (Markdown, HTML, Styles, Utils) orchestrated by a central `Renderer`. This makes it easy to swap parsing logic, inject custom styles, or use it as a library.
- **Developer UX**: A powerful CLI supports glob expansion, watch mode, hierarchical configuration (`.convpdfrc*`), and bounded concurrency for high-throughput batch processing without destabilizing runtime resources.

## Codebase Overview
- **`bin/convpdf.ts`**: The **CLI ENTRY POINT**. Responsible for command-line argument parsing (Commander), config loading (`.convpdfrc*`), deterministic input expansion, output strategy validation (including directory structure mirroring for batch conversions), and serialized watch-mode conversion.
  - CLI option precedence is explicit: only user-provided flags override config values. Keep this guard so future Commander default behavior changes cannot silently clobber `.convpdfrc*` values.
  - Output strategy must stay extension-aware for both PDF and HTML modes. Single-file validation and collision checks must use the selected output format (`pdf` or `html`) consistently.
  - Watch mode must maintain output ownership state across `add/change/unlink` events to keep collision detection accurate over time.
  - Asset lifecycle commands (`convpdf assets install|verify|update|clean`) must remain deterministic and machine-readable when `--json` is requested.
  - Asset policy options (`assetMode`, `assetCacheDir`, `allowNetworkFallback`) must flow from config/CLI into renderer options without breaking CLI precedence rules.
  - `--asset-fallback/--no-asset-fallback` is only a CLI alias for `allowNetworkFallback`; keep this mapping explicit to avoid config/CLI divergence.
  - `--max-pages` / `maxConcurrentPages` must remain wired to renderer page leasing to keep Puppeteer memory usage predictable under high CLI concurrency.
  - Numeric CLI/config options that control concurrency (`concurrency`, `maxPages`, `maxConcurrentPages`) must fail fast on invalid/non-positive/out-of-range values instead of degrading into `NaN`/implicit clamping behavior.
  - Asset subcommand option parsing must support both `--cache-dir <path>` and `--cache-dir=<path>` forms.
  - Input paths containing literal parentheses (for example `spec (draft).md`) must be treated as regular file paths, not glob-magic patterns.
  - Existing file inputs with literal glob-like characters (`[]`, `{}`, `*`, `?`) must be treated as explicit file paths for output-strategy validation and watch-mode ownership.
  - Watch mode should start even when the initial input expansion is empty, then process future `add/change` events as files appear.
  - Watch mode must only react to markdown files that match the original user inputs (file, directory, or glob), never broad parent-directory spillover.
  - `convpdf assets --help` must print deterministic operation/option usage text and exit successfully.
- Rendering is automatic and syntax-driven for MathJax and Mermaid; keep it that way (no user-facing toggles).
- **`src/renderer.ts`**: The **ORCHESTRATOR**. Coordinates markdown parsing, HTML assembly, browser rendering, and PDF generation.
  - HTML mode should continue to use `renderHtml(...)` directly without launching a browser, while PDF mode uses Puppeteer.
  - PDF rendering now serves an in-memory HTML document via an ephemeral localhost server (`http://127.0.0.1:<port>/document.html`) instead of `file://`; preserve deterministic server/page cleanup in success and failure paths.
  - Local runtime assets are served from the same localhost origin during PDF rendering to avoid cross-origin issues with MathJax/Mermaid/font loading.
  - Runtime asset resolution is syntax-driven and lazy: documents with no math/mermaid syntax must render without requiring installed runtime assets, even under strict local/no-fallback policy.
  - After PDF generation, file-link annotations are rewritten from absolute `file:///...` URIs to relative paths (based on the markdown source directory) to keep outputs portable across environments.
  - Preserve rewrite support for localhost-served source links (`/__convpdf_source/...`) so PDF links stay portable.
  - Dynamic content waits (images, MathJax, Mermaid) are centralized and timeout-bounded; preserve these explicit waits when adjusting rendering behavior.
  - Page and localhost render-server lifecycle must be deterministic even if setup fails before navigation (no leaked pages on partial initialization failures).
  - Mermaid execution should happen only after `document.fonts.ready` to minimize label clipping and layout drift in final PDFs.
  - PDF rendering uses an explicit page lease pool (`maxConcurrentPages`) to bound simultaneous open pages; preserve deterministic page release on every success/failure path.
- **`src/assets/`**: Runtime asset management for offline rendering.
  - `manifest.ts` pins external runtime package versions and integrity metadata.
  - `manager.ts` handles user-cache install/verify/update/clean and archive extraction.
  - Keep `manager.ts` exports minimal and operational (no unused helper exports); resolve file URLs at call sites unless reused by multiple runtime paths.
  - Runtime verification should validate NewCM font package structure (`chtml.js` plus non-empty `chtml/woff2`) rather than hard-coding one specific font filename.
  - `resolve.ts` maps asset policy (`auto|local|cdn`) to concrete script/font URLs (local cache, localhost-served, or CDN).
  - `allowNetworkFallback: false` is strict for both `auto` and `local`; missing local assets must fail fast with an actionable install command.
  - Asset downloads must be timeout-bounded, and install/clean operations must be lock-serialized per cache root to avoid concurrent staging races.
- **`src/markdown/`**: Markdown pipeline modules:
  - `frontmatter.ts` for frontmatter parsing/validation
  - `math.ts` for math protection/detection
  - `mermaid.ts` for mermaid-fence detection
  - `marked.ts` for Marked setup/extensions/safe links, callout/alert parsing (`> [!note]`, `> [!NOTE]`), and strict line-only `[TOC]` placeholder tokenization.
  - `toc.ts` for TOC generation
- **`src/html/template.ts`**: HTML document assembly with safe token replacement and optional MathJax/Mermaid script injection.
  - Math rendering is on MathJax v4 and Mermaid v11 with runtime URL injection; keep delimiter config and MathJax loader/font path wiring aligned with upstream docs.
- **`src/utils/`**: Shared helpers:
  - `html.ts` for escaping/sanitization
  - `validation.ts` for margin/format/toc-depth validation
  - Href sanitization for rendered HTML must reject `file:` links and protocol-relative URLs (`//...`) (relative links remain allowed); only explicit web-safe protocols should pass.
- **`src/types.ts`**: The **TYPE DEFINITIONS**. Contains interfaces and types used throughout the project to ensure strict type safety.
- **`src/styles/`**: Contains the **DESIGN DNA**. `default.css` provides the professional document layout, and `github.css` handles syntax highlighting themes.
- **`tests/`**: The **QUALITY GATE**. Consolidated into `unit.test.ts` (logic/parsing) and `cli.test.ts` (integration/E2E).
  - CLI tests run in a shared suite-scoped temp root with per-case subdirectories; keep this pattern to reduce filesystem churn while preserving isolation.
  - Keep regression coverage that conversion leaves no `convpdf-*` temp artifacts when `TMPDIR`/`TMP`/`TEMP` are scoped to a case-local directory.
  - Keep CLI E2E execution deterministic (`describe.sequential`, color-disabled output assertions, explicit child-process timeout).
  - Include failure-path coverage for configuration and template loading (e.g., invalid config root shapes, missing header/footer/template files) with actionable message assertions.
  - Include branch-level markdown rendering coverage for page breaks, link rewrite suffix handling (`.md/.markdown` with query/hash), and protocol sanitization.
  - Keep regression coverage for CLI/config precedence so Commander defaults never silently override `.convpdfrc*` values when flags are omitted.
  - Keep regression coverage for math-bearing headings so TOC labels and anchor IDs remain correct (no placeholder leakage).
  - Keep regression coverage for escaped literals: inline-code `` `<!-- PAGE_BREAK -->` `` must not trigger page breaks, and escaped dollars (`\$`) must remain literal (non-math) even when MathJax is enabled by nearby equations.
  - Keep regression coverage for blockquote-based callouts/alerts: Obsidian and GitHub syntax must render to `.callout` containers while non-matching blockquotes remain regular `<blockquote>` output.
  - Keep regression coverage for header/footer PDF options so supplying only one template does not inject unexpected default content in the other region.
  - Keep regression coverage for output format behavior: `.md/.markdown` link rewrite targets (`.pdf` vs `.html`) and HTML-mode CLI output path validation/collision semantics.
  - Keep regression coverage that generated HTML uses non-absolute `<base href>` values and that generated PDFs rewrite `file:///...` link annotations to relative paths.
  - Keep regression coverage for asset policy behavior (`auto/local/cdn`) and asset lifecycle command UX (`assets install|verify|update|clean`).
- **`examples/`**: Canonical real-world scenarios and fidelity probes used for **BOTH DOCUMENTATION AND REGRESSION TESTING**.
  - The exhaustive suite lives directly under `examples/`. Keep scenarios focused and non-overlapping:
    - `core-features.md`: baseline markdown features, emoji, wrapping stress, page breaks, and cross-file navigation.
    - `callouts-alerts.md`: Obsidian callouts and GitHub alert syntax coverage (including fallback blockquotes).
    - `math-heavy.md`: all advanced MathJax stress cases (inline/display/matrix/alignment/nesting/escaping).
    - `mermaid-diagrams.md`: consolidated flowchart + sequence diagram coverage.
    - Remaining files validate targeted concerns (TOC depth/collisions, edge cases, custom headers/footers, relative assets, syntax breadth, advanced styles, config-local resolution).
  - `examples/pro-showcase/` is a polished end-to-end demo with custom templates and styling.
  - `examples/templates/` contains multiple full config/template/style packs (`executive-brief`, `academic-journal`, `product-launch`, `engineering-rfc`) with per-pack `sample.md` files; treat these as reusable presets and keep each pack self-contained.
  - Prefer extending existing canonical files over adding new top-level `examples/*.md` unless a new scenario cannot fit without reducing clarity.
- **`.github/workflows/`**: CI/CD automation:
  - `ci.yml` runs a multi-version quality gate (typecheck/lint/format/build/test) plus package smoke checks (`npm pack --dry-run` and CLI help validation)
  - `release.yml` validates release tags against `package.json`, verifies ancestry from `main`, publishes via npm trusted publishing (`id-token` + provenance), and creates/updates GitHub Releases with generated notes

## 🚀 Agent Protocol

### 1. Mandatory Orientation
- **IN-DEPTH CODEBASE EXPLORATION**: Regardless of task size, **ALWAYS** start with an exhaustive and deep exploration of the codebase, its architecture, and all internal and external dependencies. Do not rely on high-level summaries, memory, or initial assumptions. You **MUST** verify every assumption by directly inspecting the source code, type definitions, and configuration files. **DO NOT SKIP THIS STEP.** Only after this rigorous orientation should you proceed with task-specific exploration and implementation.

### 2. Operational Rigor
- **CRITICAL MINDSET**: Do not assume the codebase is perfect. Be alert for missing logic, edge cases, or features that appear complete but are fragile.
- **PRIORITIZE COHESION, DELETE STALE COMPLEXITY**: Prioritize codebase health over historical patterns. Aggressively remove obsolete branches, dead paths, compatibility-only checks, and unused abstractions. Prefer direct rewrites that make behavior obvious, deterministic, and maintainable.
- **COHESION PASS**: After any change, perform a targeted sanity sweep to ensure the new behavior is **fully wired** across configs, CLI options, defaults, tests, and documentation.
- **LIFECYCLE HYGIENE**: CLI and renderer changes must preserve deterministic cleanup for browser pages, watchers, and signal handlers in both one-shot and watch modes.
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
- **DETERMINISTIC I/O**: Prefer case-local temp directories and deterministic output checks; avoid assertions that depend on ambient machine state (global `/tmp`, unrelated concurrent processes, terminal color mode).

## Coding Standards
- **TYPESCRIPT & ESM**: Strict adherence to **TYPESCRIPT** and **ES MODULES.**
- **NO ANY**: The `any` type is **STRICTLY PROHIBITED.** Use precise interfaces, unions, or `unknown` with type guards.
- **CLARITY OVER CLEVERNESS**: Code should be intuitive, readable, and easy to maintain. **AVOID UNNECESSARY ABSTRACTIONS.**
- **ASYNC/AWAIT**: Proper handling of **ASYNCHRONOUS OPERATIONS** for FS and Browser control is **MANDATORY.**
- **STANDARD COMPLIANT**: Follow modern TypeScript best practices and Puppeteer/Marked usage patterns. **NO DEPRECATED APIS.**
- **LINTING & FORMATTING**: All code must pass `eslint` and `prettier`. Run `npm run lint` and `npm run format:check` before committing.
