/**
 * A pinboard as a view of the document, and its commands as operations. The document is the kernel's: one table, a
 * row per thing pinned, and a picture's bytes, where a host keeps them, as the image fence every app knows:
 *
 *   ---
 *   title: Rear Window
 *   ---
 *   Id | Kind | X | Y | W | H | Color | Words
 *   --- | --- | --- | --- | --- | --- | --- | ---
 *   act1 | frame | 0 | 0 | 720 | 440 | blue | Act one
 *   n1 | note | 40 | 80 | 200 | 160 |  | Jeff watches **everyone**
 *   p1 | picture | 280 | 80 | 320 | 180 |  |
 *   a1 | arrow | n1 | p1 |  |  |  | sees
 *   s1 | pen | 60 | 300 | 160 | 60 | pink | 0:100;40:0;100:60
 *
 *   ```image {#p1 alt="The courtyard at night" w=1280 h=720}
 *   asset:7f3a9c
 *   ```
 *
 * X, Y, W and H are whole pixels on an unbounded canvas (X and Y may be negative). Kinds: `note` (a sticky note, its
 * words on a color), `text` (words on nothing), `picture`, `frame` (a titled region drawn behind everything else),
 * `pen` (a freehand stroke: its Words are its corners, x:y pairs as hundredths of its box, as the Drawing Tool keeps
 * a stroke's), and two that join things, `arrow` and `line`, whose X and Y are the ids of the two things joined, so
 * a join follows them wherever they go. Color is one of `yellow orange pink purple blue green`, or blank for the
 * kind's own (a yellow note, an ink's black, a gray frame). Words are inline Markdown (`**bold**`, `*italic*`), one
 * line, wrapped where they are drawn. The rows are drawn in their order, frames first and joins last, so a later row
 * is on top; Bring to front takes a row out and puts it back at the end.
 *
 * Why an Id column, where the Drawing Tool numbers its rows: the board is edited by several people at once
 * (docs/kernel.md §12, a watch party's viewers each in their own window), and a row's number is not a name that
 * survives that. When one person adds a note while another draws an arrow to the fifth row, the kernel's transform
 * shifts the arrow's own row past the note, but it cannot know that the "4" in the arrow's X cell meant a row, so the
 * arrow would land on the wrong thing; the Drawing Tool renumbers its joins with `cells` ops that are themselves made
 * against a numbering the other person's edit has already changed. An id is a word the kernel never touches: rows
 * come and go around it, a join keeps naming what it named, a picture's fence is found by it (`{#p1}`) wherever the
 * blocks move, and the editor keeps what is in hand by it across another's edits. Ids are short, a letter for the
 * kind and three of four random letters and digits, made where the thing is made (`newId`); two people making the
 * same id at the same moment is a chance of one in 1.7 million, and a duplicate is still drawn, only a join to it
 * finding the first.
 *
 * Every command here is pure: given the document and what to do, the `Op[]` that does it, chosen so that two people
 * rarely meet. Moving or resizing a thing is `cells` on its row's X and Y (or W and H): different things are
 * different cells, so two people moving two things never conflict, and two moving one, the later wins. Its words and
 * its color are `cells` on their own cells. A thing added is a `rows` op putting one row in at the table's end (and a
 * picture's fence a `splice` at the document's end); taken away, a `rows` op taking its row out, with every join to
 * it (and its fence). The table is made with the board (blank() holds it) and never taken out, so two people's first
 * notes land in one table; a document without one is given it by a `splice` (and a column it lacks by `cols`).
 */
import { type Doc, type Image, type Op, type Run, type TableBlock, type TextNode } from '../../doc/index.ts';
import type { FenceBlock } from '../../doc/model.ts';
export declare const KINDS: readonly ['note', 'text', 'picture', 'frame', 'pen', 'arrow', 'line'];
export type Kind = (typeof KINDS)[number];
/** The colors a thing may take, by name; '' is the kind's own. */
export declare const COLOR_NAMES: readonly ['yellow', 'orange', 'pink', 'purple', 'blue', 'green'];
export type Color = (typeof COLOR_NAMES)[number];
/** Each color as a note's paper and as an ink (words, a stroke, an arrow, a frame's edge), told apart in the light and the dark. */
export declare const COLORS: Record<Color, {
    paper: string;
    ink: string;
}>;
/** The words on a note: dark on every paper, in the dark theme too (a note is paper). */
export declare const NOTE_INK = "#1f2937";
/** The columns, in the order the board writes them. */
declare const FIELDS: readonly ['id', 'kind', 'x', 'y', 'w', 'h', 'color', 'words'];
type Field = (typeof FIELDS)[number];
export type Cols = Record<Field, number>;
/** The default sizes of a new thing, in pixels. */
export declare const SIZES: Record<'note' | 'text' | 'frame' | 'picture', [number, number]>;
/** The smallest a thing is made by its handle. */
export declare const MIN = 24;
/** A frame's title strip, along its top inside it: where it is picked up. */
export declare const FRAME_HEAD = 36;
export interface Item {
    /** Its id (a row with none has one made for it here, `#<row>`, which no join can name and nothing writes). */
    id: string;
    k: Kind;
    x: number;
    y: number;
    w: number;
    h: number;
    color: Color | '';
    /** Its words as inline Markdown; '' for a pen's stroke and a picture. */
    words: string;
    /** A join's ends: the ids of the things it joins. */
    from?: string;
    to?: string;
    /** A pen's corners, x, y pairs as hundredths of its box. */
    pts?: number[];
    /** A picture's fence, read: its reference, its words (alt) and its size; absent where its fence is missing. */
    image?: Image;
    /** The row it is read from. */
    row: number;
}
/** What the board draws, read from the document. */
export interface BoardView {
    /** The table, or -1 while there is none. */
    at: number;
    cols: Cols;
    /** Each thing in the table's order (rows that are no thing are skipped and left alone). */
    items: Item[];
    /** A thing by its id (the first, where two share one). */
    byId: Map<string, Item>;
    /** Each picture's fence, by the id it carries: its block. */
    fences: Map<string, number>;
}
/** Points as the text keeps them: "12:0;100:50". */
export declare const ptsText: (pts: number[]) => string;
export declare const ptsOf: (text: string) => number[];
declare const isJoin: (k: Kind) => boolean;
export { isJoin };
export declare function readBoard(doc: Doc): BoardView;
/** The things in the order they are drawn: frames at the back, then the rest as their rows come, joins on top. */
export declare const drawOrder: (v: BoardView) => Item[];
/** A note's paper, or a thing's ink, by its color: the theme's ink where it has none. */
export declare const paperOf: (it: Pick<Item, 'color'>) => string;
export declare const inkOf: (it: Pick<Item, 'color'>, ink: string) => string;
export type Box = [x: number, y: number, w: number, h: number];
/** Where a join runs: from the edge of one thing's box toward the other's centre, to the edge of the other. Null where either is missing (or is a join). */
export declare function joinEnds(j: Item, v: Pick<BoardView, 'byId'>): [number, number, number, number] | null;
/** A thing's box as drawn (a join's, the box round its line); null for a join that joins nothing there. */
export declare function boxOf(it: Item, v: Pick<BoardView, 'byId'>): Box | null;
/** The box round every thing given (all of them by default); null for none. */
export declare function boundsOf(v: BoardView, items?: Item[]): Box | null;
/** The things a box from (x0, y0) to (x1, y1) takes: every thing wholly inside it, and every join whose two ends are taken. Ids, in the table's order. */
export declare function itemsWithin(v: BoardView, x0: number, y0: number, x1: number, y1: number): string[];
/** What a frame holds: every other thing (frames too) wholly inside it, which goes with it when it moves. Ids. */
export declare function frameHolds(v: BoardView, frame: Item): string[];
/** A path with the points that do not change its course taken out (Ramer–Douglas–Peucker), so a hand's wobble is a few corners. */
export declare function simplify(pts: [number, number][], eps?: number): [number, number][];
/** Points drawn with the pen (in canvas pixels) as a stroke: its box theirs, its corners hundredths of it. Null for fewer than two. */
export declare function penStroke(pts: [number, number][], id: string, color?: Color | ''): Item | null;
/** A new id for a thing of kind `k`: its letter and four random letters and digits, none the board has already (`taken`). */
export declare function newId(k: Kind, taken: {
    has(id: string): boolean;
}, rand?: () => number): string;
/** The board's empty table, as a new board holds it. */
export declare const emptyTable: () => TableBlock;
/** What may be changed of a thing. */
export type Patch = Partial<Pick<Item, 'k' | 'x' | 'y' | 'w' | 'h' | 'color' | 'words' | 'pts' | 'from' | 'to'>>;
/** A thing as it is added: its kind and place, its id made by the caller (`newId`). */
export type NewItem = Omit<Item, 'row' | 'image'> & {
    row?: number;
};
export declare const addItem: (doc: Doc, it: NewItem) => Op[];
/** A picture put in: its row, and its fence (from kit/draw/image-picture.ts putImage) carrying the row's id. */
export declare function addPicture(doc: Doc, it: NewItem, fence: FenceBlock): Op[];
/** Several things changed, each its own patch, by id: the cells of each, written against the document the ones before it left. */
export declare function patchItems(doc: Doc, patches: [id: string, patch: Patch][]): Op[];
export declare const patchItem: (doc: Doc, id: string, p: Patch) => Op[];
/** Things moved by (dx, dy): their X and Y cells, each thing its own op. */
export declare function moveItems(doc: Doc, ids: string[], dx: number, dy: number): Op[];
/** Things taken out, with every join to them (and any join left joining nothing), and a picture's fence. */
export declare function removeItems(doc: Doc, ids: string[]): Op[];
/** Things lifted off the board to be put down again (cut, copy, duplicate): the things, the joins among them, and the pictures' fences. */
export interface Clip {
    items: Item[];
    joins: Item[];
    fences: FenceBlock[];
}
/** The things of these ids (no joins), the joins between two of them, and their pictures' fences. */
export declare function clipOf(doc: Doc, ids: string[]): Clip;
/** A clip put down (dx, dy) from where it was taken, on top, every thing and join with a new id; `ids` are the copies'. */
export declare function pasteItems(doc: Doc, clip: Clip, dx: number, dy: number, rand?: () => number): {
    ops: Op[];
    ids: string[];
};
/** Copies of things (and the joins among them), `by` pixels down and to the right, on top; `ids` are the copies'. */
export declare const duplicateItems: (doc: Doc, ids: string[], by?: number, rand?: () => number) => {
    ops: Op[];
    ids: string[];
};
/** Things brought to the front (drawn last among their kind), keeping their order among themselves: each row taken out and put back at the end. */
export declare function toFront(doc: Doc, ids: string[]): Op[];
/** A join from one thing to another (an arrow, or a line), on top. Nothing where either is missing or a join, or they are the same. */
export declare function joinItems(doc: Doc, from: string, to: string, id: string, k?: 'arrow' | 'line'): Op[];
/** A picture's words (its alt): its fence replaced by itself with them, every other attribute riding along. */
export declare function setAlt(doc: Doc, id: string, alt: string): Op[];
/** A thing's words as runs (bold, italic…): links and notes are not a thing's, their words stay plain. */
export declare function wordsRuns(words: string): Run[];
/** Runs as a thing's words: inline Markdown on one line. */
export declare const runsWords: (runs: Run[]) => string;
/** A thing's words, plain. */
export declare const plainWords: (words: string) => string;
/** What a thing is called, read aloud: its words, a picture's alt. */
export declare const nameOf: (it: Item) => string;
/**
 * The board as text (AppDef.text): each frame's title as a heading and the words of what it holds, then the words of
 * what no frame holds, then each arrow as "this → that", in words. Nothing of where anything sits.
 */
export declare function boardText(v: BoardView): TextNode[];
