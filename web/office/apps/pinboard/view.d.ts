/**
 * A pinboard drawn, with no DOM: each thing as SVG, and the page of them, cut to the box round everything. What
 * def.ts builds its pages and files on; the editor draws each thing with the same `itemSvg`, in the page's own colors,
 * with the pictures at the host's address.
 */
import type { Page } from '../../kit/core/app.ts';
import { type Doc, type Run } from '../../doc/index.ts';
import { type BoardView, type Item } from './model.ts';
export interface Theme {
    /** Words and strokes with no color of their own. */
    ink: string;
    /** What words over a line stand on (a join's label). */
    paper: string;
    /** A frame's edge and a picture's card with no color. */
    line: string;
    /** A card's ground, where a picture is not kept. */
    shade: string;
    muted: string;
}
export declare const PRINT: Theme;
/** The type of each kind's words, in px. */
export declare const WORDS_PX: {
    note: number;
    text: number;
    frame: number;
    join: number;
};
/** A note's room inside its edge. */
export declare const NOTE_PAD = 12;
/** The markers a join's arrowhead is drawn with: the theme's ink's, and one for each color. */
export declare function arrowDefs(ink: string): string;
/** Words laid in a box from its top-left: wrapped to `max`, at `px` unless they need less to fit `room` (never under 10), as lines of runs. */
export declare function layWords(words: string, max: number, px: number, room?: number): {
    px: number;
    lines: Run[][];
};
export interface ItemOpts {
    /** Where a picture is drawn from (the editor's: the host's address); null where it is not kept here. */
    href?: (ref: string) => string | null;
    /** Its words left out, while they are typed over it. */
    noWords?: boolean;
    /** A wide invisible edge, so a thin line or a frame's edge is easy to hit. */
    hit?: boolean;
}
/** One thing as SVG; `v` is the board it is on (a join finds its ends there). */
export declare function itemSvg(it: Item, v: Pick<BoardView, 'byId'>, th?: Theme, o?: ItemOpts): string;
/** The board in words for whoever cannot see it: how many things, and the frames by name. */
export declare function describeBoard(v: BoardView): string;
/** The board's one page: everything on it, cut to the box round it with a margin; an empty board a blank page. */
export declare function boardPage(doc: Doc): Page;
export declare const boardToSvg: (doc: Doc) => string;
