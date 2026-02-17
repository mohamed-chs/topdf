---
title: "Callouts and Alerts"
author: "convpdf examples"
date: "2026-02-17"
toc: true
tocDepth: 3
---

# Callouts and Alerts

[TOC]

This example focuses on blockquote-based callout syntax from Obsidian and GitHub.

## GitHub Alerts

> [!NOTE]
> This is a note alert.

> [!TIP]
> Prefer relative links for local docs like [Guide](./navigation-target.md).

> [!IMPORTANT]
> Important alert with **inline formatting** and `code`.

> [!WARNING]
> Warning alert with multiple lines.
> Keep this in mind before publishing.

> [!CAUTION]
> Caution alert with a short checklist:
> - verify inputs
> - validate output

## Obsidian Callouts

> [!info]
> Obsidian info callout (lowercase type).

> [!abstract] Summary
> Custom title after the callout type.

> [!question]+ Expanded by default
> `+` is accepted and treated as expanded.

> [!danger]- Collapsed marker demo
> `-` is recognized and attached as a collapsed semantic marker.

> [!bug] Parser edge case
> Nested markdown still works:
> 1. list item
> 2. another item
>
> Final paragraph in the same callout.

## Fallback Behavior

These are regular blockquotes and should remain regular blockquotes:

> [! not a valid callout header
> so this should not become a callout.

> Plain blockquote.
