/**
 * Edits as operations on a document. Eight primitives, each pure: `apply`
 * gives a new document that shares every block the operation did not touch
 * (so a view redraws only what changed), and `invert` gives the operations
 * that take the edit back, which is what undo is. Above them, the composed
 * edits every editor shares (Enter, Backspace, a family of list items moved
 * or indented) return lists of primitives, so undo and tests see primitives
 * only.
 *
 * Rows, columns and cells are table-aware: formulas and the lock follow rows
 * and columns that move (table.ts), and a locked cell is left as it is unless
 * the op says `force`. An op that cannot apply (a text op on a table, a
 * column past Z) throws; a rectangle of cells wider or taller than the table
 * is clipped to it.
 */
import { type Block, type Column, type Doc, type Run, type TextBlock } from './model.ts';
/** The eight primitive edits. */
export type Op = {
    op: 'head';
    key: string;
    value?: string;
} | {
    op: 'splice';
    at: number;
    n: number;
    blocks: Block[];
} | {
    op: 'move';
    at: number;
    n: number;
    to: number;
} | {
    op: 'text';
    at: number;
    from: number;
    to: number;
    runs: Run[];
} | {
    op: 'cells';
    at: number;
    r: number;
    c: number;
    values: string[][];
    force?: true;
} | {
    op: 'rows';
    at: number;
    r: number;
    n: number;
    rows?: string[][];
} | {
    op: 'cols';
    at: number;
    c: number;
    n: number;
    cols?: Column[];
} | {
    op: 'col';
    at: number;
    c: number;
    col: Column;
};
/** How many characters some runs hold: an icon or a footnote mark counts one. */
export declare const runLength: (runs: Run[]) => number;
/** The runs between two character positions, cut where they fall inside a run. */
export declare function sliceRuns(runs: Run[], from: number, to: number): Run[];
/** The offset of the first line break among the runs, or -1. */
export declare function lineEnd(runs: Run[]): number;
/**
 * Whether `op` is one `apply` can do to `doc`: its kind one of the eight, every index a whole number within the
 * document, and what it puts in (blocks, runs, cells, columns, a head key and value) of the schema's shape and within
 * the kernel's bounds (json.ts checkBlock, keptHead). Throws a RangeError or a TypeError naming the fault; `apply` and
 * `invert` ask first, so an op from anyone (another's client over a shared document, a program) either does what it
 * says or changes nothing. Whether the text keeps what the ops leave is the document's question, asked once the ops
 * are applied (json.ts keptDoc), since an editor's own edit may pass through a block the text would not keep.
 */
export declare function checkOp(doc: Doc, op: Op): void;
/** The document with one operation applied, once checkOp has passed it. Pure: untouched blocks are the same objects. */
export declare function apply(doc: Doc, op: Op): Doc;
/** Operations applied one after another. */
export declare const applyAll: (doc: Doc, ops: Op[]) => Doc;
/**
 * The operations that undo `op` applied to `doc`: usually one. Rows or
 * columns put in or taken out are undone by putting the table block back as
 * it was (a formula that lost its reference cannot be remapped home), and
 * the header's lock with it when the table keeps its lock there.
 */
export declare function invert(doc: Doc, op: Op): Op[];
/** The operations that undo a list applied in order (the inverses, last first). */
export declare function invertAll(doc: Doc, ops: Op[]): Op[];
/** One splice: the blocks [from, to) replaced. */
export declare const replaceSpan: (_doc: Doc, from: number, to: number, blocks: Block[]) => Op[];
/** Enter: text block `at` becomes two at `offset`. A list item keeps its depth and kind (a task's new item is not done); a heading's second half is a paragraph. */
export declare function splitBlock(doc: Doc, at: number, offset: number): Op[];
/** Backspace at the start of `at`: its words joined to the text block before it (`joined`). Nothing when either is not text. */
export declare function joinBlocks(doc: Doc, at: number): Op[];
/**
 * Two blocks of words made one: the first keeps its kind and takes the second's words. A heading is one line, which is
 * all the format can write of one (`## …`), so it takes the second's first line and the second keeps the lines after
 * it, as the block it was: no line break is lost, and none is held where the text cannot say it.
 */
export declare function joined(first: TextBlock, second: TextBlock): TextBlock[];
/** How far in a block sits as an item: a list item's depth, a block that says `{depth=N}`, or -1 for one that nests nothing. */
export declare const depthOf: (b: Block) => number;
/** Where item i's family ends: the first later block no deeper than it. The depths may be the caller's own (a lines app counts heading levels). */
export declare function family(doc: Doc, i: number, depths?: number[]): number;
/** Indent (by 1) or bring out (by -1) item i with its family; an item goes at most one deeper than the item above it, and no shallower than the margin. */
export declare function shiftFamily(doc: Doc, i: number, by: 1 | -1, depths?: number[]): Op[] | null;
/**
 * Move item i's family past the family before or after it at its level, as
 * one `move`. A lone item with no neighbour at its level steps past a block
 * that is no list item but has a depth of its own (a heading, where a lines
 * app gives its headings depths), so a line can cross from one section to
 * the next; it never steps past its own parent.
 */
export declare function moveFamily(doc: Doc, i: number, by: 1 | -1, depths?: number[]): Op[] | null;
/**
 * Put item i's family under item `to` (as its last child), or right after
 * `to`'s family at `to`'s level: a drag of one thing onto another. Null
 * when it makes no sense (onto itself or its own child); under a block that
 * is not an item means after it.
 */
export declare function placeFamily(doc: Doc, i: number, to: number, how: 'under' | 'after', depths?: number[]): Op[] | null;
/** Take item i away; its family comes out a level to sit where it was. */
export declare function removeItem(doc: Doc, i: number, depths?: number[]): Op[];
/** A rectangle of cells written at (r, c), the table given the rows it needs first: `rows` then `cells`. */
export declare function putCells(doc: Doc, at: number, r: number, c: number, values: string[][], force?: true): Op[];
