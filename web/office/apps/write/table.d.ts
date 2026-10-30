/**
 * <to-write-table>: a table block inside a text, as a small grid of fields over the sheet's view of it
 * (model.ts tableView): the names over the columns, the values worked out in place, the cell being typed
 * in showing its raw formula, a locked cell left be, and one blank row under the last to type the next
 * line into. It keeps a grid's ways (docs/editing.md §4): the arrows go from cell to cell (sideways from
 * either end of the words), Enter commits and goes down and Shift+Enter up, Escape puts back what the cell
 * held (and, pressed again, steps out to the table in hand), Mod+Enter goes back to the words; Shift+arrows,
 * Shift+click and a drag stretch a range, which Delete clears and the clipboard carries as tab-separated
 * text with our table HTML; the handle at its corner fills; a tap on a cell while a formula wants a value
 * puts in its reference. A column's head and a row's number choose the column or the row and open what can
 * be done to it (what the column holds, the Spreadsheet's types from the kit's columns.ts, Money asking its currency; put one in,
 * take it out, name it: its name typed where it is shown, in the head; an Option column's cells offer the words it holds), the + puts a column in at the end; a row is never added
 * by a key alone. The handle in the corner takes the table itself in hand (moved, copied, taken out).
 *
 * Every change is an event the host turns into ops: wt-cell (r, c, raw), wt-do (a command, and the cell to
 * focus after it; the host calls preventDefault), wt-exit (back to the words). A host that does not take
 * commands (`commands` unset) gets the grid without the heads' menus, and a range written cell by cell.
 *
 * A cell is a <textarea> one line tall that grows with its words (CSS field-sizing), so a narrow column wraps them
 * rather than cutting them short (the review of 2026-10-11: a worksheet's question read "First…" on a phone); Enter
 * never puts a line in. An Option column's cell is an <input>, for the words its column holds (a <datalist>).
 */
import { LitElement, nothing } from 'lit';
import { type Cells, type ColType, type Range } from '../../doc/index.ts';
import type { SheetView } from '../sheet/model.ts';
import '../../kit/ui/menu.ts';
export declare const TABLE_TAG = "to-write-table";
/** What the grid asks its host to do; `focus` is the cell to be in afterwards (and `end` the range's far corner). */
export type TableCmd = ({
    cmd: 'put';
    cells: Cells;
} | {
    cmd: 'rowsIn';
    r: number;
    n: number;
} | {
    cmd: 'rowsOut';
    r0: number;
    r1: number;
} | {
    cmd: 'colIn';
    c: number;
} | {
    cmd: 'colOut';
    c: number;
} | {
    cmd: 'rename';
    c: number;
    name: string;
} | {
    cmd: 'type';
    c: number;
    type: ColType;
    currency?: string;
}) & {
    focus?: [number, number];
    end?: [number, number] | null;
};
export declare class ToWriteTable extends LitElement {
    static properties: {
        view: {
            attribute: boolean;
        };
        commands: {
            type: BooleanConstructor;
        };
        focused: {
            state: boolean;
        };
        end: {
            state: boolean;
        };
        fillTo: {
            state: boolean;
        };
        menuRow: {
            state: boolean;
        };
        menuCol: {
            state: boolean;
        };
        naming: {
            state: boolean;
        };
    };
    view: SheetView | null;
    /** The host answers wt-do: the heads open menus, the corner holds the table's handle, the + adds a column. */
    commands: boolean;
    /** The cell being typed in, if any. */
    focused: [number, number] | null;
    /** The far corner of a range; the focused cell is the corner it was started from. */
    end: [number, number] | null;
    /** While the fill handle is dragged: the cells it would fill. */
    fillTo: Range | null;
    menuRow: number;
    menuCol: number;
    /** The column whose name is being typed in its head, or -1. */
    naming: number;
    /** The cell the range is anchored at (the last focused, kept while a menu has the focus). */
    private anchor;
    /** What the cell held when it took the focus, for Escape. */
    private orig;
    private dragging;
    /** Whether the cell had the focus when the pointer went down (a first tap chooses the cell, a second edits it). */
    private hadFocus;
    /** What we last put on the clipboard, so pasting it back moves formulas' references. */
    private clip;
    /** Names this grid's lists of an Option column's words apart from another's. */
    private uid;
    constructor();
    createRenderRoot(): this;
    private get cols();
    /** Rows drawn: the table's, and the blank one under them. */
    private get drawn();
    private raw;
    private input;
    private onGrid;
    /** The range chosen: one cell unless a far corner has been set. */
    get range(): Range;
    /** Whether more than one cell is chosen. */
    get many(): boolean;
    private cellAt;
    private do;
    private setCell;
    /** Put the caret in a cell once it is drawn, its words chosen (typing replaces them); `end` keeps a range from it. */
    focusCell(r: number, c: number, end?: [number, number] | null): Promise<void>;
    /** The table itself in hand: its card takes the focus (the host shows what can be done to it). */
    private hand;
    private onFocus;
    private onCellDown;
    /** Dragging across cells with the mouse chooses a range. */
    private onCellOver;
    /** A first tap on a cell chooses it whole, so typing replaces it; a tap on the cell being typed in puts the caret there. */
    private onCellClick;
    /** While a formula is typed and waits for a value, a cell tapped puts its reference in at the caret. */
    private point;
    private onFillDown;
    private onCopy;
    /** Tab-separated text, or a table in HTML (ours or anyone's) when the text is not that. */
    private pastedText;
    private onPaste;
    private onKey;
    /** The rows a row command works on: the chosen ones, when they take in row r; else r alone. */
    private rowsFor;
    private openRowMenu;
    private rowItems;
    private openColMenu;
    private colItems;
    /**
     * The column's name typed where it is shown: its head becomes a field, drawn and focused at once, in the menu's
     * own handler (iOS raises its keyboard only so). Enter or a tap elsewhere keeps it; Escape leaves the name be.
     */
    private nameColumn;
    private named;
    render(): typeof nothing | import("lit-html").TemplateResult<1>;
    /** The heads when the host takes commands: the table's handle, a button for each column, the + for one more. */
    private renderHeads;
}
