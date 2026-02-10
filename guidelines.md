# Working Guidelines: topdf

These guidelines are intended to maintain project quality and consistency. They are not strict rules but should be followed to ensure a smooth development experience.

## General Principles
- **Zero-Config First**: Every new feature should have a sensible default that "just works" without user input.
- **High Fidelity**: What we render in HTML is exactly what the user gets in PDF. Avoid print-specific hacks that degrade the visual quality.
- **Minimal Dependencies**: Prefer standard libraries or widely supported packages.

## Coding Standards
- **ESM Everything**: Use ES Modules (`import`/`export`). No `require`.
- **Async/Await**: Use asynchronous file and network operations. Avoid `*Sync` methods unless absolutely necessary (e.g., in some CLI initialization steps).
- **Paths**: Always use `path.resolve` or `path.join` with `import.meta.url` context to ensure cross-platform path reliability.

**NOTE: ALWAYS TEST ON BOTH SINGLE FILES AND GLOB PATTERNS WHEN MODIFYING THE CLI ACTIONS.**

## Styling Guidelines
- **Typography Matters**: The default output should look like a professional document. Pay attention to line-height, font stacks, and vertical rhythm.
- **Print Safety**: Ensure `@media print` blocks in CSS handle page breaks and element visibility correctly.
- **Highlighting**: Keep the Highlight.js theme consistent with the overall document theme.

**NOTE: IF ADDING A NEW MARKED EXTENSION, VERIFY THAT IT DOES NOT CONFLICT WITH EXISTING PLUGINS (LIKE TOC OR FOOTNOTES).**

## Testing & Verification
- **Profuse Testing**: Write a test for every new feature or bug fix.
- **Vitest**: Use `vitest` for all testing. Prefer unit tests for `Renderer` logic and integration tests for `bin/topdf.js`.
- **Chromium**: Be aware that Puppeteer might take time to spin up. Set appropriate timeouts in tests.

**NOTE: DO NOT REMOVE `tests/fixtures/` WITHOUT UPDATING THE CORRESPONDING UNIT TESTS.**

## Maintenance
- **Keep it Clean**: Periodically check for unused dependencies.
- **Documentation**: Update `handoff.md` and `CONTEXT.md` when significant architectural changes are made.

**NOTE: ALWAYS RUN `npm test` BEFORE COMMITTING NEW CHANGES TO ENSURE NO REGRESSIONS IN PDF RENDERING.**
