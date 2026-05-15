import { LocalTime } from './LocalTime';
import { LocalDate } from './LocalDate';
import { Cloud, Wind, Thermometer, MapPin, Tv } from 'lucide-react';

export type GameInfoCardData = {
  venueId?: number;
  venueName?: string;
  venueCity?: string;
  venueState?: string;
  gameDate: string;
  broadcastNote?: string;
  weather?: { temp?: string; condition?: string; wind?: string };
  umpires: { type: string; name: string }[];
};

/**
 * "Game Information" card — venue, datetime, broadcast info, weather,
 * umpire crew. Dropped on every game page (preview / live / final).
 */
export function GameInfoCard({ d }: { d: GameInfoCardData }) {
  return (
    <div className="space-y-3">
      {/* Venue header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded bg-bg-raised border border-line flex items-center justify-center shrink-0">
          <MapPin size={20} className="text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-ink truncate">{d.venueName ?? '—'}</div>
          {(d.venueCity || d.venueState) && (
            <div className="text-2xs text-ink-muted truncate">
              {[d.venueCity, d.venueState].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Date / time / broadcast */}
      <div className="grid grid-cols-1 gap-1.5 text-sm">
        <div className="flex items-center gap-2 text-ink-muted">
          <span className="label-micro w-20 shrink-0">When</span>
          <LocalTime iso={d.gameDate} format="time" className="stat-num text-ink" />
          <span className="text-ink-faint">·</span>
          <LocalDate ymd={d.gameDate.slice(0, 10)} className="stat-num" />
        </div>
        {d.broadcastNote && (
          <div className="flex items-center gap-2 text-ink-muted">
            <span className="label-micro w-20 shrink-0 flex items-center gap-1"><Tv size={10} /> Coverage</span>
            <span className="text-ink stat-num">{d.broadcastNote}</span>
          </div>
        )}
      </div>

      {/* Weather */}
      {d.weather && (d.weather.temp || d.weather.condition || d.weather.wind) && (
        <div className="border-t border-line-subtle pt-3 space-y-1.5">
          <div className="label-micro flex items-center gap-1"><Cloud size={11} className="text-signal-info" /> Weather</div>
          <div className="flex items-center gap-3 flex-wrap text-sm">
            {d.weather.temp && (
              <div className="flex items-center gap-1.5">
                <Thermometer size={13} className="text-signal-warn" />
                <span className="stat-num text-base font-semibold text-ink">{d.weather.temp}°F</span>
              </div>
            )}
            {d.weather.condition && (
              <span className="text-ink-muted">{d.weather.condition}</span>
            )}
            {d.weather.wind && (
              <div className="flex items-center gap-1.5 text-ink-muted">
                <Wind size={12} className="text-ink-faint" />
                <span className="text-2xs stat-num">{d.weather.wind}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Umpires */}
      {d.umpires.length > 0 && (
        <div className="border-t border-line-subtle pt-3">
          <div className="label-micro mb-1.5">Umpires</div>
          <ul className="text-2xs text-ink-muted space-y-1">
            {d.umpires.map((u) => (
              <li key={u.type} className="flex items-baseline gap-2">
                <span className="text-ink-faint stat-num shrink-0 w-32 truncate">{u.type}</span>
                <span className="text-ink truncate">{u.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
