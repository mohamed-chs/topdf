---
title: "Topdf Advanced Test"
author: "Gemini CLI"
date: "2026-02-10"
---

# Topdf Test Document

[TOC]

This is a test document for the `topdf` CLI.

## Text Formatting

You can use **bold**, *italic*, or ~~strikethrough~~ text.

> This is a blockquote.
> It can span multiple lines.

## Code Highlighting

Here is some JavaScript code:

```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}

greet('World');
```

And some Python:

```python
def fib(n):
    a, b = 0, 1
    while a < n:
        print(a, end=' ')
        a, b = b, a+b
    print()

fib(1000)
```

## Mathematics

Inline math: $E = mc^2$

Block math:

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

## Tables

| Feature | Support | Status |
| :--- | :---: | ---: |
| Markdown | Yes | Done |
| PDF | Yes | Done |
| Math | Yes | In Progress |

## Footnotes

Here is a simple footnote[^1].

[^1]: This is the footnote content.

## Lists

- Item 1
- Item 2
  - Subitem 2.1
  - Subitem 2.2
- Item 3

1. First
2. Second
3. Third

## Navigation

[Go to second document](second.md)
