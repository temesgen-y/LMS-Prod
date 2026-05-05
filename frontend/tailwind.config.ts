import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // lib/ contains security utilities with Tailwind colour strings
    './src/lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'hsl(270 60% 40%)',
          foreground: 'hsl(0 0% 100%)',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
