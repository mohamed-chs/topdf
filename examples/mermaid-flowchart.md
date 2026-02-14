---
title: "Mermaid Flowchart Example"
---

# Mermaid Flowchart

This example demonstrates a simple document rendering pipeline.

```mermaid
flowchart LR
  A[Read Markdown] --> B[Parse Frontmatter]
  B --> C[Render HTML]
  C --> D[Render in Browser]
  D --> E[Export PDF]
```

## Notes

- Mermaid fences are rendered as diagrams by default.
- Use `--no-mermaid` to disable diagram rendering.
