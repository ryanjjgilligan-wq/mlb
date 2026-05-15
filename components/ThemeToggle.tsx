'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/cn';

type Theme = 'light' | 'dark' | 'system';

const KEY = 'diamondiq:theme';

function apply(theme: Theme) {
  const root = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
  root.classList.toggle('light', !isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Theme | null) ?? 'system';
    setTheme(stored);
    setMounted(true);
    apply(stored);
    if (stored === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => apply('system');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
  }, []);

  const set = (t: Theme) => {
    setTheme(t);
    localStorage.setItem(KEY, t);
    apply(t);
  };

  // SSR: render a placeholder so layout doesn't shift
  if (!mounted) {
    return <div className="w-[78px] h-6" aria-hidden />;
  }

  return (
    <div className="inline-flex items-center gap-px p-0.5 rounded border border-line bg-bg-raised" role="radiogroup" aria-label="Theme">
      <ThemeBtn label="System" Icon={Monitor} active={theme === 'system'} onClick={() => set('system')} />
      <ThemeBtn label="Light" Icon={Sun} active={theme === 'light'} onClick={() => set('light')} />
      <ThemeBtn label="Dark" Icon={Moon} active={theme === 'dark'} onClick={() => set('dark')} />
    </div>
  );
}

function ThemeBtn({
  label,
  Icon,
  active,
  onClick,
}: {
  label: string;
  Icon: typeof Sun;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      title={label}
      className={cn(
        'p-1 rounded transition-colors',
        active
          ? 'bg-bg-hover text-ink'
          : 'text-ink-muted hover:text-ink hover:bg-bg-hover/50'
      )}
    >
      <Icon size={12} />
    </button>
  );
}
