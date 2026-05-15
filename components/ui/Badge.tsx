import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

type Variant = 'neutral' | 'pos' | 'neg' | 'warn' | 'info' | 'accent';

export function Badge({
  children,
  variant = 'neutral',
  className,
  pulse = false,
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
  pulse?: boolean;
}) {
  const variants: Record<Variant, string> = {
    neutral: 'border-line text-ink-muted bg-bg-raised',
    pos: 'border-signal-pos/30 text-signal-pos bg-signal-pos/5',
    neg: 'border-signal-neg/30 text-signal-neg bg-signal-neg/5',
    warn: 'border-signal-warn/30 text-signal-warn bg-signal-warn/5',
    info: 'border-signal-info/30 text-signal-info bg-signal-info/5',
    accent: 'border-accent/30 text-accent bg-accent/5',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-2xs font-medium tracking-micro uppercase',
        variants[variant],
        className
      )}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-current" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
