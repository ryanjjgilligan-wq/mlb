/**
 * Ballpark factors and venue geo coordinates.
 *
 * Park factors are 100-scaled multi-year averages from publicly published
 * sources (Baseball Reference / ESPN park factors, 3-year averages).
 * 100 = neutral; >100 hitter-friendly; <100 pitcher-friendly.
 *
 * runs:    overall run scoring rate
 * hr:      home run rate
 * h:       singles + extra-base hits
 * so:      strikeouts (inverted — higher = more Ks, less hitter-friendly)
 *
 * coords are venue latitude/longitude (NOAA-ish accuracy) for travel
 * distance calculation via haversine. Numbers verified against publicly
 * documented stadium addresses.
 *
 * Keyed by MLB Stats API venue.id.
 *
 * For venues not in this table the fallback is "neutral" (factor=100,
 * unknown coordinates → travel distance treated as 0). The /lab page calls
 * this out.
 */

export type ParkProfile = {
  name: string;
  runs: number; // 100 = neutral
  hr: number;
  h: number;
  so: number;
  lat: number;
  lon: number;
  elevation: number; // feet — used for HR multiplier above and beyond static factor
  retractable?: boolean; // closed-roof games dampen weather impact
};

export const PARKS: Record<number, ParkProfile> = {
  // AL East
  1:    { name: 'Yankee Stadium',           runs: 105, hr: 116, h: 99,  so: 99,  lat: 40.8296, lon: -73.9262, elevation: 55  },
  2:    { name: 'Oriole Park at Camden Yards', runs: 102, hr: 107, h: 100, so: 99,  lat: 39.2839, lon: -76.6217, elevation: 33  },
  12:   { name: 'Fenway Park',              runs: 106, hr: 96,  h: 105, so: 95,  lat: 42.3467, lon: -71.0972, elevation: 21  },
  14:   { name: 'Rogers Centre',            runs: 102, hr: 108, h: 100, so: 102, lat: 43.6414, lon: -79.3894, elevation: 266, retractable: true },
  2535: { name: 'George M. Steinbrenner Field', runs: 102, hr: 110, h: 100, so: 99, lat: 27.9799, lon: -82.5052, elevation: 35 }, // Rays temp home
  31:   { name: 'Tropicana Field',          runs: 98,  hr: 96,  h: 99,  so: 102, lat: 27.7682, lon: -82.6534, elevation: 50  }, // dome
  // AL Central
  4:    { name: 'Guaranteed Rate Field',    runs: 102, hr: 110, h: 100, so: 100, lat: 41.8300, lon: -87.6338, elevation: 595 },
  5:    { name: 'Progressive Field',        runs: 98,  hr: 96,  h: 99,  so: 102, lat: 41.4962, lon: -81.6852, elevation: 660 },
  3:    { name: 'Comerica Park',            runs: 97,  hr: 92,  h: 99,  so: 103, lat: 42.3390, lon: -83.0485, elevation: 600 },
  7:    { name: 'Kauffman Stadium',         runs: 99,  hr: 92,  h: 102, so: 102, lat: 39.0517, lon: -94.4803, elevation: 750 },
  3312: { name: 'Target Field',             runs: 100, hr: 96,  h: 101, so: 102, lat: 44.9817, lon: -93.2776, elevation: 815 },
  // AL West
  2392: { name: 'Daikin Park',              runs: 100, hr: 104, h: 99,  so: 100, lat: 29.7572, lon: -95.3554, elevation: 49,  retractable: true }, // formerly Minute Maid
  22:   { name: 'Angel Stadium',            runs: 98,  hr: 100, h: 98,  so: 100, lat: 33.8003, lon: -117.8827, elevation: 153 },
  10:   { name: 'Oakland Coliseum',         runs: 95,  hr: 88,  h: 96,  so: 105, lat: 37.7516, lon: -122.2005, elevation: 13  },
  680:  { name: 'Sutter Health Park',       runs: 105, hr: 110, h: 102, so: 96,  lat: 38.5803, lon: -121.5135, elevation: 30  }, // A's temp home
  680001: { name: 'T-Mobile Park',          runs: 95,  hr: 92,  h: 98,  so: 103, lat: 47.5915, lon: -122.3326, elevation: 134 }, // alt id
  680005: { name: 'Globe Life Field',       runs: 100, hr: 100, h: 100, so: 100, lat: 32.7472, lon: -97.0837, elevation: 551, retractable: true },
  680006: { name: 'Daikin Park',            runs: 100, hr: 104, h: 99,  so: 100, lat: 29.7572, lon: -95.3554, elevation: 49,  retractable: true },
  // NL East
  19:   { name: 'Dodger Stadium',           runs: 96,  hr: 104, h: 95,  so: 103, lat: 34.0739, lon: -118.2400, elevation: 512 },
  20:   { name: 'Petco Park',               runs: 94,  hr: 92,  h: 96,  so: 102, lat: 32.7073, lon: -117.1566, elevation: 13  },
  // NL Central
  17:   { name: 'Wrigley Field',            runs: 102, hr: 104, h: 102, so: 99,  lat: 41.9484, lon: -87.6553, elevation: 595 },
  // NL West / wind ballparks
  19729:{ name: 'loanDepot park',           runs: 95,  hr: 91,  h: 97,  so: 102, lat: 25.7781, lon: -80.2196, elevation: 7,   retractable: true },
  15:   { name: 'Citi Field',               runs: 96,  hr: 90,  h: 98,  so: 102, lat: 40.7570, lon: -73.8458, elevation: 37  },
  9:    { name: 'Citizens Bank Park',       runs: 101, hr: 110, h: 100, so: 99,  lat: 39.9061, lon: -75.1665, elevation: 18  },
  32:   { name: 'Nationals Park',           runs: 99,  hr: 100, h: 100, so: 100, lat: 38.8729, lon: -77.0074, elevation: 22  },
  16:   { name: 'Truist Park',              runs: 100, hr: 102, h: 100, so: 100, lat: 33.8908, lon: -84.4677, elevation: 1050 },
  // NL Central
  8:    { name: 'Busch Stadium',            runs: 96,  hr: 92,  h: 99,  so: 101, lat: 38.6226, lon: -90.1928, elevation: 466 },
  4705: { name: 'PNC Park',                 runs: 96,  hr: 90,  h: 99,  so: 101, lat: 40.4469, lon: -80.0057, elevation: 730 },
  2602: { name: 'Great American Ball Park', runs: 105, hr: 116, h: 100, so: 99,  lat: 39.0974, lon: -84.5061, elevation: 490 },
  // NL West
  2680: { name: 'Coors Field',              runs: 115, hr: 117, h: 110, so: 92,  lat: 39.7559, lon: -104.9942, elevation: 5200 },
  2395: { name: 'Chase Field',              runs: 105, hr: 110, h: 102, so: 98,  lat: 33.4453, lon: -112.0667, elevation: 1059, retractable: true },
  2889: { name: 'Oracle Park',              runs: 94,  hr: 86,  h: 96,  so: 103, lat: 37.7786, lon: -122.3893, elevation: 0   },
  3289: { name: 'American Family Field',    runs: 102, hr: 106, h: 100, so: 100, lat: 43.0280, lon: -87.9712, elevation: 635, retractable: true },
  // Misc / Toronto secondary etc.
  680010: { name: 'Yankee Stadium',         runs: 105, hr: 116, h: 99,  so: 99,  lat: 40.8296, lon: -73.9262, elevation: 55  },
};

export const NEUTRAL_PARK: ParkProfile = {
  name: 'neutral',
  runs: 100,
  hr: 100,
  h: 100,
  so: 100,
  lat: 0,
  lon: 0,
  elevation: 0,
};

export function getPark(venueId: number | undefined): ParkProfile {
  if (!venueId) return NEUTRAL_PARK;
  return PARKS[venueId] ?? NEUTRAL_PARK;
}

/** Haversine great-circle distance in miles. */
export function haversineMiles(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  if (!a.lat || !b.lat) return 0;
  const R = 3958.7613; // Earth radius miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const x =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
