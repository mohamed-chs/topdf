---
title: "Mermaid Diagram Examples"
---

# Mermaid Diagrams

This document consolidates Mermaid coverage into one file.

## Flowchart

```mermaid
flowchart LR
  A[Read Markdown] --> B[Parse Frontmatter]
  B --> C[Render HTML]
  C --> D[Render in Browser]
  D --> E[Export PDF]
```

## Sequence Diagram

```mermaid
sequenceDiagram
  participant U as User
  participant C as CLI
  participant R as Renderer
  participant P as Puppeteer

  U->>C: convpdf input.md
  C->>R: renderHtml(markdown)
  R->>P: page.setContent(...)
  P-->>R: rendered page
  R-->>C: output.pdf
  C-->>U: Done
```

## Notes

- Mermaid fences are rendered as diagrams by default.
- Use `--no-mermaid` to disable diagram rendering.

## Try It

```bash
convpdf examples/mermaid-diagrams.md -o examples/mermaid-diagrams.pdf
```
