import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--bg)',
          raised: 'var(--bg-raised)',
          sunken: 'var(--bg-sunken)',
          panel: 'var(--bg-panel)',
          hover: 'var(--bg-hover)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
          subtle: 'var(--line-subtle)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
          subtle: 'var(--ink-subtle)',
          faint: 'var(--ink-faint)',
        },
        // Signal colors are semantic, mostly stable across modes
        signal: {
          pos: '#16a34a',
          neg: '#dc2626',
          warn: '#d97706',
          info: '#2563eb',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          dim: 'var(--accent-dim)',
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
