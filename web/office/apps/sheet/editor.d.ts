/**
 * <to-sheet-editor>: a spreadsheet with formulas, and a chart of it if you ask. A grid of <input>s over the
 * kernel's table (model.ts reads it; every command is Op[] through edit()).
 *
 * Three columns to start; the + at the end of the header adds one, and a column's menu puts one in after
 * it or takes it out (whatever it holds: references into it become #REF; the table keeps one column, and
 * the sheet is drawn three wide at the least). The letters over the columns and the numbers down the side
 * are the sheet's own controls, not cells: drawn quietly, the side as narrow as its widest number. The table scrolls in a box of its
 * own, its header rows and row numbers stuck to its edges, and the page under it holds still: a cell is
 * focused without scrolling the page, and the bar above keeps its shape whatever is selected.
 *
 * Drag across cells (or hold Shift) to select a block: it can be copied, cut, pasted, cleared, or carried
 * on with the handle at its corner. While a formula is being edited, tapping another cell inserts its
 * reference instead of moving there. Column widths are a view setting, not part of the document.
 *
 * It edits as docs/editing.md §4 says a grid does: a cell reached is selected whole, so typing replaces it (F2
 * puts the caret at the end); Enter, Tab and the arrows move; Escape puts back what the cell held; Mod+D fills
 * down; Alt+Up/Down move rows. A block has a bar under it (fill, Copy, Cut, Paste, Clear), the clipboard holds
 * the cells as text and as our table HTML, and every edit marks the cells it touched so an undo selects them.
 *
 * What a column holds changes its cells: a checkbox is a box a tap (or Space) ticks; an option cell offers
 * the words its column already holds (a <datalist>, opened by its caret) and takes new ones; a rich cell is a
 * <to-text shape=line> (the selection bubble for its marks), its words written by the code in the kernel's
 * inline form, the grid's keys kept round it and the formula strip showing its plain words, read-only.
 *
 * Find in this document (Mod+F) goes from cell to matching cell: `find()` is the kit's Findable.
 *
 * Read-only (a page's, docs/library.md step 8), a cell activated is picked ("docpick", its row and column), and the
 * page may mark rows and cells (`marks`, SheetMark: a count of comments, say): a small badge at the end of the row's
 * first cell, or of the cell named, its words the page's and its title said on hover, drawn over the sheet and never
 * written into the document. A sheet that edits draws none; with none given the sheet is drawn as ever.
 *
 * On a phone with the keyboard up (Paul, 2026-10-11: "no room to navigate"): the header steps aside as for any box
 * (kit/ui/chrome.ts `editing`), the formula strip takes the column's top with the menu button at its end, the column
 * heads are one line (the letter and the name, style.css), the table's box is what is left above the bar, and the cell
 * in hand is kept in sight as that box changes its height. A number, money or percent column asks for the numbers
 * keyboard, a date column for the digits, a formula for the letters from its = on; the bar's ABC (`letters`) asks for
 * the letters in that column for the visit (the device's own switch works too).
 */
import { type PropertyDeclarations } from 'lit';
import { type ChartKind } from '../../kit/draw/chart.ts';
import { DocElement, type Entry, type Picked } from '../../kit/core/element.ts';
import type { Found } from '../../kit/ui/find.ts';
import { type Column, type Doc, type Op, type Range } from '../../doc/index.ts';
import { type SheetView } from './model.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/context.ts';
import '../../kit/ui/insert.ts';
import '../../kit/ui/menu.ts';
import '../../kit/text/text.ts';
import './style.css';
export declare const tag = "to-sheet-editor";
/** A page's mark on a read-only sheet: on a row (at its first cell) or on one cell, its words (a count) and what hovering it says. */
export interface SheetMark {
    /** The table's row, from 0, as "docpick" names it. */
    row: number;
    /** The column, from 0; none, the row's first cell. */
    col?: number;
    text: string;
    title?: string;
}
/** Where the caret is in the cell being typed in (an <input>, or a rich cell's words), as the grid's keys ask, and the two ways they move it. */
type Caret = {
    rich: boolean;
    atStart: boolean;
    atEnd: boolean;
    all: boolean;
    empty: boolean;
    selectAll(): void;
    toEnd(): void;
};
export declare class ToSheetEditor extends DocElement<SheetView> {
    static properties: PropertyDeclarations;
    /** A page's marks on a read-only sheet's rows and cells (the header); none by default, and none drawn on a sheet that edits. */
    marks: SheetMark[];
    /** The selected cell: where typing goes. */
    sel: [number, number];
    /** The far corner of a block of cells; `sel` is the corner it was started from. */
    end: [number, number] | null;
    focused: boolean;
    /** Rows drawn: the sheet goes to ROWS, but only what is in use (and a little room) is on screen; it grows as you go. */
    rowsShown: number;
    /** Columns drawn beyond the table's own: the + adds one before anything is typed into it. */
    colsShown: number;
    /** While the fill handle is dragged: the block it would fill. */
    fillTo: Range | null;
    /** Column widths in px, or null to fit the columns to the page. */
    widths: number[] | null;
    /** The row whose menu is open, the column whose menu is open. */
    menuRow: number;
    menuCol: number;
    /** The columns asked for the letters keyboard (the bar's ABC) while this visit lasts. */
    letters: ReadonlySet<number>;
    private dragging;
    /** The table's box the ResizeObserver is watching. */
    private watched;
    /** A press on a cell not yet selected: the click that ends it selects the cell's words whole (the browser would put a caret there). */
    private pressed;
    /** What we last put on the clipboard, so pasting it back can move formulas' references. */
    private clip;
    /** The selected cell as it was when the focus came to it: Escape puts it back. */
    entered: {
        r: number;
        c: number;
        raw: string;
    } | null;
    /** The reference most recently inserted by tapping, so the next tap can replace it. */
    private picked;
    /** The cell the formula was last pointed at, while the caret still sits after its reference: drawn with a soft tint and a dashed edge, so the eye sees which cell the arrow keys reached (Paul, 2026-10-13: "gently highlight the targeted cell as you enter it in the formula"). Null the moment the caret moves on. */
    pointed: [number, number] | null;
    /** Where the caret was when the selected cell last lost focus. */
    private caret;
    /** Names this sheet's option lists apart from another's on the page. */
    private readonly uid;
    /** Each rich cell's paragraph as its <to-text> last had it, kept while the cell still holds those words, so the editor keeps its element and its caret. */
    private drafts;
    private ones;
    constructor();
    protected read(doc: Doc): SheetView;
    /** How many columns the sheet shows now: three at the least, more as they are added or typed into. */
    get cols(): number;
    /** The columns drawn, those past the table's edge going by their letters: words in the first, numbers in the second (Paul, 2026-10-12: a sheet's defaults), words after that. */
    columns(): Column[];
    private get drawn();
    raw(r: number, c: number): string;
    val(r: number, c: number): string | number | null;
    /** Whether a cell is locked: by the document's own lock, or every cell of a read-only sheet. */
    locked(r: number, c: number): boolean;
    /** Read-only, a cell activated is picked (kit/core/element.ts): the table's block, and the cell's row and column, from 0. */
    protected pickOf(el: Element): Picked | null;
    /** What the cell held when the focus came to it (from the cell or the formula strip), for Escape. */
    private remember;
    /** The focus gone from the cell and its strip both: what it held is no longer what Escape goes back to. */
    private forget;
    /** A checkbox cell ticked or unticked by a tap: the cell selected, the focus left where it was (no keyboard comes up). */
    private toggleTick;
    /** The cell nearest (r, c) that is on the sheet. */
    onSheet(r: number, c: number): [number, number];
    /** The selected block: one cell unless a far corner has been set. */
    get range(): Range;
    get many(): boolean;
    private cellAt;
    /** Every edit carries where the selection was (or the cells it wrote), so an undo can put it back. */
    edit(ops: Op[], key?: string, mark?: unknown): void;
    /** After an undo or a redo: the cells the edit touched selected again, the focus on the first. */
    protected undone(entry: Entry): void;
    /** The mark for a block of cells: its top left, and its far corner when it is more than one. */
    private markOf;
    setCell(r: number, c: number, raw: string): void;
    /** The keyboard a cell asks a phone for: its column's (KEYBOARD), unless it holds a formula or its column was asked for the letters. */
    keyboard(r: number, c: number): 'decimal' | 'numeric' | 'text';
    /** The selected cell's column asks for numbers, and the cell holds no formula: the bar's ABC applies. */
    get numeric(): boolean;
    /** The bar's ABC: the letters keyboard for the selected cell's column (again: the numbers), the focus left in the cell. */
    toggleLetters(): void;
    /** The selected cells locked, or let go. */
    toggleLock(): void;
    chart(kind: ChartKind | ''): void;
    /** Carry the block's first row down it, or its first column across it. One cell takes the one above it (or to its left), as Mod+D does in any spreadsheet. */
    fill(down: boolean): void;
    /** The selected cells emptied. */
    clear(): void;
    private rename;
    /** The block as the clipboard holds it: the raw cells as tab-and-newline text (so a paste here gets its formulas), and a table of what they show, with our marker, for any other app. */
    private clipData;
    /** The block copied (and, cut, emptied): onto `data` in a clipboard event, else onto the system clipboard. */
    copyOut(cut: boolean, data?: DataTransfer | null): void;
    /** Whether a clipboard event is a column name's (the header's input): the browser's own, never the block's (Paul, 2026-10-13: "I cannot cut and paste from the bolded top row of a spreadsheet"). */
    private inName;
    /** Heard on the way down (capture), before a rich cell's editor: a block is the sheet's to copy; a rich cell's words alone are its editor's; a column's name is its own input's. */
    private onCopy;
    /**
     * What a paste is as cells: our own copy (its formulas move with it); another Tiny Little Office document's
     * table (its names the first row) or its words (a line, an item, a row each); a table from anywhere else;
     * else the text, tabs and newlines between the cells.
     */
    private asCells;
    /** Cells put in with their top left at the selected cell (or over the whole block, for one value). */
    private pasteIn;
    private onPaste;
    /** The bar's Paste: the system clipboard if the page may read it, else what was last copied here. */
    pasteFromClipboard(): Promise<void>;
    /** What can be done to the block in hand, right under it (commands.ts): fill | copy, cut, paste | clear. */
    private contextItems;
    /** The block's box on screen: from its top-left cell to its far corner. */
    private blockRect;
    /** The table's box changes its height (a phone's keyboard, the bar, the heads made one line): the cell in hand kept in sight. */
    private boxWatch;
    connectedCallback(): void;
    disconnectedCallback(): void;
    /** The pointed cell's highlight goes the moment the caret is no longer right after its reference: a letter typed, the caret moved, the cell left. */
    private onSelectionChange;
    protected updated(changed: Map<PropertyKey, unknown>): void;
    private onFillDown;
    /** The rows a row command works on: the selected ones, if the selection takes in row r; else just r. */
    rowsFor(r?: number): [number, number];
    insertRowsAt(below: boolean, r?: number): undefined;
    deleteRowsAt(r?: number): void;
    /** The selected rows (or row r) moved up or down past their neighbour, the selection going with them. */
    moveRowsBy(by: number, r?: number): void;
    /** A row's number: a tap selects the row (or keeps the selected rows it is in) and opens what can be done to it. */
    private openRowMenu;
    /** A column put in before column `at`: after the last, from the + at the end of the header; after any, from its menu. */
    addColumn(at: number): undefined;
    private removeColumn;
    /** A column's head: a tap selects the column (or keeps the block it is in) and opens what can be done to it. */
    private openColMenu;
    /** What a column's menu does: what it holds, a sort by it, a column after it, or the column gone. */
    private colItems;
    /** Insert ▾: the registry's (commands.ts), then the formula language's functions, by name. */
    private inserts;
    /** Show all the text: every column as wide as its words. */
    showAll(): void;
    /** A rich cell's words as the one paragraph its <to-text> edits (the same array while the cell holds the same words). */
    private richBlocks;
    /** What a rich cell's editor did, written back as the cell's inline form: a burst of typing undoes as one, per cell. A locked cell is left be. */
    private onRichOps;
    /** Where the caret is in a rich cell, as the grid's keys ask. */
    private richCaret;
    /** Where the caret is in a cell's <input>, as the grid's keys ask. */
    private inputCaret;
    /** The focus come to a cell (its input, or a rich cell's words): it is the selected cell. */
    private entering;
    private leaving;
    /** The cells whose words (as typed, or as shown) hold every term; going to one selects it. */
    find(terms: string[]): Found;
    /** Where a person starts: A1, its words selected as a keyboard move leaves them. */
    focusFirst(): void;
    focusCell(row: number, col: number, keepBlock?: boolean): void;
    /** The cell on screen, by scrolling the table's box alone, with the stuck header rows and row numbers allowed for. */
    private reveal;
    /** The <input> being typed in right now: a cell or the formula strip. */
    private editor;
    /** Put the caret at `pos` in `ed` (or in the selected cell) once the new value has rendered. */
    private caretTo;
    /** Point at a cell while a formula is being edited: its reference goes in at the caret, replacing the one just pointed at if there was one. False when the formula is not waiting for a value. */
    private point;
    /** The reference just pointed at, if the caret is still sitting right after it. */
    private pointing;
    /** Tapping a cell while editing a formula elsewhere inserts that cell's reference. */
    private onCellDown;
    /** Dragging across cells with the mouse selects a block. */
    private onCellOver;
    /** Arrow keys while a formula wants a value point at cells the same way a tap does. Left and right only point from the end of the formula, so they can still move the caret through it. */
    private pointWithKey;
    private insertFunction;
    /** Width in the sheet's own pixels that shows every value in column c without clipping. */
    naturalWidth(c: number): number;
    private currentWidths;
    private onGripDown;
    /** The grip from the keyboard: Left and Right narrow and widen the column, Enter fits it to its text. */
    private onGripKey;
    private fitColumn;
    /** The whole sheet selected: from A1 to the last row in use, across every column. */
    selectAll(): void;
    /**
     * A column's name: Enter keeps what was typed (the change event, as the focus leaves), Escape puts back what it was;
     * either takes the focus to the column's first cell, never to nothing.
     */
    private nameKey;
    /** Escape in a cell: what was there when the focus came is put back, and the focus stays on the cell. */
    cancelEdit(r: number, c: number): void;
    /** The grid's keys in a cell, `at` saying where its caret is. A rich cell's editor hears them first (they are caught on the way down to it), and has those left over: its marks, its Escape, its own Select All. */
    /** The cell a key is typed in, and where its caret is, while the grid's commands answer it (commands.ts). */
    here: {
        r: number;
        c: number;
        at: Caret | null;
    } | null;
    private onKey;
    /** Mod+A: the cell's words first; with them whole (or none), the whole sheet. */
    selectAllKey(): boolean;
    /** Mod+Enter: done, staying on the cell. */
    doneHere(): false | undefined;
    /** Tab and Shift+Tab: the next and previous cell, row after row; at either end of the sheet the focus goes on. */
    tabKey(back: boolean): boolean;
    /** Shift+arrows stretch the block (sideways only when not selecting words inside the cell). */
    stretch(arrow: [number, number] | undefined): boolean;
    /** Space in a checkbox column ticks and unticks. */
    tickHere(): boolean;
    /** Escape in a cell: what was there put back. A rich cell's editor steps out first and says `text-escape` when it is done. */
    cancelHere(): boolean;
    /** Enter, Shift+Enter and the arrows: the cell below, above, before (from the start of the words), after (from their end). */
    moveKey(e: KeyboardEvent): boolean;
    render(): import("lit-html").TemplateResult<1>;
    /** The words an option column offers: those its cells already hold, each once, in the order they first come (a formula's are its own). */
    private choices;
    /** An option cell's caret: the cell selected and its list opened, where the browser can open it (elsewhere its words come up as it is typed in). */
    private openChoices;
    /** A page's marks on one cell (SheetMark): small badges at its end, each named for a screen reader by its title. */
    private renderMarks;
    private renderRow;
}
export {};
