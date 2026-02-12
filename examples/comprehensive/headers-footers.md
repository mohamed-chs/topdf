---
title: Headers and Footers Demo
---

# Headers and Footers

This document demonstrates the use of custom headers and footers in `convpdf`.

## Usage

You can provide custom HTML templates for headers and footers using the `--header` and `--footer` flags.

```bash
convpdf demo.md --header header.html --footer footer.html
```

## Puppeteer Variables

Puppeteer allows you to use special classes in your header/footer templates:

- `.date`: Formatted print date
- `.title`: Document title
- `.url`: Document location
- `.pageNumber`: Current page number
- `.totalPages`: Total pages in the document

## Example Content

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam in dui mauris. Vivamus hendrerit arcu sed erat molestie vehicula. Sed auctor neque eu tellus rhoncus ut eleifend nibh porttitor. Ut in nulla enim. Phasellus molestie magna non est bibendum non venenatis nisl tempor. Suspendisse dictum feugiat nisl ut dapibus. Mauris iaculis porttitor posuere. Praesent id metus massa, ut blandit odio. Proin quis tortor orci. Etiam at risus et justo dignissim congue. Donec congue lacinia dui, a porttitor lectus condimentum laoreet. Nunc eu ullamcorper orci. Quisque eget odio ac lectus vestibulum faucibus eget in metus. In pellentesque faucibus vestibulum. Nulla at nulla justo, eget luctus tortor. Nulla facilisi. Duis aliquet egestas purus in blandit. Curabitur vulputate, ligula lacinia scelerisque tempor, lacus lacus ornare ante, ac egestas est urna sit amet arcu. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos.

<!-- PAGE_BREAK -->

## Second Page

This is the second page to verify page numbering.

More content to fill the space...
