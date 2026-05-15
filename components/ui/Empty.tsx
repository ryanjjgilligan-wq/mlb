import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export function Empty({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center gap-2 py-10 px-4 text-ink-muted',
        className
      )}
    >
      {icon && <div className="text-ink-faint">{icon}</div>}
      <p className="text-sm text-ink">{title}</p>
      {description && <p className="text-2xs max-w-sm">{description}</p>}
    </div>
  );
}
