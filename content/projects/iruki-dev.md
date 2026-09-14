---
title: "iruki.dev"
description: "This site. A static Astro site with a block-based page builder and a local visual editor, so content is edited in a GUI instead of by hand."
pubDate: 2026-05-04
tags: ["Astro", "TypeScript", "Tailwind"]
github: "https://github.com/iruki-dev/iruki-dev.github.io"
featured: true
---

## The idea

A personal site is only worth having if updating it is easy, so this one is built around one
distinction: `content/pages/` is the site itself, and `content/<collection>/` holds data lists like
blog posts, projects and newsletter issues.

Both are editable through the same interface. There are no hardcoded `.astro` pages — the `pages/`
directory contains three route dispatchers and nothing more. Adding a page means adding a JSON file;
adding a whole new kind of list, like recipes or books, means adding a line of configuration.

## Block-based pages

Every page is a list of blocks: headings and paragraphs, but also callouts, galleries, tabs,
timelines, animated stat counters, Mermaid diagrams, KaTeX math, and sandboxed HTML and JavaScript
playgrounds. One block, `collection-list`, is how any data list gets displayed anywhere — the home
page uses it for a three-item preview, the index pages use the same block with no limit.

## Editing it without touching files

A local admin tool comes with the repository. It's a single Node file using only the standard
library — no dependencies, no authentication, no network calls. It reads and writes the project
files directly, so saving is immediately visible in the dev server, and committing the change is the
content history.

It covers item CRUD with a markdown editor and live preview, a visual block builder for pages,
collection management, site settings, and image uploads. Everything the site can express is
reachable without opening an editor.

## Stack

Astro with content collections and zod schemas, Tailwind with eight switchable color palettes as CSS
variables, light and dark themes remembered per visitor, and GitHub Actions building and deploying
to GitHub Pages on every push to `main`.
