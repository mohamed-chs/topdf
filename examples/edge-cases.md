# Edge Case Testing

## Nested Structures

1. Level 1
   - Nested Item
   - Another Nested Item
     1. Deeply Nested
     2. Even Deeper
        > With a blockquote inside!
        > And some `inline code`
   - Back to Level 2
2. Back to Level 1

## Mixed Styling

This is **bold and _italic_ and ~~strikethrough~~** all at once.

How about a link inside a footnote?[^link-fn]

[^link-fn]: Check out [Google](https://google.com).

## Table with Noisy Content

| Column 1 (with `code`) | Column 2 (**bold**) | Column 3 |
| --- | --- | --- |
| Row 1 | [Link](https://example.com) | $E=mc^2$ |
| Row 2 | ![Alt text](https://picsum.photos/200/300) | ~~Deleted~~ |

## Empty Sections

### 

(The heading above is empty)

## Escaped Content

\# This is not a heading
\* This is not a list
\[TOC] This is not a TOC (because of the backslash - wait, my renderer doesn't handle escaped [TOC] yet)

## Image with Base Path
![Local Image](local-image.svg)
