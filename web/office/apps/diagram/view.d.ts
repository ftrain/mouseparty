/**
 * A diagram drawn, with no DOM: each kind's layout (org, mind, family, lanes, timeline, venn, seating and
 * net) turns the document's lines into Draw's
 * shapes and joins, and Draw's renderer draws them (src/apps/draw/view.ts), so a diagram is a picture, a
 * page, a thumbnail and, opened in Draw, shapes to move about by hand. Each shape remembers what it was drawn
 * from (`hit`), so the editor can make a tap on it an edit of those words; a lane's band and a Venn's circles
 * are regions (`region`), so a tap or a drop there means "in this lane", "in these sets".
 */
import type { Page } from '../../kit/core/app.ts';
import { type Color, type Fill, type Kind, type Shape, type TextSize } from '../draw/model.ts';
import { type Doc } from '../../doc/index.ts';
import { type Hit, type Line } from './model.ts';
/** A shape of a diagram: Draw's, with what it was drawn from, and the region it is (a lane, a set). */
export type DShape = Shape & {
    hit?: Hit;
    region?: string;
};
export interface Diagram {
    shapes: DShape[];
    w: number;
    h: number;
    /** Presented a step at a time: how many shapes are drawn once step n has come (a lane with its first step, a step with the arrow that reaches it). Absent, a shape a step. */
    steps?: number[];
}
/** A shape, briefly. */
export declare const shape: (k: Kind, x: number, y: number, w: number, h: number, text?: string, f?: Fill, c?: Color, z?: TextSize, hit?: Hit) => DShape;
/** A join between shape numbers `from` and `to`: an arrow, or a plain line (dotted with f 2). */
export declare const join: (from: number, to: number, arrow?: boolean, text?: string, c?: Color, f?: Fill, hit?: Hit) => DShape;
/** The shapes moved to start at a margin, the page sized to hold them, in reading order. */
export declare function frame(drawn: DShape[], pad?: number): Diagram;
/** The lanes in order of first mention, and the steps; "- Sales:" alone is a lane with nothing in it yet. A line with no "Who:" is in the lane before it. */
export declare function lanesOf(doc: Doc): {
    lanes: string[];
    steps: {
        line: Line;
        lane: string;
    }[];
};
/** "When" as a point in time, in years: "1969", "1969-07-20", "July 1969", "44 BC"; NaN for anything else. */
export declare function moment(when: string): number;
/** "When" as a span of time, "1990–1999": its two ends in years, or null. */
export declare function era(when: string): [number, number] | null;
/** Where each dot goes along the axis: as the years fall when they are known and in order, else evenly; never closer than GAP. */
export declare function places(whens: string[]): number[];
interface Group {
    names: string[];
    items: {
        line: Line;
        item: number;
        label: string;
    }[];
    /** The line that names this group alone, where its name is typed. */
    line: Line;
}
/** The lines as sets (at most three) and what each group of them holds; a set named twice is one set, its things together. */
export declare function vennOf(doc: Doc): {
    groups: Group[];
    sets: string[];
};
/** A letter sheet, at 96 to the inch. */
export declare const LETTER: {
    w: number;
    h: number;
};
/** A place card, 4 by 2.5 inches. */
export declare const CARD: {
    w: number;
    h: number;
};
/** Cards laid out on sheets, `cols` × `rows` to a sheet, centred, each with a dashed line round it to cut along. */
export declare function tile(cards: Page[], cols: number, rows: number, sheet?: {
    w: number;
    h: number;
}): Page[];
/** A seating chart's place cards: one for each person at each table, eight to a letter sheet (two across, four down), to print and cut. */
export declare function placeCards(doc: Doc): Page[];
/** The document as its kind draws it. */
export declare const layout: (doc: Doc) => Diagram;
/** The regions under a point of the picture: a lane by its plain name, or the sets of a Venn whose circles hold it as a key writes them ("Fast & Cheap", "R\&D & Sales"). */
export declare function regionAt(d: Diagram, x: number, y: number): string | undefined;
/**
 * The diagram's one page, with words for anyone who cannot see it: as big as its kind lays it out. As a
 * thumbnail (`thumb`) a picture more than twice as wide as tall (a family tree of many) is its middle, twice as
 * wide as tall, so what shows can be read rather than a strip of specks.
 */
export declare function diagramPage(doc: Doc, upTo?: number, thumb?: boolean): Page;
export declare const diagramSvg: (doc: Doc) => string;
/** The diagram as a drawing Draw opens: scaled to fit its canvas, snapped to its grid, a row a shape. */
export declare function toDrawing(doc: Doc): string;
export {};
