---
title: "Comprehensive Core Features"
author: "convpdf examples"
date: "2026-02-15"
toc: true
tocDepth: 3
---

# Core Features and Stress Cases

[TOC]

This document consolidates the baseline feature coverage and common stress scenarios.

## Text Formatting

You can use **bold**, *italic*, or ~~strikethrough~~ text.

> This is a blockquote.
> It can span multiple lines.

> [!NOTE]
> This is a GitHub-style alert rendered as a callout.

> [!tip] Obsidian-style callout
> This uses the Obsidian callout syntax with a custom title.

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

## Mathematics and Emoji

Inline math: $E = mc^2$ and $\sqrt{a^2 + b^2} = c$.

Display math:

$$
\frac{n!}{k!(n-k)!} = \binom{n}{k}
$$

Complex equation:

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

Mixed math and emoji:

$$
\text{Happy } \sum \text{ Emojis } 😃
$$

Emoji coverage:

- Basic: 😀 😂 🤣 😍
- Flags: 🇸🇦 🇺🇸 🇯🇵 🇫🇷
- Symbols: ⚛️ ⚙️ 🛠️ 💡
- Skin tones: 👍 👍🏻 👍🏼 👍🏽 👍🏾 👍🏿

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

## Page Break

<!-- PAGE_BREAK -->

This paragraph starts on a new page.

## Long Lines and Wrapping

This is a very long line of text that should wrap properly instead of extending beyond the page boundaries and causing the renderer to zoom out to fit everything. Let's add some more text here: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

### Long Code Block

```
This_is_a_very_long_string_without_any_spaces_that_might_cause_issues_if_it_does_not_wrap_properly_in_the_final_pdf_output_as_it_will_force_the_page_to_be_wider_than_expected.
```

### Wide Table

| Header 1 | Header 2 | Header 3 | Header 4 | Header 5 | Header 6 | Header 7 | Header 8 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| This is some content for column 1 | This is some content for column 2 | This is some content for column 3 | This is some content for column 4 | This is some content for column 5 | This is some content for column 6 | This is some content for column 7 | This is some content for column 8 |

### Long URL

https://www.example.com/some/very/long/path/to/a/resource/that/might/not/wrap/properly/and/cause/layout/issues/if/it/is/not/handled/correctly/by/the/css/styles/of/the/document

## Navigation

[Go to navigation target](navigation-target.md)
