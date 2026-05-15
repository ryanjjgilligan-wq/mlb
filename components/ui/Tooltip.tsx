'use client';

import { useState, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Tooltip({
  content,
  children,
  className,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 120);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  const pos =
    side === 'top'
      ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5'
      : side === 'bottom'
      ? 'top-full left-1/2 -translate-x-1/2 mt-1.5'
      : side === 'left'
      ? 'right-full top-1/2 -translate-y-1/2 mr-1.5'
      : 'left-full top-1/2 -translate-y-1/2 ml-1.5';

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            'absolute z-50 pointer-events-none whitespace-pre-wrap',
            'px-2 py-1.5 rounded border border-line-strong bg-bg-sunken text-ink text-2xs',
            'shadow-lg max-w-xs',
            pos
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
