/**
 * <to-doc-dialog>: another document held in this one, edited where it is. A modal (a native <dialog>, the
 * whole screen on a phone, large on a desktop) holding that app's own editor: the Drawing Tool's over a
 * drawing, the Spreadsheet's over a table. Done hands back the document as it now is, Cancel (or Escape,
 * while nothing has changed) hands back nothing; the host writes Done's text as one op, so one undo there
 * takes the whole visit back. Inside, Mod+Z and Mod+Shift+Z are the inner editor's own history.
 *
 *   editDoc({ app, text })  the app's editor (its definition's editor(), in the app file) over `text`; resolves the text, or null.
 *   makeDoc(app)            a new document of the app, made there: the fence that holds it, or null.
 *   editFence(fence)        the document a fence holds, edited: the fence as it now is, or null when unchanged
 *                           (a locked one opened first, by kit/ui/locked-doc.ts, and sealed again under the same password).
 *   editTable(table)        the Spreadsheet's editor over a document of that one table block, with Rows and
 *                           Columns in the dialog's bar to set its size; resolves the table block, or null.
 */
import { LitElement } from 'lit';
import { type Block, type TableBlock } from '../../doc/index.ts';
import { type AppDef, type Editor } from '../core/app.ts';
/** A table of that many rows and columns: rows taken off or put on at the end (blank), columns the same (going by their letters). */
export declare function resizeTable(table: TableBlock, rows: number, cols: number): TableBlock;
/** A new table to type into: three columns that go by their letters, three blank rows. */
export declare const newTable: () => TableBlock;
export declare class ToDocDialog extends LitElement {
    static properties: {
        heading: {};
        sizing: {
            type: BooleanConstructor;
        };
        rows: {
            state: boolean;
        };
        cols: {
            state: boolean;
        };
    };
    heading: string;
    /** The Rows and Columns fields are shown (a table). */
    sizing: boolean;
    rows: number;
    cols: number;
    readonly uid: string;
    /** The document as it is now, and as it came. */
    text: string;
    private start;
    private done;
    constructor();
    createRenderRoot(): this;
    get dialog(): HTMLDialogElement;
    /** The editor inside. */
    get editor(): Editor | null;
    /** The app's editor over `text`, shown; resolves with the text on Done, null on Cancel. */
    open(def: AppDef, text: string): Promise<string | null>;
    /** Done: the document as it now is (a table at least the size asked for: the sheet keeps no blank rows at its end). */
    finish(ok: boolean): void;
    /** The table's size, read from the text: the rows asked for stay until more are typed into. */
    private measure;
    private onChange;
    /** Rows or Columns set: the table made that size, and the editor given it. */
    private resize;
    /** Undo and redo inside are the inner editor's, as the shell would pass them on; never from a box of the kit's own or a popover. */
    private onKey;
    render(): import("lit-html").TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-doc-dialog': ToDocDialog;
    }
}
/**
 * A document of an app, edited in the dialog: its text on Done, null on Cancel (or when no app goes by that name). The
 * dialog is put in `into` while it is open (the page's body unless a page gives an element of its own: one its theme
 * or its styles are on).
 */
export declare function editDoc(o: {
    app: string;
    text: string;
    heading?: string;
    sizing?: boolean;
    into?: Element;
}): Promise<string | null>;
/** A table block, edited in the Spreadsheet in the dialog (put in `into`, as editDoc's), with its size: the block on Done, null on Cancel. */
export declare function editTable(table: TableBlock, into?: Element): Promise<TableBlock | null>;
type Fence = Extract<Block, {
    k: 'fence';
}>;
/** A new document of an app, made in its editor in the dialog: the fence that holds it on Done, null on Cancel. */
export declare function makeDoc(app: string): Promise<Fence | null>;
/** The document a fence holds, edited in its app in the dialog: the fence with its new body, or null on Cancel or when nothing changed. */
export declare function editFence(fence: Fence): Promise<Fence | null>;
export {};
