---
title: Advanced Styles
---

# Advanced Styles and Layouts

## Page Breaks

You can manually trigger a page break using the following comment:

`<!-- PAGE_BREAK -->`

<!-- PAGE_BREAK -->

## Print Specific CSS

You can use `@media print` in your custom CSS to control how elements appear in the PDF.

For example, to avoid breaking a list across pages:

```css
ul {
  page-break-inside: avoid;
}
```

## Large Tables

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |
| Data 7   | Data 8   | Data 9   |
| Data 10  | Data 11  | Data 12  |

## Syntax Highlighting

```javascript
function helloWorld() {
  console.log("Hello, world!");
}
```
