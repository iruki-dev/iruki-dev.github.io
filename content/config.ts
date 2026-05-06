import { defineCollection, z } from 'astro:content';
import collectionsJson from '../config/collections.json';

const itemSchema = z.object({
  title: z.string(),
  description: z.string().default(''),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  featured: z.boolean().default(false),
  github: z.string().url().optional(),
  demo: z.string().url().optional(),
});

const dynamicCollections: Record<string, ReturnType<typeof defineCollection>> = {};
for (const c of (collectionsJson as { collections: { name: string }[] }).collections) {
  dynamicCollections[c.name] = defineCollection({
    type: 'content',
    schema: itemSchema,
  });
}

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

  // ── New blocks ──
  z.object({
    type: z.literal('callout'),
    variant: z.enum(['info', 'tip', 'warning', 'danger', 'note', 'success']).default('info'),
    title: z.string().default(''),
    text: z.string().default(''),
    icon: z.string().default(''),
  }),
  z.object({
    type: z.literal('quote'),
    text: z.string().default(''),
    author: z.string().default(''),
    source: z.string().default(''),
    sourceHref: z.string().default(''),
  }),
  z.object({
    type: z.literal('video'),
    src: z.string().default(''),
    poster: z.string().default(''),
    autoplay: z.boolean().default(false),
    loop: z.boolean().default(false),
    muted: z.boolean().default(false),
    controls: z.boolean().default(true),
    caption: z.string().default(''),
  }),
  z.object({
    type: z.literal('audio'),
    src: z.string().default(''),
    title: z.string().default(''),
    caption: z.string().default(''),
  }),
  z.object({
    type: z.literal('embed'),
    url: z.string().default(''),
    aspect: z.enum(['16x9', '4x3', '1x1', '9x16']).default('16x9'),
    title: z.string().default(''),
  }),
  z.object({
    type: z.literal('gallery'),
    items: z
      .array(z.object({
        src: z.string().default(''),
        alt: z.string().default(''),
        caption: z.string().default(''),
      }))
      .default([]),
    columns: z.number().int().min(1).max(6).default(3),
  }),
  z.object({
    type: z.literal('accordion'),
    items: z
      .array(z.object({
        summary: z.string().default(''),
        content: z.string().default(''),
        open: z.boolean().default(false),
      }))
      .default([]),
  }),
  z.object({
    type: z.literal('tabs'),
    items: z
      .array(z.object({
        label: z.string().default(''),
        content: z.string().default(''),
      }))
      .default([]),
  }),
  z.object({
    type: z.literal('stats'),
    items: z
      .array(z.object({
        value: z.string().default(''),
        label: z.string().default(''),
        suffix: z.string().default(''),
        prefix: z.string().default(''),
        animate: z.boolean().default(true),
      }))
      .default([]),
  }),
  z.object({
    type: z.literal('timeline'),
    items: z
      .array(z.object({
        date: z.string().default(''),
        title: z.string().default(''),
        text: z.string().default(''),
      }))
      .default([]),
  }),
  z.object({
    type: z.literal('progress'),
    label: z.string().default(''),
    value: z.number().min(0).max(100).default(50),
    showValue: z.boolean().default(true),
    striped: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('countdown'),
    target: z.string().default(''),
    label: z.string().default(''),
    finishedText: z.string().default('Time’s up!'),
  }),
  z.object({
    type: z.literal('mermaid'),
    code: z.string().default('graph TD;\n  A-->B;'),
    caption: z.string().default(''),
  }),
  z.object({
    type: z.literal('math'),
    code: z.string().default('e^{i\\pi} + 1 = 0'),
    display: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('runner'),
    title: z.string().default('JavaScript playground'),
    code: z.string().default('console.log("hello");\nreturn 1 + 1;'),
    autoRun: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('marquee'),
    text: z.string().default('Scrolling marquee — '),
    speed: z.enum(['slow', 'normal', 'fast']).default('normal'),
    reverse: z.boolean().default(false),
    icon: z.string().default('★'),
  }),
  z.object({
    type: z.literal('palette'),
    label: z.string().default(''),
    colors: z.array(z.object({
      name: z.string().default(''),
      hex: z.string().default('#6366f1'),
    })).default([]),
  }),
  z.object({
    type: z.literal('iframe-sandbox'),
    html: z.string().default('<h2>Hello</h2>'),
    css: z.string().default('body { font-family: sans-serif; }'),
    js: z.string().default(''),
    height: z.number().int().min(100).max(2000).default(300),
  }),
  z.object({
    type: z.literal('collection-list'),
    collection: z.string().default(''),
    title: z.string().default(''),
    limit: z.number().int().min(0).max(100).default(3), // 0 = show all
    featuredOnly: z.boolean().default(false),
    showAllLink: z.boolean().default(true),
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
    navOrder: z.number().default(0),
    blocks: z.array(blockSchema).default([]),
  }),
});

export const collections = { ...dynamicCollections, pages };
