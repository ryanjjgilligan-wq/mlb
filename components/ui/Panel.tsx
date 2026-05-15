import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export function Panel({
  children,
  className,
  title,
  subtitle,
  actions,
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className={cn('panel', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-line">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-medium text-ink tracking-tight">{title}</h2>}
            {subtitle && <p className="text-2xs text-ink-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

export function PanelGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4', className)}>{children}</div>;
}
