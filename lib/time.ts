export function formatGameTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return '';
  }
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Returns the current "MLB slate" date as YYYY-MM-DD.
 *
 * Anchors to America/New_York (MLB's operating timezone) so the date doesn't
 * roll over at 8 PM ET (midnight UTC) while games are still in progress.
 *
 * Sports-day cutoff: between midnight ET and 4 AM ET, late-running games
 * from the prior date are still on the slate, so we return *yesterday's*
 * date during that window. After 4 AM ET, the new day takes over.
 *
 * MLB's own `officialDate` field on the schedule API follows the same
 * convention — games are bucketed by the date they started, not the date
 * they ended.
 */
export function ymd(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;
  // Intl returns "24" instead of "00" for midnight hour — handle both
  const rawHour = parts.find((p) => p.type === 'hour')!.value;
  const hour = parseInt(rawHour, 10) % 24;

  // Before 4 AM ET, treat as the previous day's sports slate so late games
  // from that slate stay grouped with it.
  if (hour < 4) {
    return shiftYmd(`${year}-${month}-${day}`, -1);
  }

  return `${year}-${month}-${day}`;
}

export function shiftYmd(date: string, deltaDays: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
