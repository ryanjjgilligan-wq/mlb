import { cn } from '@/lib/cn';
import { Tooltip } from './Tooltip';

export function Stat({
  label,
  value,
  hint,
  trend,
  size = 'md',
  align = 'left',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  trend?: 'pos' | 'neg' | 'neutral';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  const valSize = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-4xl',
  }[size];
  const trendCls =
    trend === 'pos' ? 'text-signal-pos' : trend === 'neg' ? 'text-signal-neg' : 'text-ink';
  const alignCls =
    align === 'right' ? 'text-right items-end' : align === 'center' ? 'text-center items-center' : 'items-start';
  const node = (
    <div className={cn('flex flex-col gap-0.5', alignCls, className)}>
      <span className="label-micro">{label}</span>
      <span className={cn('stat-num font-semibold leading-tight', valSize, trendCls)}>{value}</span>
    </div>
  );
  return hint ? <Tooltip content={hint}>{node}</Tooltip> : node;
}
