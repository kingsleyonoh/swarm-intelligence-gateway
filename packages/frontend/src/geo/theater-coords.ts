/**
 * Theater-to-coordinates mapping for geopolitical theaters.
 * Provides hardcoded lat/lng for ~20 major geopolitical theaters
 * and a resolver with case-insensitive substring matching.
 */

export interface TheaterCoord {
  lat: number;
  lng: number;
}

/** Hardcoded coordinates for major geopolitical theaters */
export const THEATER_COORDS: Record<string, TheaterCoord> = {
  'Middle East': { lat: 29.0, lng: 41.0 },
  'Strait of Hormuz': { lat: 26.6, lng: 56.3 },
  'Asia-Pacific': { lat: 15.0, lng: 125.0 },
  'Eastern Europe': { lat: 50.0, lng: 30.0 },
  'South China Sea': { lat: 12.0, lng: 114.0 },
  'Taiwan Strait': { lat: 24.0, lng: 119.0 },
  'Black Sea': { lat: 43.5, lng: 34.0 },
  'Horn of Africa': { lat: 8.0, lng: 48.0 },
  'Persian Gulf': { lat: 26.0, lng: 52.0 },
  'Baltic States': { lat: 57.0, lng: 24.0 },
  'Arctic': { lat: 78.0, lng: 15.0 },
  'Korean Peninsula': { lat: 37.5, lng: 127.0 },
  'Sahel': { lat: 14.0, lng: 2.0 },
  'Indo-Pacific': { lat: -2.0, lng: 110.0 },
  'West Africa': { lat: 8.0, lng: -2.0 },
  'Central Asia': { lat: 41.0, lng: 65.0 },
  'Mediterranean': { lat: 36.0, lng: 18.0 },
  'Caucasus': { lat: 42.0, lng: 44.0 },
  'Red Sea': { lat: 20.0, lng: 38.5 },
  'Gulf of Aden': { lat: 12.5, lng: 47.0 },
};

/**
 * Resolve a theater name to coordinates.
 * Supports exact match and case-insensitive substring matching.
 * Returns null if no theater matches.
 */
export function resolveTheaterCoords(
  name: string,
): TheaterCoord | null {
  if (!name) return null;

  const lower = name.toLowerCase();

  // Try exact match first (case-insensitive)
  for (const [theater, coords] of Object.entries(THEATER_COORDS)) {
    if (theater.toLowerCase() === lower) {
      return { ...coords };
    }
  }

  // Try substring match (case-insensitive)
  for (const [theater, coords] of Object.entries(THEATER_COORDS)) {
    if (theater.toLowerCase().includes(lower)) {
      return { ...coords };
    }
  }

  return null;
}
