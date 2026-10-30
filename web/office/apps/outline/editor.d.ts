/**
 * <to-outline-editor>: an outliner. Every row is an item, its words a <to-text shape=line> over the item's
 * block; Enter makes another, Tab and Shift+Tab take it in and out with its family, Alt+Up/Down move
 * it, Mod+Alt+Up/Down fold it, a handle drags it onto another item, and any item can be zoomed in on. The one bar formats the words of
 * the chosen row, arranges it, zooms, folds, connects and shows the outline as other things. Each item's
 * bullet is the line to its parent, tapped to turn it (plain, an arrow out, an arrow back, both ways) and to
 * name it; Connect joins any two items. Every change is operations on the document (model.ts): the kernel's
 * family helpers for the tree, splices for lines, joins and documents, and the row editor's own ops for words.
 * Folds, the zoom, the chosen row and connecting are the editor's state, not the document's. The footnotes are
 * listed under the outline (<to-notes>, kit/draw/notes.ts), each typed there: a mark tapped, or Footnote, puts the caret
 * in its note; Enter or Escape come back to the mark.
 *
 * It behaves as a bulleted list does: Enter at the start of words pushes the row down, Backspace at the start joins
 * the row to the item before it and Delete at the end joins the next one in. Rows can be chosen whole, as nodes (a
 * range): Shift+arrows from the caret, Escape in the words, a tap on a row's handle, Select All twice. A range is a span
 * of blocks, every chosen row's family with it; it is copied, cut, pasted, deleted, duplicated, indented and moved as
 * one, from the keys or from a small bar that comes up under it. All of that is the kit's rows controller (kit/text/rows.ts);
 * this editor gives it the rows and the operations. Any list can be numbered ("1. " typed at the start of a row too).
 */
import { type PropertyDeclarations, type TemplateResult } from 'lit';
import { type Doc, type Op } from '../../doc/index.ts';
import type { Handoff } from '../../kit/core/app.ts';
import { Rows } from '../../kit/text/rows.ts';
import { type Found } from '../../kit/ui/find.ts';
import { DocElement, type Entry, type Picked } from '../../kit/core/element.ts';
import { type ToNotes } from '../../kit/draw/notes.ts';
import type { ToText } from '../../kit/text/text.ts';
import { type Item, type OutlineView, type Status } from './model.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/insert.ts';
import '../../kit/ui/menu.ts';
import '../../kit/ui/dialog.ts';
import '../../kit/ui/doc-dialog.ts';
import '../../kit/draw/notes.ts';
import '../../kit/text/text.ts';
import '../../kit/ui/context.ts';
import './style.css';
export declare const tag = "to-outline-editor";
export declare class ToOutlineEditor extends DocElement<OutlineView> {
    static properties: PropertyDeclarations;
    /**
     * Items folded shut, by block index: the document's own (`{.shut}`, model.ts SHUT), so the link carries the folds and
     * an undo brings them back. Read-only, a reader's own folds over them (`viewFolds`), which write nothing.
     */
    get folded(): Set<number>;
    /** Read-only, the items a reader folded or opened by their arrows, by block index: the view's, never the document's (a new document starts without them). */
    private viewFolds;
    /** The item zoomed in on, by block index; -1 for the whole outline. */
    zoom: number;
    /** The chosen row, by block index; -1 for none. */
    sel: number;
    /** Connecting: the item the join starts from (-1 until it is picked); null when not connecting. */
    connecting: {
        from: number;
    } | null;
    /** The block (an item or a join) whose line menu is open; -1 for none. */
    menuFor: number;
    /** The block whose line is being named, and the name so far; -1 when the dialog is closed. */
    naming: number;
    /** The row whose due day is being typed (a date field where its chip was), -1 for none. */
    dating: number;
    /** The statuses as they are being edited in their dialog (`was`: the name before, for the items that carry it); null while it is closed. */
    statusDraft: {
        name: string;
        word: string;
        was: string;
    }[] | null;
    /** Find's terms while it is open: only the rows whose words hold every one are shown (sparse); null otherwise. */
    filter: string[] | null;
    /** The agenda dialog open, and its order: by status (the set's order), by due day, or the outline's. */
    agenda: boolean;
    agendaSort: 'status' | 'due' | null;
    byStatus: boolean;
    /** The outline shown as a page, in a dialog. */
    showing: boolean;
    /** The row editor last focused: what the bar's text tools act on. */
    field: ToText | null;
    /** One array per block, so a row's editor sees the same `blocks` until its block changes. */
    private rowBlocks;
    /** The block a row shows when the outline has none yet; it enters the document with the first letter typed. */
    private ghost;
    /** Rows chosen whole, as nodes: the kit's one implementation (keys, handle, drag, clipboard, the bar under them). */
    readonly rows: Rows<number>;
    constructor();
    protected read(doc: Doc): OutlineView;
    protected willUpdate(changed: Map<string, unknown>): void;
    /** Every edit: folds and the zoom follow the blocks they belong to; the selection before it is kept for its undo. */
    edit(ops: Op[], key?: string, mark?: unknown): void;
    /** After an undo the selection comes back as it was before the edit; after a redo, where the edit left it. */
    protected undone(entry: Entry, redo: boolean): void;
    /** The zoom is a block index: moved with its block, dropped with it (the folds are the blocks' own). */
    private remap;
    /** Another's ops: a reader's own folds follow the items they belong to. */
    protected followed(ops: Op[]): void;
    connectedCallback(): void;
    disconnectedCallback(): void;
    private blocksFor;
    get items(): Item[];
    itemAt(at: number): Item | undefined;
    /** The rows on screen: those inside the zoom, not hidden under a fold; with Find open, only those whose words hold every term, folds aside. */
    visible(): Item[];
    /** The depth the zoom starts at: rows are drawn stepped in from there. */
    private get base();
    /** Where a person starts: the first row's words, the caret at their end (the empty outline's one row). */
    focusFirst(): Promise<void>;
    /** Choose the row at `at` and put the caret in its words (at the end, or at `offset`). */
    focusRow(at: number, offset?: number | 'end'): void;
    /** Where the caret is in a row's words, or its end. */
    private caretIn;
    /** The rows on screen as the rows controller takes them: each with its element and its family's blocks. */
    private rowItems;
    /** The rows inside the zoom go no shallower than its first level. */
    private get floor();
    /** The chosen rows taken away, families and all; the caret into the row before (or after, or the empty outline's first row). */
    private deleteSpan;
    private shiftRange;
    private moveRange;
    /** The chosen rows again, right after them; the copy is chosen. */
    private duplicate;
    /** Mod+D in a row's words: the row and its family again after it, the caret in the copy where it was. */
    duplicateRow(at: number): void;
    /** Numbered or not: the range's top rows, or the list the chosen row belongs to. */
    number(): void;
    private isOrd;
    /** The outline's own item in the bar under chosen rows: Numbered, after Move down. */
    private extraItems;
    /** What chosen rows put on the clipboard: their words as items, the shallowest at the margin, and our HTML with the TLO in it. */
    private clip;
    /**
     * A paste into a row (chosen rows are the rows controller's): lines or list items go in as items after the row's
     * family (words alone, and words copied from a row, are the row's to paste).
     */
    private onPaste;
    /** Pasted data put in as items: ours (or plain text) read as TLO, HTML from elsewhere as blocks; the caret at the end of the last. */
    private pasteData;
    private onOps;
    private numberShortcut;
    /** Enter: at the start of words the row is pushed down, at the end a new item, in the middle the words split (model.ts, enterAt). */
    private onEnter;
    /**
     * Backspace at the start of a row, or Delete at its end. An empty row goes (its family comes out a level) and the
     * caret goes to the row above (Delete: below). A row with words is joined to the item before it, unfolded first if
     * it is hidden; Delete joins the next item into the row.
     */
    private onExit;
    /** The folds that hide item i opened. */
    private unhide;
    removeRow(at: number, forward?: boolean): void;
    shiftBy(at: number, by: 1 | -1): void;
    moveBy(at: number, by: 1 | -1): void;
    /** Where a family moved by these ops now starts: the move's `to`. */
    private landing;
    /**
     * Read-only, an item activated (its row, anything on it) is picked (kit/core/element.ts): its block, and its place
     * among the items, from 0. Its fold arrow is picked too, and says so (`part: 'fold'`, with `shut`, 1 where the arrow
     * folds it and 0 where it opens it), so a page tells a fold from a pick; the arrow folds it as well (`chose`), in the
     * view alone.
     */
    protected pickOf(el: Element): Picked | null;
    /** Read-only, a fold arrow picked folds or opens its item in the view. */
    protected chose(pick: Picked): void;
    /** An item folded or opened: written in the document (`{.shut}`); read-only, in the view alone, nothing written. */
    fold(at: number, shut?: boolean): void;
    foldAll(shut: boolean): void;
    zoomTo(at: number): void;
    zoomOut(): void;
    /** A new item at the end of what is shown, from Insert or a tap under the last row: at the margin, or last inside the zoomed item. */
    addItem(): void;
    private openLineMenu;
    /** The two ends of a line: an item's parent and the item, or a join's. */
    private endsOf;
    private setDir;
    private lineItems;
    /**
     * The line's name typed where it is shown: its chip becomes a field (one comes where there was none), drawn and
     * focused at once, in the menu's or the tap's own handler (iOS raises its keyboard only so). Enter or a tap
     * elsewhere keeps it, emptied takes the name away; Escape leaves it be.
     */
    private openNaming;
    private saveName;
    /** Connect: start from the chosen item, or pick one first; everything else goes grey until the other end is tapped. */
    connect(): void;
    private pick;
    /** A document under the item chosen when it was asked for (or at the end). */
    private putDoc;
    /** A new document of that app, made in its own editor in the dialog: Done puts it under the chosen item, Cancel puts nothing. */
    insertApp(id: string): Promise<void>;
    insertLinked(): Promise<void>;
    /** The document under an item, edited in its own app in the dialog: Done writes it back as one step. */
    private editRow;
    /** A document's link pasted over its card replaces it: the way an edit made in its own app comes back. */
    private onDocPaste;
    /** Escape while connecting cancels it (before the rows controller would take the Escape for the row). */
    private onEscape;
    /** The Outliner's keys (commands.ts), in a row: never from a popover or a dialog, nor while rows are chosen whole (the rows controller's). */
    private onKey;
    /** The row a key was typed in (-1: none). */
    rowOfKey(e: KeyboardEvent): number;
    /** Delete or Backspace on a document's row (not in words): the row goes. False anywhere else. */
    removeDocRow(at: number, e?: Event): boolean;
    /** A plain arrow at the edge of a row's words: on to the row before or after (Up and Down under where the caret was). False inside the words. */
    stepRow(e: KeyboardEvent): boolean;
    lengthOf(at: number): number;
    /** Whether the caret is on the first (up) or last (down) line of its words, where Up/Down leave the row; inside a long item they walk its lines. */
    atEdgeLine(tx: ToText, up: boolean): boolean;
    /** Where the caret lands in the row it moves to: under where it was (its last line going up, its first going down). */
    columnIn(at: number, up: boolean): number | 'end';
    /** The family at `at` placed under or after the item at `to`; the caret follows it. */
    dropAt(at: number, to: number, how: 'under' | 'after'): void;
    /** The outline opened as another kind of document, in that app, in a new tab. */
    openAs(h: Handoff): void;
    showPage(): void;
    pickIcon(): Promise<void>;
    /** The bar, drawn from the registry (commands.ts): the marks are the words', the row's <to-text> their context. */
    private renderBar;
    /** The bullet that is a line to the parent: a dot, or an arrow which way it points; tapped, it opens the line's menu. */
    private bullet;
    /** A line's name, as a chip before the words; tapped, its name is typed there. */
    private chip;
    /** The document's statuses, from its head. */
    get statuses(): Status[];
    /** The status, a pill before the words in its color; tapped, the next of the set (round the end). */
    private statusChip;
    /**
     * A task's box, drawn in the row (the words' own marker is hidden in a row, style.css, so without this a task showed
     * nothing; Paul, 2026-10-15: "What happened to statuses on the outliner and checkboxes"): a checkbox, tapped to check
     * or uncheck, the status following (tick).
     */
    private taskBox;
    cycleStatus(at: number): void;
    /** The line menu's rows for the status (the set, and none) and the due day. */
    private statusItems;
    /** A day as the reader's language says it: "Oct 20", with the year when it is not this one. */
    private dayWords;
    /** The due day, a chip after the words; tapped, a date field where it was. */
    private dueChip;
    private openDating;
    private saveDue;
    /** Insert ▾: the item in hand a task (a box before its words), or, a task already, its box checked or unchecked. */
    addTask(): void;
    /** Mod+Enter in a row: its task's box checked or unchecked (a row that is no task is left alone). */
    tickAt(at: number): void;
    /** Insert ▾: a due day on the item in hand, starting from today or the nearest day to come above it, typed where it shows. */
    addDue(): void;
    /**
     * Insert ▾'s Statuses, and the line menu's Edit statuses…: the set in a dialog, a name and a color a row, to rename, recolor,
     * add, take away and reorder by taking away and adding (Paul, 2026-10-15: "Can I edit statuses"). A document with no set
     * gets TODO, DOING and DONE to start from, and the item in hand the first, once Done.
     */
    editStatuses(): void;
    private statusesBody;
    private saveStatuses;
    /** Another document under an item: its app and first line, a way to open it in its own app, and the way back (its link pasted over the card). */
    private renderDoc;
    private renderRow;
    private onSelect;
    private crumbs;
    /** The joins, under the outline: each with its kind of line, its name, and a way to take it away. */
    private renderLinks;
    render(): TemplateResult<1>;
    /** The row's element, by its block. */
    private rowEl;
    /** The items with something to do: a task, a status or a due day; never a document. */
    private todo;
    showAgenda(): void;
    showByStatus(): void;
    /** A row of a view tapped: the dialog closes and the item has the caret, as the central thing. */
    private goTo;
    /**
     * A row of a view (the agenda, by status): the item's box, its status, its words and its due day, each the row's own
     * (the box ticks, the status goes to the next, the day is picked, as in the outline: Paul, 2026-10-15, "If I click on a
     * TODO in a view or a status or a checkbox I should be able to change that in the data"); the words tapped close the
     * view and give the item the caret ("If I click on a line close the window and let me edit").
     */
    private viewRow;
    private agendaBody;
    private byStatusBody;
    /** Whether an item's words hold every term (case and accents aside, as the find bar reads them). */
    private matchesFind;
    /** The find bar's search: the rows that match are the ones shown, the terms marked in them; each in turn brought into view. */
    find(terms: string[]): Found;
    /** A row tapped while Find shows the matches: the filter lifts, the item is zoomed to, and its words have the caret. */
    land(at: number): void;
    /** Every item's footnote marks, in the order of the outline (their blocks are the items' own). */
    private marks;
    get notesEl(): ToNotes | null;
    /** A mark tapped in a row, or a footnote just put in: the caret in its note's words under the outline. */
    private onNote;
    private onNoteChange;
    /** Back from a note to its row, the caret after the mark. */
    private onNoteBack;
    /** A note left empty: its mark goes (the caret where it was, when the note was left for the words). */
    private onNoteRemove;
    /** The footnotes, under the outline, numbered as their marks are (as a slide's are at its foot). */
    private renderNotes;
    private renderPageDialog;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-outline-editor': ToOutlineEditor;
    }
}
