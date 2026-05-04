import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    github: z.string().url().optional(),
    demo: z.string().url().optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

const blockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    level: z.number().int().min(1).max(3).default(2),
    text: z.string().default(''),
    align: z.enum(['left', 'center', 'right']).default('left'),
  }),
  z.object({
    type: z.literal('paragraph'),
    text: z.string().default(''),
    align: z.enum(['left', 'center', 'right']).default('left'),
  }),
  z.object({
    type: z.literal('image'),
    src: z.string().default(''),
    alt: z.string().default(''),
    caption: z.string().default(''),
    width: z.enum(['sm', 'md', 'lg', 'full']).default('full'),
  }),
  z.object({
    type: z.literal('button'),
    text: z.string().default('Click me'),
    href: z.string().default('#'),
    style: z.enum(['primary', 'outline', 'ghost']).default('primary'),
    align: z.enum(['left', 'center', 'right']).default('left'),
    newTab: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('columns'),
    columns: z
      .array(z.object({ markdown: z.string().default('') }))
      .default([{ markdown: '' }, { markdown: '' }]),
  }),
  z.object({ type: z.literal('divider') }),
  z.object({
    type: z.literal('spacer'),
    size: z.enum(['sm', 'md', 'lg', 'xl']).default('md'),
  }),
  z.object({
    type: z.literal('code'),
    code: z.string().default(''),
    lang: z.string().default(''),
  }),
  z.object({ type: z.literal('html'), html: z.string().default('') }),
  z.object({
    type: z.literal('cards'),
    items: z
      .array(
        z.object({
          title: z.string().default(''),
          description: z.string().default(''),
          href: z.string().default(''),
          icon: z.string().default(''),
        })
      )
      .default([]),
  }),
]);

const pages = defineCollection({
  type: 'data',
  schema: z.object({
    title: z.string(),
    description: z.string().default(''),
    pubDate: z.coerce.date().default(() => new Date()),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    showInNav: z.boolean().default(false),
    navLabel: z.string().optional(),
    blocks: z.array(blockSchema).default([]),
  }),
});

export const collections = { blog, projects, pages };
