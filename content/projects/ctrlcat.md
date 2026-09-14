---
title: "ctrlcat"
description: "A collection of small web tools and browser games at ctrlcat.dev. No accounts, no tracking, no database — everything runs in your browser."
pubDate: 2026-05-12
updatedDate: 2026-05-13
tags: ["Astro", "React", "TypeScript", "Tailwind"]
github: "https://github.com/iruki-dev/ctrlcat"
demo: "https://ctrlcat.dev"
featured: true
---

## What it is

[ctrlcat.dev](https://ctrlcat.dev) is a small site with two halves: utilities that do one job well,
and browser games you can finish in a minute.

The category of site it's reacting to is familiar — you search for something like a JSON formatter,
land on a page buried in ads, dismiss a cookie banner, and hand your data to a server for a job
your browser could have done instantly. ctrlcat does the job in the browser. No accounts, no
analytics, no database, nothing sent anywhere.

**Tools** currently include a JSON formatter, a Base64 encoder and decoder, a color converter for
HEX, RGB and HSL, a password generator, and a word counter. **Games** include Snake, tic-tac-toe
against an unbeatable opponent, and a number guesser that quietly teaches binary search.

## Two sites in one repository

Tools and games share a repository, a build, and a deployment — and nothing else. No shared
components, no cross-links, no navigation between them. They have separate themes: a professional
cyan for tools, a playful violet for games.

That separation is enforced as a project rule rather than left to habit, because the alternative
decays predictably. One shared header, then one shared card component, then a "you might also like"
row, and the utility that was supposed to be calm and fast is now a portal. Someone formatting JSON
at work should never be shown Snake.

## Adding something is adding a file

Every tool and game is one markdown file of metadata plus one React component. The markdown holds
the title, description, category, tags and translations; the component is the thing itself. The
content collection schema validates it at build time, so a typo in a category is a failed build
rather than a broken page.

Each entry also carries genuine prose explaining what the thing is and why it exists — the Base64
page explains why the encoding was invented, that it isn't encryption, and what the trailing `=`
signs mean. Useful to read even if you only came to paste a string, and it earns the page a reason
to exist beyond the widget.

## Stack

Astro 4 for static output with zero JavaScript by default, React islands only where a tool actually
needs interactivity, Tailwind with custom design tokens per theme, and GitHub Actions deploying to
GitHub Pages on every push to `main`. Fully static, which is what makes "no database" a structural
fact rather than a promise.
