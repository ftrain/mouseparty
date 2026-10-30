/**
 * A trip as a view of the document, and its commands as operations (docs/kernel.md §3). The route is a table, a stop a row, its place in decimal degrees; the head says
 * how the legs are measured (`units: km` or `units: miles`; without it, hours of driving) and whether the
 * stops are a route at all (`route: dots`: places that stand alone, no line between them, no legs):
 *
 *   ---
 *   units: km
 *   ---
 *   Place | Lat:number | Lon:number | Note
 *   --- | --- | --- | ---
 *   Lisbon | 38.7223 | -9.1393 | Pastel de nata first
 *
 * Columns are found by name in any order (Place, Name, Stop or Where; Lat; Lon, Lng or Long; Note), so a
 * table pasted from elsewhere is a trip as it is. A stop added is `rows` at the table's end (the table's
 * birth a `splice`); its name, note or place changed is `cells`; moved, `rows` out and `rows` back in; taken
 * away, `rows`; a Note column wanted and missing is `cols`. Units and dots are `head`. Words that are not a
 * table but say where (`38.7223, -9.1393, Lisbon | a note`, `Porto (41.1579, -8.6291)`) become the table in
 * one splice as they arrive (`tabulate`). Nothing here touches the DOM.
 */
import { type Doc, type Op, type TableBlock } from '../../doc/index.ts';
export interface Stop {
    /** Its row in the table. */
    row: number;
    lat: number;
    lon: number;
    name: string;
    note: string;
}
export type Units = 'h' | 'm' | 'k';
/** Where each field is in the table, -1 for one it has not got. */
export interface Cols {
    name: number;
    lat: number;
    lon: number;
    note: number;
}
export interface TripView {
    /** The table's block index, -1 while there is none. */
    at: number;
    cols: Cols;
    /** The rows that are places, in order; a row whose degrees are not a place is left out (and left alone). */
    stops: Stop[];
    units: Units;
    /** Joined in order (a route), or dots. */
    linked: boolean;
    /** No table, but words that say where: the editor makes them the table. */
    loose: boolean;
}
export declare const MAX_STOPS = 40;
export declare const TRIP_HEAD: string[];
/** Degrees to five places, about a metre: as short as that allows. */
export declare const deg: (n: number) => string;
export declare const valid: (lat: number, lon: number) => boolean;
export declare function colsOf(b: TableBlock): Cols;
export declare function readTrip(doc: Doc): TripView;
/** Loose words that say where, as the one table they mean: one splice of every block, and the units said. */
export declare function tabulate(doc: Doc): Op[];
/**
 * A stop after stop `after` (the route's end when none is given); the first is the table's birth, after whatever
 * else the document holds.
 */
export declare function addStop(doc: Doc, v: TripView, lat: number, lon: number, name?: string, after?: number | null): Op[];
/** The stop's name or note as typed. A note with no Note column makes one, at the end. */
export declare function setText(doc: Doc, v: TripView, s: Stop, field: 'name' | 'note', value: string): Op[];
/** The stop somewhere else (a pin dragged): its two cells. */
export declare function setPlace(v: TripView, s: Stop, lat: number, lon: number): Op[];
/** Stops [from, to) moved one place earlier or later, past their neighbour: their rows out, and in again beside it. */
export declare function moveStops(doc: Doc, v: TripView, from: number, to: number, by: -1 | 1): Op[];
/** Stop `i` carried to just after stop `to` (a drag by its number). Where it lands in the route: `to`'s place, or the one after. */
export declare function putAfter(doc: Doc, v: TripView, i: number, to: number): {
    ops: Op[];
    at: number;
};
/** Some stops taken away (by their places in the route): their rows, from the last up, so each index holds. */
export declare function removeStops(v: TripView, idx: number[]): Op[];
/** Stops [from, to) again, right after the last of them (never past the most a route holds). */
export declare function duplicateStops(doc: Doc, v: TripView, from: number, to: number): Op[];
/** Stops [from, to) as a table of their own (the clipboard's): the trip's columns, whatever the document's were. */
export declare const stopsTable: (v: TripView, from: number, to: number) => TableBlock;
/** The places some blocks hold: a trip's table (ours, or one pasted from elsewhere), else words that say where. */
export declare function placesIn(doc: Doc): Omit<Stop, 'row'>[];
/**
 * Places pasted in as stops: in place of stops [from, to) when some are chosen, else after stop `after` (the route's
 * end when none). Says where the first of them sits in the route, and how many there are (a route holds 40 at most).
 */
export declare function pasteStops(doc: Doc, v: TripView, places: Omit<Stop, 'row'>[], at: {
    replace: [number, number];
} | {
    after: number | null;
}): {
    ops: Op[];
    at: number;
    n: number;
} | null;
export declare function setUnits(doc: Doc, u: Units): Op[];
export declare function setLinked(doc: Doc, linked: boolean): Op[];
/** Great-circle distance in kilometres. */
export declare function distanceKm(a: Pick<Stop, 'lat' | 'lon'>, b: Pick<Stop, 'lat' | 'lon'>): number;
export declare function routeKm(stops: Pick<Stop, 'lat' | 'lon'>[]): number;
/** A leg, or the whole route, in the trip's units. */
export declare function formatLeg(km: number, units: Units): string;
/** "Lisbon to Porto": the first and last named stops; the one name; or ''. */
export declare function routeName(v: TripView): string;
