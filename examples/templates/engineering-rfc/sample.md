---
title: RFC - Deterministic Rendering Pipeline
toc: true
tocDepth: 3
---

# RFC: Deterministic Rendering Pipeline

## Problem Statement

Different tools render markdown with inconsistent behavior around math, diagrams, and syntax highlighting.

<div class="callout">
This pack emphasizes technical readability and stable code/table rendering for specification documents.
</div>

## Interface Contract

| Input | Normalization | Output |
| --- | --- | --- |
| Markdown | Frontmatter + token pipeline | HTML/PDF |
| Relative assets | Base URL injection | Correctly resolved resources |
| TOC metadata | Depth clamping | Predictable nav tree |

## Operator Shortcuts

<div class="kbd-list">
Use <kbd>Ctrl</kbd> + <kbd>C</kbd> to stop watch mode safely.
</div>

<div class="warning">
Do not bypass cleanup hooks in long-running conversion sessions.
</div>
