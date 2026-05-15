import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Base neutrals — deep, not pure black
        bg: {
          DEFAULT: '#0a0a0b',
          raised: '#101013',
          sunken: '#070708',
          panel: '#0f0f12',
          hover: '#16161a',
        },
        line: {
          DEFAULT: '#1f1f24',
          strong: '#2a2a31',
          subtle: '#161619',
        },
        ink: {
          DEFAULT: '#e8e8ec',
          muted: '#9a9aa3',
          subtle: '#62626b',
          faint: '#3a3a42',
        },
        // Signal colors — used only for meaningful deltas
        signal: {
          pos: '#34d399', // green — over expectation / up
          neg: '#f87171', // red — under expectation / down
          warn: '#fbbf24', // amber — caution
          info: '#60a5fa', // blue — informational
        },
        // Accent — singular brand color, used sparingly
        accent: {
          DEFAULT: '#facc15', // diamond yellow
          dim: '#a3850f',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        micro: '0.04em',
      },
    },
  },
  plugins: [],
};

export default config;
