import siteJson from './site.json';
import navJson from './nav.json';

export const SITE = siteJson as {
  title: string;
  description: string;
  url: string;
  author: string;
  github: string;
  email: string;
};

export const NAV = navJson as {
  links: { href: string; label: string }[];
};
