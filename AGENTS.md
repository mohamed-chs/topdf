# Working Guidelines: topdf

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

## Codebase Overview
- **`bin/topdf.js`**: The **CLI ENTRY POINT**. Responsible for command-line argument parsing (Commander), configuration loading (`.topdfrc`), glob pattern expansion, file system orchestration, and the live watch mode (Chokidar).
- **`src/renderer.js`**: The **CORE ENGINE**. Manages the lifecycle of the Puppeteer browser, frontmatter extraction (YAML), Markdown lexing and parsing (Marked), Table of Contents (TOC) generation, and HTML/PDF assembly.
- **`src/styles/`**: Contains the **DESIGN DNA**. `default.css` provides the professional document layout, and `github.css` handles syntax highlighting themes.
- **`tests/`**: The **QUALITY GATE**. Consolidated into `unit.test.js` (logic/parsing) and `cli.test.js` (integration/E2E).
- **`examples/`**: Real-world scenarios, edge cases, and feature demonstrations used for **BOTH DOCUMENTATION AND FIDELITY TESTING.**

## Testing Strategy
- **REFLEXIVE & CONSTANT**: **TEST AT EVERY STEP.** Do not wait until the end of a feature to write tests.
- **MULTI-LAYERED**:
    - **UNIT TESTS**: Verify individual functions (Frontmatter, TOC, HTML assembly).
    - **INTEGRATION TESTS**: Verify the interaction between the Renderer and the file system/Puppeteer.
    - **END-TO-END (E2E) TESTS**: Verify the **FULL CLI FLOW** from Markdown input to PDF output.
- **REGRESSION TESTING**: **ALWAYS RUN `npm test`** before any modification to establish a baseline and after to ensure **NO BREAKS.**

## Coding Standards
- **ESM EVERYTHING**: Strict adherence to **ES MODULES.**
- **CLARITY OVER CLEVERNESS**: Code should be intuitive, readable, and easy to maintain. **AVOID UNNECESSARY ABSTRACTIONS.**
- **ASYNC/AWAIT**: Proper handling of **ASYNCHRONOUS OPERATIONS** for FS and Browser control is **MANDATORY.**
- **STANDARD COMPLIANT**: Follow modern JavaScript best practices and Puppeteer/Marked usage patterns. **NO DEPRECATED APIS.**
