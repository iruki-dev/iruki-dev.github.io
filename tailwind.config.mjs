/** @type {import('tailwindcss').Config} */
const accent = (n) => `rgb(var(--accent-${n}) / <alpha-value>)`;

export default {
  content: [
    './components/**/*.{astro,ts}',
    './layouts/**/*.astro',
    './pages/**/*.astro',
    './content/**/*.{md,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          50: accent(50), 100: accent(100), 200: accent(200),
          300: accent(300), 400: accent(400), 500: accent(500),
          600: accent(600), 700: accent(700), 800: accent(800), 900: accent(900),
        },
      },
      typography: ({ theme }) => ({
        DEFAULT: { css: { '--tw-prose-links': theme('colors.accent.500') } },
        invert:  { css: { '--tw-prose-links': theme('colors.accent.400') } },
      }),
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
