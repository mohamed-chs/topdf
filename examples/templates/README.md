# Template Packs

This directory contains ready-to-use configuration packs for `convpdf`.
Each pack has its own `.convpdfrc.yml`, `template.html`, `styles.css`, and optional header/footer templates.

## How to use a pack

Run `convpdf` from inside a pack directory so config-relative paths resolve automatically:

```bash
cd examples/templates/executive-brief
convpdf ./sample.md -o ./output.pdf
```

You can also pass the same files explicitly from repository root:

```bash
convpdf examples/templates/executive-brief/sample.md \
  --css examples/templates/executive-brief/styles.css \
  --template examples/templates/executive-brief/template.html \
  --header examples/templates/executive-brief/header.html \
  --footer examples/templates/executive-brief/footer.html
```

## Packs

- `executive-brief`: Corporate report styling with neutral palette and print-safe layout.
- `academic-journal`: Serif-heavy paper style optimized for long-form writing and references.
- `product-launch`: Marketing landing style with bold accents and card-oriented sections.
- `engineering-rfc`: Technical specification layout tuned for dense code and callout patterns.
