import siteJson from './site.json';

export const PALETTES = [
  'indigo', 'rose', 'emerald', 'amber', 'sky', 'violet', 'crimson', 'lime',
] as const;
export type Palette = typeof PALETTES[number];

export const SITE = siteJson as {
  title: string;
  description: string;
  url: string;
  author: string;
  github: string;
  email: string;
  theme?: {
    palette?: Palette;
  };
  features?: {
    readingProgress?: boolean;
    backToTop?: boolean;
    konami?: boolean;
  };
};
