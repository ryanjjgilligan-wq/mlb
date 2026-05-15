'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Activity, BarChart3, BookOpenCheck, Radio, Sparkles, Hourglass, Shield } from 'lucide-react';
import { SearchCommand } from './SearchCommand';
import { LiveDot } from './LiveDot';
import { ThemeToggle } from './ThemeToggle';

const nav = [
  { href: '/', label: 'Home', icon: Activity },
  { href: '/live', label: 'Live', icon: Radio },
  { href: '/opportunities', label: 'Opportunities', icon: Sparkles },
  { href: '/first5', label: 'First 5', icon: Hourglass },
  { href: '/nrfi', label: 'NRFI', icon: Shield },
  { href: '/standings', label: 'Standings', icon: BarChart3 },
  { href: '/lab', label: 'Model Lab', icon: BookOpenCheck },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur border-b border-line">
      <div className="max-w-[1600px] mx-auto px-4 h-12 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="relative w-5 h-5">
            <span className="absolute inset-0 rotate-45 bg-accent rounded-sm group-hover:bg-accent transition-colors" />
            <span className="absolute inset-1 rotate-45 bg-bg rounded-sm" />
          </span>
          <span className="text-sm font-semibold tracking-tight">DiamondIQ</span>
          <span className="label-micro hidden sm:inline pl-1.5 border-l border-line text-ink-faint">
            MLB INTEL
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-2.5 py-1 rounded text-ink-muted hover:text-ink hover:bg-bg-hover transition-colors flex items-center gap-1.5',
                  active && 'text-ink bg-bg-raised'
                )}
              >
                {item.label}
                {item.href === '/live' && <LiveDot />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <SearchCommand />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
