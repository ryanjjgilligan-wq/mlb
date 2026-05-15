'use client';

import { useEffect, useState } from 'react';

/**
 * Formats a YYYY-MM-DD date in the user's local TZ. Renders
 * "Friday, May 15" style strings.
 */
export function LocalDate({ ymd, className }: { ymd: string; className?: string }) {
  // Build a Date treating ymd as midnight LOCAL — using noon UTC keeps the
  // wall-clock date consistent across all timezones (no day-rollover).
  const iso = `${ymd}T12:00:00Z`;
  const [text, setText] = useState(() => {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  });
  useEffect(() => {
    setText(
      new Date(iso).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    );
  }, [iso]);
  return <span className={className} suppressHydrationWarning>{text}</span>;
}
