/**
 * The sheet as a view of a document, and its commands as operations. The document is the kernel's: one
 * table block (its first), the lock and the chart in the head. `readSheet` is `tableAt` plus what the grid
 * needs drawn: three columns at the least, the values worked out, where the names point, the headline
 * (`{big=…}`). Every command here is pure: given the document and what to do, the `Op[]` that does it,
 * in order, so the editor's `edit()` applies them and undo sees primitives only.
 *
 * A document with no table yet gets one with the first edit (`ensure`): three text columns named for their
 * letters, since the format needs words over its columns. Columns typed into past the table's edge are
 * added as they are needed; trailing blank rows are never written.
 */
import { type Cells, type CellValue, type Chart, type ColType, type Column, type Doc, type Op, type Range, type Table } from '../../doc/index.ts';
/** A sheet is never narrower than three columns. */
export declare const MIN_COLS = 3;
/** What the sheet draws, read from the document. */
export interface SheetView {
    /** The table block, or -1 while the document has none. */
    at: number;
    /** The table as the block holds it (its columns may be fewer than `cols`). */
    table: Table;
    /** The columns drawn: the table's, padded to MIN_COLS with default names. */
    cols: Column[];
    /** The values of the held rows, `cols.length` wide. */
    values: CellValue[][];
    named: Map<string, [number, number]>;
    used: {
        rows: number;
        cols: number;
    };
    /** The headline (`{big=Payment}` or `{big=D4}`): a name or a reference, with its value as its column shows it. */
    big: {
        label: string;
        value: string;
    } | null;
    /** The document's currency (its head's `currency:`), for money columns that name none. */
    currency?: string;
}
/** The currency column c's money is shown in: its own, else the document's, else none ("$"). */
export declare const currencyAt: (v: Pick<SheetView, 'cols' | 'currency'>, c: number) => string | undefined;
/** The name a column goes by when nobody has named it: its letter. */
export declare const letterName: (c: number) => string;
export declare const isLetterName: (name: string) => boolean;
/** The kind of thing a type is called, as a column's default name ("Date", "Money B" when an earlier column already goes by that). */
export declare function typeName(c: number, cols: Column[], type?: ColType): string;
/** A column a sheet grows on its own (a blank sheet's three, or one typed past the edge): words in the first, numbers in
 * the second (Paul, 2026-10-12: a sheet's defaults), words after that. A column put in by hand, here or in a page's
 * table, holds words. */
export declare const defaultType: (c: number) => ColType;
/** The document's first table as a sheet, with everything the grid draws. */
export declare function readSheet(doc: Doc): SheetView;
/** One cell typed into. A locked cell is left as it is (the op's own rule). */
export declare function setCell(doc: Doc, r: number, c: number, raw: string): Op[];
/** A rectangle of cells written (a paste, a fill, a clear, a sort). `force` writes through the lock (a sort moves whole rows). */
export declare function putRect(doc: Doc, cells: Cells, force?: true): Op[];
/** The rows in order of column c. */
export declare function sortBy(doc: Doc, c: number, descending?: boolean): Op[];
/** `n` blank rows put in before row r. Nothing to move when r is past the rows held. */
export declare function insertRows(doc: Doc, r: number, n: number): Op[];
/** Rows r0 to r1 taken out; formulas and the lock follow. */
export declare function deleteRows(doc: Doc, r0: number, r1: number): Op[];
/** Where each row is once rows r0 to r1 have moved by `by` (±1, or more), the rows they passed taking their place. */
export declare function rowsMoved(r0: number, r1: number, by: number): (r: number) => number;
/** A formula's references after rows were reordered by `to`: a cell follows its row; a range follows the rows at its corners (and stays a range, its corners in order). Words in quotes are left alone. */
export declare function reorderRefs(raw: string, to: (r: number) => number): string;
/** Rows r0 to r1 moved up (by < 0) or down past their neighbours, formulas and the lock following them. Nothing when they would leave the sheet. */
export declare function moveRows(doc: Doc, r0: number, r1: number, by: number): Op[];
/** A column put in before column c (after the last, from the + at the end of the header). Null when the sheet is as wide as it goes. */
export declare function addColumn(doc: Doc, c: number): Op[] | null;
/** Whether column c may go: any column, whatever it holds, while the table keeps one; one drawn past the table's edge while the sheet is wider than three. */
export declare function removable(view: SheetView, c: number): boolean;
/** Column c taken out, cells and all: the columns after it move left, and references into it become #REF (the kernel's `cols` op). */
export declare function removeColumn(doc: Doc, view: SheetView, c: number): Op[];
/**
 * What column c holds. A column that goes by a default name takes the name of what it now holds; one named by hand
 * keeps its name. A money column may name its currency ("£", "GBP"); none, or '', takes the document's.
 */
export declare function setType(doc: Doc, c: number, type: ColType, currency?: string): Op[];
/** Column c named; '' (or its default) gives it its default name back. */
export declare function rename(doc: Doc, c: number, name: string): Op[];
/**
 * The chart the sheet asks for: head ops where the chart lives in the head (a sheet document), else the table's
 * attributes. A chart put in where there was none goes above the table ("chart-at: top"); another kind keeps the
 * place of the one it replaces (a chart already below stays there); no chart takes the place away with it.
 */
export declare function setChart(doc: Doc, chart: Chart): Op[];
/** The cells of `g` locked, or (`on` false) every lock touching them let go; a head op where the lock lives in the head. */
export declare function setLock(doc: Doc, g: Range, on: boolean): Op[];
