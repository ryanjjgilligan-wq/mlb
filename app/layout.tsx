import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Nav } from '@/components/Nav';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'DiamondIQ — MLB Intelligence', template: '%s · DiamondIQ' },
  description:
    'A serious MLB analytics command center. Live stats, sabermetrics, and model-driven predictions.',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark`}>
      <body className="min-h-screen flex flex-col antialiased">
        <Nav />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line mt-auto">
          <div className="max-w-[1600px] mx-auto px-4 py-4 flex flex-wrap items-center gap-3 text-2xs text-ink-faint">
            <span className="text-ink-muted">DiamondIQ</span>
            <span>·</span>
            <span>
              Data: <a className="hover:text-ink-muted" href="https://statsapi.mlb.com" target="_blank" rel="noreferrer">MLB Stats API</a>
            </span>
            <span>·</span>
            <span>Numbers are computed from official counting stats. Static linear weights used for wOBA/FIP — not park or league adjusted.</span>
            <span className="ml-auto">
              For informational and analytical use only. Not betting advice.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
