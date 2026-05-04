/** @type {import('tailwindcss').Config} */
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
          50:  '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe',
          300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1',
          600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81',
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
