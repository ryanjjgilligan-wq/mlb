'use client';

import { useEffect, useState } from 'react';

/**
 * Renders an ISO timestamp formatted in the user's local timezone.
 * Server emits a UTC fallback (so SEO/no-JS sees something); client
 * hydrates with the user's local TZ string. Hydration mismatch is
 * sidestepped by deferring to a useEffect-set state.
 */
type Format = 'time' | 'date' | 'datetime' | 'dateLong' | 'weekdayLong';

const FORMATTERS: Record<Format, Intl.DateTimeFormatOptions> = {
  time: { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' },
  date: { weekday: 'short', month: 'short', day: 'numeric' },
  datetime: {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  },
  dateLong: { weekday: 'long', month: 'long', day: 'numeric' },
  weekdayLong: { weekday: 'long', month: 'long', day: 'numeric' },
};

export function LocalTime({
  iso,
  format = 'time',
  className,
  fallback,
}: {
  iso: string | undefined | null;
  format?: Format;
  className?: string;
  fallback?: string;
}) {
  const [text, setText] = useState<string>(() => {
    if (!iso) return fallback ?? '';
    // SSR fallback uses UTC formatting so server output is consistent.
    try {
      return new Date(iso).toLocaleString('en-US', { ...FORMATTERS[format], timeZone: 'UTC' });
    } catch {
      return fallback ?? '';
    }
  });

  useEffect(() => {
    if (!iso) return;
    try {
      setText(new Date(iso).toLocaleString('en-US', FORMATTERS[format]));
    } catch {
      // keep fallback
    }
  }, [iso, format]);

  if (!iso) return <span className={className}>{fallback ?? ''}</span>;
  return <time className={className} dateTime={iso} suppressHydrationWarning>{text}</time>;
}
