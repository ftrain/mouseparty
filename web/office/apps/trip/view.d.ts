/**
 * Trip drawn and written out, with no DOM: the page for print, PDF, PNG and thumbnails, and the two files a
 * map app or a GPS reads (GPX 1.1, GeoJSON). The page draws the route on OpenStreetMap's tiles at the zoom that
 * fits the stops (Paul, 2026-10-12: "The map shows the locations but not the map itself"), on a slide, a page, an
 * item, a card and every export alike, with the credit in the corner; with the Map switch off, and on the home
 * page's thumbnails, on a plain map of its own (Web Mercator, fitted to the stops, a graticule for scale) that asks
 * no one for anything. A picture made of it has the tiles written in first (kit/draw/raster.ts).
 */
import type { Page } from '../../kit/core/app.ts';
import { type TripView } from './model.ts';
import type { Doc } from '../../doc/index.ts';
export declare const mapOn: () => boolean;
export declare const setMapOn: (on: boolean) => void;
/** On the tiles, the share of the box's width and height the stops may span: an eighth of it kept clear each side, for the names. */
export declare const FIT = 0.75;
/** The farthest: stops across the world are drawn on a map of continents, never on one tile of the globe (Paul, 2026-10-13: "Zoom 2"). */
export declare const MIN_ZOOM = 2;
export declare const ONE_ZOOM = 15;
/**
 * The stops on a map `w` × `h`: the route and the numbered pins with their names, on OpenStreetMap's tiles (`tiles`), or
 * on lines of latitude and longitude. Presented, the first `upTo` of them, on the map that fits them all.
 */
export declare function mapSvg(v: TripView, w: number, h: number, upTo?: number, tiles?: boolean): string;
/** The route as a page: the map, then the stops in order with their notes and legs, and the total. Small: the map alone. `tiles`: on OpenStreetMap's tiles. */
export declare function tripPage(doc: Doc, small?: boolean, upTo?: number, tiles?: boolean): Page;
/** GPX 1.1: each stop a waypoint, and the stops in order a route. */
export declare function tripToGpx(doc: Doc): string;
/** GeoJSON (RFC 7946): a point a stop, and, for a route, the line through them first. */
export declare function tripToGeoJson(doc: Doc): string;
