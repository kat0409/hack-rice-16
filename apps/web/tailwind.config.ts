import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F5F1E8',
        'paper-dark': '#E9E3D8',
        ink: '#1D1D1B',
        'ink-soft': '#5D5B55',
        border: '#D6D0C5',
        accent: {
          DEFAULT: '#4056A1',
          light: '#6377B8',
          dark: '#2E3F7C',
          soft: '#E5E9F5',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Architects Daughter"', '"DM Sans"', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'serif'],
        // Retro game-title look (the "Mario font" ask) — used for the "graphite"
        // wordmark and each page's large top-of-page title, not smaller card titles.
        retro: ['"Super Mario 256"', 'monospace'],
        // Card/section titles smaller than the page-level title — kept as its
        // own class, separate from `retro`, so the two can be swapped independently.
        jungle: ['"Jungle Adventurer"', '"Architects Daughter"', 'cursive'],
        lilita: ['"Lilita One"', 'cursive'],
      },
      boxShadow: {
        soft: '0 8px 24px -12px rgba(29, 29, 27, 0.18)',
        node: '0 4px 14px -4px rgba(64, 86, 161, 0.35)',
        // "Wii channel" chunky panels: a hard offset edge (like a pressed button
        // lip) plus a soft ambient shadow underneath, instead of a modern blur-only shadow.
        chunky: '0 4px 0 rgba(29, 29, 27, 0.16), 0 12px 26px -10px rgba(29, 29, 27, 0.3)',
        'chunky-sm': '0 2px 0 rgba(29, 29, 27, 0.14), 0 6px 14px -6px rgba(29, 29, 27, 0.24)',
        'chunky-accent': '0 4px 0 rgba(46, 63, 124, 0.55), 0 12px 26px -10px rgba(64, 86, 161, 0.45)',
      },
      letterSpacing: {
        widest2: '0.14em',
      },
      keyframes: {
        'bounce-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(6px)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'bounce-soft': 'bounce-soft 2.2s ease-in-out infinite',
        'fade-in': 'fade-in 0.5s ease-out',
      },
    },
  },
  plugins: [],
}

export default config
