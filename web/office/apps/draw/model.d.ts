/**
 * A drawing as a view of the document, and its commands as operations. The document is the kernel's: a
 * table, a row per shape, and the alt text in the head:
 *
 *   ---
 *   alt: A browser asks a server.
 *   ---
 *   Kind | X | Y | W | H | Style | Label
 *   --- | --- | --- | --- | --- | --- | ---
 *   o | 4 | 6 | 16 | 8 | 1b | Browser
 *   o | 32 | 6 | 16 | 8 | 1b | Server
 *   k | 0 | 1 | 0 | 0 | 0 | asks
 *
 * Coordinates are in 8px grid units so they stay short. Lines and arrows use X, Y as the start and W, H as
 * the distance to the end. Style is the fill (0, 1 or 2), then optionally a colour letter and a text size
 * digit: "1", "2b", "0r3". Black and the normal text size are the defaults and are left out. A text ('t') may
 * end its Style with how its words sit: "=" centred, ">" right ("1b3=", "0>"); left is the default and has
 * no mark (read anywhere in the cell, written last, and only for a text). A shape may be
 * turned: a Rot column, in whole degrees clockwise about the shape's centre, there only while a shape is
 * turned and blank (0) for the others; lines, arrows and joins are never turned.
 *
 * Kinds: r rectangle, o rounded box, e ellipse, d diamond, h hexagon, p parallelogram, c cylinder, n note,
 * t text, i icon (its label is the icon's name), l line, a arrow, v any shape and w a stroke (their corners
 * in a Points column, there only while one is drawn), and two that join shapes: k (arrow) and j (line).
 * For those, X and Y are not places but the numbers of the two shapes joined, counting rows from 0, so the
 * join follows its shapes wherever they go. Read leniently, a kind may be named in words ("rectangle",
 * "arrow") and the columns may come in any order. A label may start with an icon, ":rocket Launch", drawn
 * before the words; " | " in a label starts a second, smaller line. The words are rich: each line is inline
 * Markdown as the kernel writes runs (writeInline: **bold**, *italic*, ++underline++, ~~struck~~, ==marked==),
 * read by parseInline and drawn as tspans; a person never types the marks, the label's editor writes them.
 *
 * Pixel mode (`grid: 8|16|32|64` in the head): the one `p` block is the grid, a line a row, a letter a
 * square (a to h the inks, "." clear), as the old pixel app wrote it. "Use as background" writes the grid
 * into the head as a `tile:` (kit/draw/tile.ts), drawn behind the shapes.
 *
 * Every command here is pure: given the document and what to do, the `Op[]` that does it. A shape changed
 * is `cells` on its row; one added or taken away is `rows`; the joins that must be renumbered are `cells`;
 * a column that is wanted and missing is `cols`. The one `splice` is the table's birth and death (and the
 * pixel block, which is replaced whole, as a paragraph is).
 *
 * The clipboard carries shapes as a drawing of their own (shapesToTlo): a table of their rows, the joins among
 * them numbered within it, so a copy pastes into another drawing, into Motion, or into a sheet as a table.
 */
import { type Doc, type Op, type Run, type TableBlock, type TextNode } from '../../doc/index.ts';
import { type Tile } from '../../kit/draw/tile.ts';
export declare const W = 640;
export declare const H = 400;
export declare const GRID = 8;
export declare const KINDS: readonly ['r', 'o', 'e', 'd', 'h', 'p', 'c', 'n', 'i', 'l', 'a', 't', 'k', 'j', 'v', 'w'];
export type Kind = (typeof KINDS)[number];
/** A label's icon and its words: ":rocket Launch" is ['rocket', 'Launch']. */
export declare function iconOf(label: string): [string, string];
/** A label's words (after its icon) as lines of runs: " | " starts a line; the marks are inline Markdown. Links and notes are not a label's: their words stay, plain. */
export declare function labelLines(words: string): Run[][];
/** Lines of runs as a label's words: each line inline Markdown, joined by " | ". */
export declare const labelText: (lines: Run[][]) => string;
/** A label as plain words, the marks taken out (what is read aloud, measured, described). */
export declare const labelPlain: (text: string) => string;
/** Kinds that join two shapes rather than sit somewhere. */
export declare const isLink: (k: Kind) => k is "j" | "k";
/** Kinds drawn as a stroke with no inside. */
export declare const isLine: (k: Kind) => k is "a" | "j" | "k" | "l";
/** Kinds that may be turned (every one but lines, arrows and joins). */
export declare const canTurn: (k: Kind) => k is "c" | "d" | "e" | "h" | "i" | "n" | "o" | "p" | "r" | "t" | "v" | "w";
/** Kinds with corners of their own (the pen's and the hand's). */
export declare const isDrawn: (k: Kind) => k is "v" | "w";
export type Fill = 0 | 1 | 2;
export type Color = 'r' | 'o' | 'g' | 'b' | 'p';
export type TextSize = 1 | 2 | 3 | 4;
/** How a text's words sit in its box: 'c' centred, 'r' against the right; absent for the left. */
export type Align = 'c' | 'r';
export interface Shape {
    k: Kind;
    x: number;
    y: number;
    w: number;
    h: number;
    f: Fill;
    text: string;
    /** Colour of the outline and label; absent for the default ink. */
    c?: Color;
    /** Text size; absent for the normal size (2). */
    z?: TextSize;
    /** For a text ('t'): centred or right; absent for the left. */
    al?: Align;
    /** For 'v' and 'w': the corners, x,y pairs as hundredths of the box, in order. */
    pts?: number[];
    /** Turned this many whole degrees clockwise about its centre (0 to 359); absent for none. */
    rot?: number;
}
/** Degrees as a shape keeps them: whole, 0 to 359. */
export declare const normRot: (deg: number) => number;
/** Points as x, y pairs (a stray last number is left out). */
export declare const pairs: (pts: number[]) => [number, number][];
/** Points as the text keeps them: "12:0;100:50;0:100". */
export declare const ptsText: (pts: number[]) => string;
export declare const ptsOf: (text: string) => number[];
/** The colours a shape may take (the kit's palette, by letter: told apart by every pair of eyes). */
export declare const COLORS: Record<Color, string>;
export declare const TEXT_PX: Record<TextSize, number>;
/** How a shape is painted, given the theme's ink, paper and grey. */
export declare function paint(s: Shape, ink: string, paper: string, shade: string): {
    stroke: string;
    fill: string;
    fillOpacity: number;
    text: string;
    px: number;
    marker: string;
};
/** A description made from the shapes themselves, when nobody wrote one: what is labelled, and what leads to what. A start, not a substitute. '' for no shapes. */
export declare function describeDrawing(shapes: Shape[]): string;
declare const FIELDS: readonly ['kind', 'x', 'y', 'w', 'h', 'style', 'label', 'points', 'rot'];
type Field = (typeof FIELDS)[number];
/** Where each field's column is in a table, -1 for one it has not got. */
export type Cols = Record<Field, number>;
/** The index of the pixel grid's paragraph: the first `p`; -1 for none. */
export declare const pixelsAt: (doc: Doc) => number;
/** The cells of a shape's row, by field. */
export declare function shapeCells(s: Shape): Record<Field, string>;
/** What the drawing draws, read from the document. */
export interface DrawView {
    /** The table of shapes, or -1 while there is none. */
    at: number;
    /** Each shape, and the row it sits in (a row that is no shape is skipped and left alone). */
    shapes: Shape[];
    rows: number[];
    cols: Cols;
    alt: string;
    /** Pixel mode: the grid's side (8, 16, 32 or 64), or 0 for shapes. */
    grid: number;
    /** The pixel grid, `grid` rows of `grid` letters; the block it is read from, or -1. */
    pixels: Tile;
    pixelsAt: number;
    /** The background tile, if the head carries one. */
    tile: Tile | null;
}
export declare function readDrawing(doc: Doc): DrawView;
/** Where a join's line runs: from the edge of one shape's box to the edge of the other's. Null if either is missing. */
export declare function linkEnds(s: Shape, all: Shape[]): [number, number, number, number] | null;
/** A shape's box as drawn: [x, y, w, h], never negative (a join's is the line between its shapes). */
export declare function bounds(s: Shape, all: Shape[]): [number, number, number, number];
/**
 * Where an editor of a shape's words goes, laid exactly over them: the same font at the size the picture shows
 * it (`k` CSS pixels to a unit, the picture's corner at `ox`, `oy` in the editor's frame), centred in the shape
 * (for a text, from the left, the centre or the right as it is aligned), turned with it. Below 16px it is set at 16 and scaled down, so iOS does not zoom.
 * The Drawing Tool's words and the Diagram Maker's are placed by it.
 */
export declare function wordsOver(s: Shape, all: Shape[], k: number, ox: number, oy: number, th: {
    ink: string;
    paper: string;
    shade: string;
    onTint?: (color: string) => string;
}): {
    style: {
        left: string;
        top: string;
        fontSize: string;
        transform: string;
        textAlign: string;
        minWidth: string;
        maxWidth: string;
        color: string;
    };
    left: boolean;
    wrap: boolean;
};
/** The text shapes among `picked` set left (''), centred ('c') or right ('r'): their Style cells, the others left alone. */
export declare function alignOp(doc: Doc, picked: number[], al: Align | ''): Op[];
/** The alignment after this one, for a button that goes round them: left, centred, right, left. */
export declare const nextAlign: (al: Align | undefined) => Align | '';
/** A point turned `deg` degrees clockwise about (cx, cy). */
export declare function turnPoint(x: number, y: number, cx: number, cy: number, deg: number): [number, number];
/** A shape's box as it shows, turned: the box round its turned corners (the same as `bounds` for a shape not turned). */
export declare function turnedBounds(s: Shape, all: Shape[]): [number, number, number, number];
/**
 * The shapes a marquee from (x0, y0) to (x1, y1) takes: every shape whose box (as it shows) lies inside it, and
 * every join whose two shapes are taken. In the drawing's order.
 */
export declare function shapesWithin(all: Shape[], x0: number, y0: number, x1: number, y1: number): number[];
/** A path with the points that do not change its course taken out (Ramer–Douglas–Peucker), so a hand's wobble is a few corners. */
export declare function simplify(pts: [number, number][], eps?: number): [number, number][];
/** Points drawn (in px) as a shape: closed and filled, or, open, a stroke. A hand-drawn line that ends near where it began is closed too. Null for too few points. */
export declare function strokeShape(pts: [number, number][], closed?: boolean): Shape | null;
/** A new shape, at the end. */
export declare function addShape(doc: Doc, s: Shape): Op[];
/** Shape i changed: its row's cells. */
export declare function patchShape(doc: Doc, i: number, patch: Partial<Shape>): Op[];
/** Shape i taken out, along with any joins to it; the joins that remain keep pointing at the right shapes. */
export declare const removeShape: (doc: Doc, i: number) => Op[];
/** Several shapes taken out together, with every join to any of them; the joins that remain are renumbered. */
export declare function removeShapes(doc: Doc, picked: number[]): Op[];
/** Several shapes changed at once, each its own patch: the ops of each written against the document the ones before it left. */
export declare function patchShapes(doc: Doc, patches: [number, Partial<Shape>][]): Op[];
/** Shape i put at place `to` in the stack (0 the back, drawn first); the joins follow. */
export declare function restackTo(doc: Doc, i: number, to: number): Op[];
/**
 * Shapes moved in the stack together, keeping their order among themselves: to the front, to the back, or one
 * place forward (1) or back (-1), never past one another. Where they ended up is given with the ops.
 */
export declare function restackShapes(doc: Doc, picked: number[], how: 'front' | 'back' | 1 | -1): {
    ops: Op[];
    at: number[];
};
/** Shape i brought to the front (drawn last) or sent to the back; the joins follow. Where it ended up is given with the ops. */
export declare function restack(doc: Doc, i: number, toFront: boolean): {
    ops: Op[];
    at: number;
};
/** A copy of shape i, a little down and to the right, at the end. */
export declare function duplicate(doc: Doc, i: number): Op[];
/** Copies of several shapes (and the joins among them), a little down and to the right, at the end; `sel` is every copy. */
export declare function duplicateShapes(doc: Doc, picked: number[]): {
    ops: Op[];
    sel: number[];
};
/** The alt text: what the drawing shows, in words. */
export declare const setAlt: (doc: Doc, alt: string) => Op[];
/** Pixel mode on (a side) or off (0). */
export declare const setGrid: (doc: Doc, side: number) => Op[];
/** The background tile ('' for none). */
export declare const setTile: (doc: Doc, ref: string) => Op[];
/** The pixel grid as it now is: its paragraph replaced (or put in, or, empty, taken out). */
export declare function setPixels(doc: Doc, p: Tile): Op[];
/** Square (x, y) given this ink ('.' clears it). */
export declare function paintSquare(p: Tile, x: number, y: number, ink: string): Tile;
/** Fill: every square joined to (x, y) of the same ink becomes this one. */
export declare function floodSquare(p: Tile, x: number, y: number, ink: string): Tile;
/** Shapes picked out of a drawing by number, in the drawing's order, as a drawing of their own: the joins among them renumbered, joins to a shape left behind dropped. */
export declare function pickShapes(all: Shape[], picked: number[]): Shape[];
/** Shapes as the table that holds them (Points only when one is drawn with the pen or by hand). */
export declare function shapesTable(shapes: Shape[]): TableBlock;
/** Shapes as a complete drawing in TLO: what the clipboard's text holds. */
export declare const shapesToTlo: (shapes: Shape[]) => string;
/** Shapes read from pasted text: the first table with a Kind column, its joins numbered within it (joins to shapes not there dropped). [] when there is none. */
export declare function shapesFromText(text: string): Shape[];
/**
 * Shapes pasted into a drawing: added at the end as one `rows` op (after the table's birth or a missing
 * column, if need be), each a grid step down and to the right of where it was (further, while a shape already
 * sits there, so a paste over its copy shows), the joins among them renumbered to their new rows. `sel` is the
 * last pasted shape that is no join (the one drawn on top).
 */
export declare function pasteShapes(doc: Doc, shapes: Shape[], step?: number): {
    ops: Op[];
    sel: number;
    all: number[];
};
/**
 * A drawing as text (AppDef.text, Motion's too): what it shows in words (its alt, else a description made from its
 * shapes), then each shape's label in the order drawn, its icon and its marks left out. A join, an icon and a shape
 * with no words are not said; nothing of where anything sits is.
 */
export declare function drawingText(v: DrawView): TextNode[];
export {};
