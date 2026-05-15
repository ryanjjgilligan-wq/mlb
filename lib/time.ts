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

export function ymd(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function shiftYmd(date: string, deltaDays: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
