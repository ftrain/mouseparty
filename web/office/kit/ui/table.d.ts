/**
 * <to-table>: a host's records as a typed table (docs/library.md, A typed table): a person's people, companies,
 * events, tasks and projects, a pipeline seen as rows. Not a document: the page holds the rows and gives them as
 * `rows`, says what each column holds in `columns` (kit/ui/table-model.ts: words, numbers, money, dates and moments,
 * a box to tick, a status in its color, a link or a person, tags, or a cell of the page's own drawing), and hears what
 * the person does in events. Nothing in a row is changed here: an edit is told to the page, which keeps it or refuses it.
 *
 * - **Sorting.** A click anywhere on a heading sorts by it, ascending, then descending, then not at all; Shift and a
 *   click sorts by it as well, after the others. Anywhere: the button fills the cell and the cell hears a click on its
 *   padding (Paul, 2026-10-23: "Let me click on the full column head to sort"). Each type by its own order, an empty cell last, ties in the page's order
 *   (`sortchange`, `{ sort }`; the page may set `sort` itself).
 * - **Finding.** `query` keeps the rows with every word of it somewhere in their cells (the library's search: case and
 *   accents aside), `filter` keeps those a function of the page's keeps; `filterable` draws a box that sets `query`.
 *   `hideable` draws the Columns menu, a column hidden or shown told in `columnschange` (`{ hidden }`, the keys).
 * - **Editing.** A cell of an `editable` column (or of a row its `editable(row)` says yes to) is edited where it is:
 *   Enter, F2, a double click, or a click on the cell in hand opens its editor (a number field, a date or a moment, words,
 *   or for a record a field that searches the host's records, `search(q)`, as it is typed; a status's options are the
 *   kit's menu beside the cell, open on the one click and on Enter, the one held checked, an option picked kept at
 *   once, Escape giving the cell back: never the browser's dropdown, which drops only where a script may open it (Paul,
 *   2026-10-24: "When I click in the table like on a status a select box should pop up. I have to click twice now");
 *   a box is ticked at once), Enter or leaving it keeps the edit and Escape lets it go (a record is kept only chosen);
 *   words pasted on the cell in hand are kept as its value with no editor opened (`onPaste`). The edit is shown at once and told in a
 *   cancelable `rowchange`, `{ id, column, value, before, row, wait }` (RowChange): the page that refuses it calls
 *   `preventDefault()`, or gives `wait` a promise that rejects or comes back false, and the cell goes back to what it
 *   held. A kept edit is shown until the page gives its rows again.
 * - **Choosing.** A row activated (a click on a cell that is not edited, Enter on one) is told in `rowpick`
 *   (`{ id, row }`); a link with no address, or a person, in `cellpick` (`{ id, column, value, row }`). `selectable`
 *   draws a box before each row and one for all the rows shown (Shift and a click: the rows between), told in
 *   `selection` (`{ ids }`); `selected` sets them. `addable` draws Add row, told in `rowadd`.
 * - **A row's actions.** `rowActions(row)` gives each row a menu at its end (RowAction: an id, words, an icon, `danger`),
 *   opened by its button, by Enter on its cell, or by Shift+F10 or the menu key anywhere in the row; one chosen is told
 *   in `rowaction` (`{ id, action, row }`).
 * - **The toolbar.** A child given with `slot="toolbar"` is drawn at the start of the bar over the table (a page's
 *   My/All, kit/ui/slots.ts), before the filter, the Columns menu and Add row.
 * - **Keys.** It is a grid (ARIA's): one cell takes Tab, the arrows walk the cells and the headings, Home and End the
 *   row's ends (with Mod the table's), Page Up and Page Down a screenful; Enter edits or activates, Space ticks a
 *   row's box (or the cell's, or sorts by a heading), Escape lets an edit go.
 * - **A box** (a row's, the heading's, a boolean cell's) is let toggle itself when tapped, and the table's state follows
 *   it: a click cancelled (preventDefault) is put back by the browser after its handlers, and Safari put it back after
 *   the table had drawn it ticked (Paul, 2026-10-20: "The company checkbox is unchecked even though I expect that"), so
 *   a tap on a phone ticked the row and showed an empty box. The `live` binding draws what the state says either way.
 * - **Size.** The table scrolls in a box of its own, its headings stuck to the top and its first column (and the boxes)
 *   to the start, as the Spreadsheet's grid does (on a phone, sideways too: the page never scrolls, kit/ui/scroll.ts).
 *   Once the box has scrolled sideways the first column gives way, whether it wraps or not, narrowed to
 *   `--to-dt-pin-w` (about twenty characters, or two fifths of a narrow box, so a phone's or a narrowed window's
 *   columns to its right keep the room: host.css) and its words cut at the last whole word that fits,
 *   the whole in its `title` and read whole (the cut is drawn, not written), and scrolled back to the start it opens
 *   again (Paul, 2026-10-20: "In tables, the left column must truncate as I move to the right"; 2026-10-21: "shrink it
 *   and truncate text to about 20 characters"): the box wears `scrolled`, set from its scroll in a frame. A cell's
 *   words and boxes start at its top, in line with the first line of a row that grows, the box's margin reckoned in
 *   the cell's own line (`font: inherit`), not the control's.
 *   Only the rows in sight are drawn, each the one height (`--to-dt-row-h`), so 5,000 rows are as quick as fifty
 *   (test/browser/table.test.ts measures it); where a column `wrap`s, a row grows to hold its words, and the rows are
 *   placed by their heights, measured where drawn and reckoned from their words where not, and measured again in the
 *   frame the box's width changes (a panel opening beside the page), so no row is left over another or a gap under
 *   it. A column that `fit`s is as wide as its widest words, every row's, measured. The box is as tall as `--to-dt-h`
 *   (36rem, or three quarters of the screen) unless the page sets its height.
 */
import { LitElement, type PropertyValues, type TemplateResult } from 'lit';
import { type IconNode } from '../draw/icons.ts';
import './menu.ts';
import { type RecordOption, type SortBy, type TableColumn, type TableRow } from './table-model.ts';
/** A change made in a cell, told to the page to keep or refuse ("rowchange", cancelable). */
export interface RowChange<R extends TableRow = TableRow> {
    id: R['id'];
    /** The column's key. */
    column: string;
    /** What the cell holds now, as the row would hold it (table-model.ts parseInput). */
    value: unknown;
    /** What it held. */
    before: unknown;
    row: R;
    /** A record column's: the record chosen (`value` is its id), or null where the cell was emptied. */
    record?: RecordOption | null;
    /** The page's answer, when it comes later: a promise that rejects, or comes back false, puts the cell back. */
    wait(answer: Promise<unknown>): void;
}
/** One of a row's actions, in its menu: an id the page knows it by, its words, an icon, and whether it destroys (Delete, drawn in the danger color). */
export interface RowAction {
    id: string;
    label: string;
    icon?: IconNode;
    danger?: boolean;
    disabled?: boolean;
}
/** What "rowaction" carries: the row and the action chosen. */
export interface RowActionPick<R extends TableRow = TableRow> {
    id: R['id'];
    action: string;
    row: R;
}
export declare class ToTable<R extends TableRow = TableRow> extends LitElement {
    static properties: {
        rows: {
            attribute: boolean;
        };
        columns: {
            attribute: boolean;
        };
        sort: {
            attribute: boolean;
        };
        query: {};
        filter: {
            attribute: boolean;
        };
        hiddenColumns: {
            attribute: boolean;
        };
        selected: {
            attribute: boolean;
        };
        selectable: {
            type: BooleanConstructor;
        };
        addable: {
            type: BooleanConstructor;
        };
        filterable: {
            type: BooleanConstructor;
        };
        hideable: {
            type: BooleanConstructor;
        };
        rowActions: {
            attribute: boolean;
        };
        label: {};
        addLabel: {
            attribute: string;
        };
        empty: {};
        active: {
            state: boolean;
        };
        editing: {
            state: boolean;
        };
        top: {
            state: boolean;
        };
    };
    rows: R[];
    columns: TableColumn<R>[];
    sort: SortBy[];
    query: string;
    filter: ((row: R) => boolean) | null;
    /** The keys of the columns hidden; undefined, the columns' own `hidden`. */
    hiddenColumns: string[] | undefined;
    selected: R['id'][];
    selectable: boolean;
    addable: boolean;
    filterable: boolean;
    hideable: boolean;
    /** Each row's actions, in a menu at its end; null for none. */
    rowActions: ((row: R) => RowAction[]) | null;
    /** The table's name, for a screen reader ("People"). */
    label: string;
    /** Add row's words ("Add a person"). */
    addLabel: string;
    /** What an empty table says ("No people yet"). */
    empty: string;
    /** The cell in hand: its row in the rows shown (-1, the headings) and its column in the grid (the boxes' first, where there are boxes). */
    active: {
        r: number;
        c: number;
    };
    /** The cell being edited, and what its editor starts with. */
    editing: {
        r: number;
        c: number;
        start: string;
    } | null;
    /** How far the box is scrolled, in CSS pixels: which rows are drawn. */
    top: number;
    readonly uid: string;
    private slots;
    /** The rows shown: kept by the filter and the query, in the sort's order. */
    private view;
    /** The columns shown. */
    private shown;
    /** Each row's words, folded, for the quick search: kept while the columns shown and the language stay as they are. */
    private words;
    /** Edits shown while the page has not given its rows again, by row and column. */
    private kept;
    /** The row a box was last ticked on, where Shift and a click ticks from. */
    private anchor;
    private rowH;
    private headH;
    private boxH;
    /** The box's width when rows that grow were last measured for it (`measure`). */
    private boxW;
    private sized;
    private frame;
    /** The widths measured for the columns that fit, in CSS pixels, by key. */
    private fitPx;
    /** Rows that grow: each row's height measured where it was drawn, reckoned from its words where not; and where each begins. */
    private grown;
    private guessed;
    private offsets;
    /** The widths the rows' heights were measured at: other widths, measured again. */
    private widthsAt;
    /** The row whose menu is open. */
    private menuRow;
    /** The status cell whose options are open as a menu (header). */
    private choosing;
    /** A record cell's picker (kit/ui/record-pick.ts), open while a record cell is being edited. */
    private picker;
    /** The type the cells are drawn in, read once an update. */
    private fontsNow;
    private unlisten;
    constructor();
    createRenderRoot(): this;
    connectedCallback(): void;
    disconnectedCallback(): void;
    /** The box that scrolls. */
    get box(): HTMLElement | null;
    /** The rows shown, in their order: what the person sees after the filter, the query and the sort. */
    get shownRows(): readonly R[];
    /** Where the boxes are, the first column of the grid is theirs. */
    private get off();
    /** The grid's columns: the boxes, the columns shown, and the rows' actions. */
    private get cols();
    /** The actions' column in the grid, or -1. */
    private get actsC();
    /** Whether a column of the shown wraps, so rows grow. */
    private get grows();
    private keyOf;
    /** A row's value in a column, an edit kept shown over it. */
    private valueAt;
    protected willUpdate(changed: PropertyValues<this>): void;
    protected updated(): void;
    /** The type the cells are drawn in: the table's own, and the headings' (smaller, as host.css has them). */
    private fonts;
    /** Each column that fits measured: its widest words of every row and its heading, with the room its cell's face takes beside them. */
    private fit;
    /** Where a drawn cell of a column that fits holds more than its width (a face of the page's own drawing), the column is widened to it. */
    private refit;
    /** A column's grid track: measured where it fits, else its own or its type's. */
    private trackFor;
    /** A row's height: as measured where it was drawn at these widths, else reckoned from its words; every row one height where nothing wraps. */
    private heightOf;
    /** Where each row shown begins, below the headings, by the heights: one more than the rows, the last the body's height. */
    private placesOf;
    /** Where row `r` begins below the headings. */
    private offsetOf;
    /** The row at `y` below the headings. */
    private rowAtY;
    /** The drawn rows' heights read, at the columns' widths now: a row taller or shorter than reckoned, every row after it placed again. */
    private measureRows;
    /** The heights the window of rows is reckoned from: a row's, the headings', the box's; and rows that grow measured again at a new width. */
    private measure;
    /** The box scrolled: which rows are drawn, and whether it is off its start sideways (`scrolled`, where the first column gives way). Once a frame. */
    private onScroll;
    /** The rows drawn: those in sight and OVER more each way, and the row in hand wherever it is, so the focus is never lost. */
    private windowOf;
    private say;
    /** Sorted by a column's heading (with Shift, as well as the sort before). */
    sortBy(key: string, add?: boolean): void;
    private toggleColumn;
    private setSelected;
    /** A row's box ticked or not; with `range`, every row shown between the last ticked and this one, as this one now is. */
    private tick;
    private tickAll;
    private pick;
    /**
     * The edit told to the page: shown at once, put back if the page refuses it. A record's is told as its id, and shown
     * as the record chosen (`record`), or as nothing where the cell was emptied.
     */
    private commit;
    /** The cell's editor opened (a box is ticked at once instead). */
    edit(r?: number, c?: number): void;
    /** The edit kept (`keep`) or let go, and the focus back on its cell. */
    private endEdit;
    private onEditorKey;
    /** A record chosen in the picker (null: none, the field emptied), kept and told; the focus back on its cell. */
    private choose;
    private onPickInput;
    private onPickKey;
    /** Left for somewhere else: a record is kept only by being chosen. */
    private onPickBlur;
    /** The options of the status cell at `r`, `c`, as a menu beside it, the one it holds checked (header). */
    openChoice(r: number, c: number): Promise<void>;
    private choiceItems;
    /** Row `r`'s menu opened beside its button (`from`, or the button in its actions' cell). */
    openActions(r: number, from?: HTMLElement | null): Promise<void>;
    private actionItems;
    private onEditorBlur;
    /** A cell activated, by Enter or a click: its editor, its box, its link, or the row picked. */
    private activate;
    private cellAt;
    /** The cell in hand brought into the box's sight (past the headings and the columns stuck at the start) and focused. */
    focusCell(): Promise<void>;
    /** The cell in hand moved (kept inside the grid: the headings' row is -1). */
    moveTo(r: number, c: number): void;
    private onKey;
    /**
     * Words pasted on the cell in hand while no editor is open: kept as the cell's value, as typing them in its editor
     * and Enter would, so a value is pasted without opening the cell first (Paul, 2026-10-23: "I need to be able to
     * paste into a value cell without clicking on it first"). A line alone, since the editor is a line; a choice by its
     * option's value or label; words a typed cell cannot read (letters in an amount's) are left where they are, and a
     * box's or a record's cell takes none.
     */
    private onPaste;
    private onClick;
    private onDblClick;
    /** A link's or a person's cell: an address opens as a link does; without one, a tap is told to the page. */
    private linkCell;
    /** A cell's face, by its column's type. */
    private face;
    /** A record's editor: a field that searches the host's records as it is typed, the records found in a list under it (kit/ui/record-pick.ts). */
    private recordEditor;
    /** The cell's editor: a field for its type. */
    private editor;
    private headCell;
    private bodyRow;
    private bar;
    render(): TemplateResult<1>;
}
