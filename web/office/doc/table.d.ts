/**
 * A table block as a sheet: its typed columns, its rows of raw cells, the
 * cells a reader is to leave be (the lock) and the chart it asks for. A1
 * addressing, the lock's ranges, how formulas and the lock follow rows and
 * columns that move, and what the sheet's commands write (copy, paste,
 * fill, clear, sort) as rectangles of cells for a `cells` op. These are the
 * only places the kernel knows about A1 references.
 *
 * The lock and the chart are not fields of the table block: they ride on
 * the document's header for a sheet document (its first table) and on the
 * table's own attributes anywhere else. tableAt reads them from where they
 * are; withTable writes them back there. A chart is drawn under its table
 * unless "chart-at: top" (beside the chart, wherever it is) puts it above.
 */
import { type Column, type Doc } from './model.ts';
import type { Op } from './ops.ts';
/** The most rows a reference may name. */
export declare const ROWS = 1000;
/** One letter a column: A to Z. */
export declare const MAX_COLS = 26;
/** The columns' letters. */
export declare const COL_NAMES: string[];
declare const CHARTS: readonly ['bar', 'line', 'pie', 'sankey'];
/** The chart a table asks for, or none. */
export type Chart = '' | (typeof CHARTS)[number];
/** A table block as a sheet sees it. */
export interface Table {
    cols: Column[];
    /** The rows the block holds, each `cols.length` wide. */
    rows: string[][];
    /** From "lock:" (head or attr): the cells a reader is to leave be. */
    lock: Range[];
    chart: Chart;
    /** From "chart-at: top": the chart is drawn above the table rather than under it. */
    above?: true;
}
/** A rectangle of cells, corners included. */
export interface Range {
    r0: number;
    c0: number;
    r1: number;
    c1: number;
}
/** Day number (days since 1970-01-01) of a civil date, time zone free. */
export declare const ymdToDay: (y: number, m: number, d: number) => number;
/** The civil date of a day number; wd is 0 for Sunday. */
export declare function dayToYmd(day: number): {
    y: number;
    m: number;
    d: number;
    wd: number;
};
/** "2027-03-01". */
export declare const ymdString: (y: number, m: number, d: number) => string;
/** "B3" as [row, column], both from 0; null for what is no cell. */
export declare function refToRC(ref: string): [number, number] | null;
/** [row, column] as "B3". */
export declare const rcToRef: (row: number, col: number) => string;
/** The rectangle with these two corners. */
export declare const rangeOf: (a: [number, number], b?: [number, number]) => Range;
/** A rectangle as "A1:B3", or "A1" for one cell. */
export declare const rangeRef: (g: Range) => string;
/** The locked ranges, read from "B6:D9, F2": each a rectangle of cells. What is no range is left out. */
export declare function lockedRanges(lock: string): Range[];
/** The lock as it is written: "B6:D9, F2". */
export declare const lockText: (lock: Range[]) => string;
/** Whether a reader is to leave this cell be. */
export declare const isLocked: (lock: Range[], r: number, c: number) => boolean;
/** The lock with these cells locked (or, `on` false, with every range that touches them let go). */
export declare function withLock(lock: Range[], g: Range, on: boolean): Range[];
/** Where a row (or column) is after some move: its new place, or null when it is gone. */
export type Moved = (i: number) => number | null;
/** The move that moves nothing. */
export declare const stays: Moved;
/** Where each row (column) is once n are put in before `at`. */
export declare const movedIn: (at: number, n: number) => Moved;
/** Where each row (column) is once `a` to `b` are taken out: null for one of those. */
export declare const movedOut: (a: number, b: number) => Moved;
/** A formula as it reads after moving by (dr, dc): its references move with it. Words in quotes, and other text, are untouched. */
export declare function shiftFormula(raw: string, dr: number, dc: number): string;
/**
 * A formula's references after rows or columns move: `rows(r)` is where
 * row r is now, `cols(c)` where column c is, null if it is gone. A range
 * keeps what is left of it (taking rows out of its middle shrinks it;
 * putting rows in its middle grows it); a reference to a row or column
 * that is gone is #REF. Words in quotes are left alone.
 */
export declare function remapRefs(raw: string, rows: Moved, cols: Moved, gone?: {
    rows?: [number, number];
    cols?: [number, number];
}): string;
/** The lock after rows or columns move (movedIn, movedOut): each range follows them and keeps what is left of it, and goes when nothing is. */
export declare function remapLock(lock: Range[], rows: Moved, cols?: Moved): Range[];
/** The first table block of a document, or -1. */
export declare const firstTable: (doc: Doc) => number;
/** Whether the table at `at` keeps its lock or chart in the document's header: a sheet document's first table, with none of its own. */
export declare const inHead: (doc: Doc, at: number, key: 'lock' | 'chart') => boolean;
/** Block `at` as a table; its lock and chart from the block's attrs, else, when it is the document's first table, from the head. Null for no table. */
export declare function tableAt(doc: Doc, at: number): Table | null;
/** The doc with block `at` written from `t`: cells and columns into the block; lock and chart where they were read from. */
export declare function withTable(doc: Doc, at: number, t: Table): Op[];
/** How much of a table is in use: rows down to the last with something in it, columns across to the last with something, a name or a type of its own. */
export declare function usedSize(t: {
    cols: Column[];
    rows: string[][];
}): {
    rows: number;
    cols: number;
};
/** A name as a formula writes it: upper case, anything that is not a letter or a digit as "_" ("One-off gifts" is ONE_OFF_GIFTS). */
export declare const nameKey: (s: string) => string;
/** The cells with names: each cell of a name column names the cell to its right. The first of a name, reading down, is the one. */
export declare function namedCells(t: {
    cols: Column[];
    rows: string[][];
}): Map<string, [number, number]>;
/** A rectangle of cells to write with a `cells` op: its top left and its values. */
export interface Cells {
    r: number;
    c: number;
    values: string[][];
}
/** The cells of a range as text: tabs between cells, newlines between rows. What spreadsheets put on the clipboard. */
export declare function copyCells(t: {
    rows: string[][];
}, g: Range): string;
/** The range emptied. */
export declare const clearCells: (g: Range) => Cells;
/**
 * Tab-and-newline text pasted with its top left at (r, c), as the cells it
 * writes. `moved` shifts formulas' references (a copy within the sheet);
 * `into` repeats a single value over a whole selection. Nothing is written
 * past the table's last column or the thousandth row.
 */
export declare function pasteCells(t: {
    cols: Column[];
}, r: number, c: number, text: string, moved?: {
    dr: number;
    dc: number;
}, into?: Range): Cells & {
    range: Range;
};
/**
 * Two cells' words in a sort's order, low to high: numbers by their value and before words, words as a reader orders
 * them (case and accents aside, "Item 2" before "Item 10"). Neither is empty: where blanks go is the caller's. The
 * Spreadsheet's sort (sortRows) and a host's table (kit/ui/table-model.ts) order words by it.
 */
export declare function compareCells(x: string, y: string): number;
/**
 * The rows in order of column `c`, numbers before words, blanks last, as
 * the cells to write from the top. (The names above the columns are not a
 * row.) Formulas move with their rows as they are.
 */
export declare function sortRows(t: {
    cols: Column[];
    rows: string[][];
}, c: number, descending?: boolean): Cells;
/**
 * What a run of cells goes on as, when dragged further: the k-th cell
 * (k counted from the first of the run, negative before it), or null when
 * the run is no series and is repeated instead. Numbers in even steps;
 * dates by even days, or by whole months when the day stays put (a lone
 * date goes a day at a time); words ending in a number ("Week 1", "Q1"),
 * a lone one counting up by one; month and weekday names, round the year
 * and the week, spelled as they were (full or three letters).
 */
export declare function seriesOf(seed: string[]): ((k: number) => string) | null;
/**
 * Drag-fill: the cells of `src` carried out to `dest` (which contains it
 * and extends one way), as the whole of `dest` to write. Formulas move
 * their references; two or more numbers in step carry on counting;
 * anything else repeats.
 */
export declare function fillCells(t: {
    rows: string[][];
}, src: Range, dest: Range): Cells;
export {};
