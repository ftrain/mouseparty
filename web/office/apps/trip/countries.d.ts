/**
 * Where the Trip Planner's map opens on each country: its ISO 3166-1 code to [latitude, longitude, zoom], the zoom the
 * closest at which the whole country fits a phone's map (390 by 500). Written by scripts/countries.ts from Natural
 * Earth's admin-0 boxes (public domain; scripts/country-boxes.json); never edited by hand. Codes only: no names.
 */
export declare const COUNTRIES: Record<string, readonly [number, number, number]>;
