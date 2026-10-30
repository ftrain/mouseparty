/**
 * DocElement: what every app's editor extends (docs/kernel.md §3). The shell hands it the document's text
 * as `value`; it parses once, keeps the kernel's Doc, and draws a view of it (`read`, pure). Every edit is
 * a list of the kernel's operations through `edit()`: applied, re-read, written back as text in a
 * "docchange" event. Undo is an op log (§6, decision 2): each entry holds the ops and their inverses, a
 * burst of typing into one place within 700 ms is one entry, and the shell's "docundo"/"docredo" events
 * are answered here. An edit may carry a `mark` (the host's selection, whatever shape it has), handed back
 * with the entry to `undone()` so the selection comes back with the change; `firstAt()` says where the
 * change begins when there is no mark. `undoTools()` is the bar's last two buttons, the same in every app.
 * `focusFirst()` is where a person starts (docs/editing.md §1): the shell calls it once a document is first
 * drawn, and each app puts the focus in its own place with its own helper, never scrolling the page.
 *
 * For a page that shares editing (docs/kernel.md §12, docs/library.md) every change is also told as its operations, in
 * a "docops" event before the "docchange", and `applyRemote()` takes another's operations in: applied with no step
 * of the history and nothing told, the history carried over them by the kernel's transform, so an undo here takes
 * back only what was done here. Its words land as the text says them (`sayableAfter`), and the page hears that they
 * did ("docremote", DocRemote) to draw again what it draws over them.
 *
 * A page that only shows a document sets `readonly` (the attribute, or `readOnly`): nothing of it is edited. The editor
 * draws no bar, its words are not editable, an edit, an undo and a typed, pasted, cut or dropped thing are refused, and
 * the kit draws nothing that edits inside it (a context bar, a menu, a dialog). Its items keep their places in the
 * focus order, and one activated (Enter, a click, a tap) says so in a "docpick" event: `{ at }`, the item's block, and
 * the app's own key for it where it has one (`pickOf`), for the page to open what the item stands for. Another's ops
 * still land (`applyRemote`), and a new `value` is still a new document.
 *
 * A page's own commands handed to `mount` (kit/core/mount.ts Own) are the element's `own`: those drawn in the bar
 * (`where: ['bar']`) are a group of their own in the editor's bar, after the editor's tools and before Undo and Redo
 * (`ownTools()`, which `undoTools()` draws first, and the read-only Calendar's bar draws where it has no undo), each as
 * the kit draws a command: a menu by cmdMenu, an icon by cmdTool, words by cmdBtn. The bar is drawn again with the
 * editor; a page whose context changes outside it asks for that (`requestUpdate()`).
 */
import { LitElement, type PropertyDeclarations, type PropertyValues } from 'lit';
import { type Doc, type Op } from '../../doc/index.ts';
import { type Command } from './commands.ts';
/** A change, as the shell and a host hear it: the text in `detail`, and the edit's burst key (none for an undo, a redo or an edit that stands alone), so a host that holds this editor inside it (the Animator holds the Drawing Tool) keeps the same bursts in its own log. */
export type DocChange = CustomEvent<string> & {
    key?: string;
};
/**
 * A change as a page that shares editing hears it: the operations applied (an edit's own, an undo's inverse), and
 * `base`, how many this element had applied before them since it was given its value, which a page maps to its own
 * version. Fired on the element alone, never bubbling: an editor held inside another (the Animator's Drawing Tool, a
 * dialog's) says nothing of the document around it.
 */
export type DocOps = CustomEvent<{
    ops: Op[];
    base: number;
}>;
/**
 * Another's ops taken in (`applyRemote`), as a page that draws over the editor hears it: "docremote" on the element,
 * never bubbling, with the ops, once they are applied and the view asked to draw again, so a page that draws over
 * the words (who did what, comments: kit/text/redline.ts) knows to draw again. Nothing else fires it: a change of the
 * editor's own is "docops" and "docchange", and never this.
 */
export type DocRemote = CustomEvent<{
    ops: Op[];
}>;
/** An item activated in a read-only editor: its block, and the app's own key for it (a calendar's day, an outline's item). */
export type Picked = {
    at: number;
} & Record<string, number | string>;
/** What a page hears when an item of a read-only editor is activated: "docpick", bubbling. */
export type DocPick = CustomEvent<Picked>;
/** A page's own commands and the context they act on, drawn in the editor's bar (mount's `commands` and `context`). */
export interface OwnTools<C = unknown> {
    commands: readonly Command<C>[];
    context: C;
}
export interface Entry {
    ops: Op[];
    inverse: Op[];
    /** What the edit was, for coalescing ("cell:2:3"); undefined edits stand alone. */
    key?: string;
    at: number;
    /** The host's own note of where the selection was when the edit began (a burst keeps its first). */
    mark?: unknown;
}
/** The lowest block index an entry's ops touch (a move's either end); -1 when they touch only the head. */
export declare function firstAt(entry: Pick<Entry, 'ops'>): number;
export declare abstract class DocElement<V> extends LitElement {
    static properties: PropertyDeclarations;
    value: string;
    /** Shown, not edited (the header): no bar, no typing, no drag, and a "docpick" for an item activated. */
    readOnly: boolean;
    /** The page's own commands for the bar, and their context (the header): null for none. A page's of any context is one (`never`). */
    own: OwnTools<never> | null;
    /** The document as the kernel reads it (public: an app's commands read it, kit/core/commands.ts). */
    doc: Doc;
    view: V;
    /** The text as last read or written: a `value` that is this text is ours, not a new document. */
    private seen;
    private undo;
    private redo;
    /** How many ops this element has applied since it was given its value: a "docops" event's `base`. */
    private applied;
    /** Entries carried over another's ops: the side not carried (an undo's ops, a redo's inverse) is worked out again when it is wanted. */
    private carried;
    constructor();
    createRenderRoot(): this;
    connectedCallback(): void;
    disconnectedCallback(): void;
    /** The pure function from the document to what the app draws. */
    protected abstract read(doc: Doc): V;
    /** The focus where a person starts in this document (the first words, A1, the canvas): the shell calls it after the first draw. */
    focusFirst(): void | Promise<void>;
    /** After an undo or a redo: a chance to move the selection to what changed. */
    protected undone(_entry: Entry, _redo: boolean): void;
    /** After another's ops (`applyRemote`): a chance to carry the selection over them. It is held within the document as drawn in any case. */
    protected followed(_ops: Op[]): void;
    /** An entry's mark carried in place over another's ops: what was before the edit over `before`, what was after it over `after`. */
    protected carryMark(_mark: unknown, _before: Op[], _after: Op[]): void;
    /** In a read-only editor, the item `el` is in, as a "docpick" tells it; null where it is in none (the header). */
    protected pickOf(_el: Element): Picked | null;
    /** After an item is picked in a read-only editor: the app's own way of showing it, where it has one (a deck's slide). */
    protected chose(_pick: Picked): void;
    private onRefused;
    /** The item under a press, in a read-only editor; a link inside one is followed as a link. */
    private itemOf;
    /** A click on an item, or Enter on one, is a pick: the page hears it, and the app never does. */
    private onPick;
    /** A press on an item (or a handle) starts no drag, and a double click on one opens nothing. */
    private onItemDown;
    /**
     * Whether `text` is this editor's own, the text it last read or wrote: the shell's echo of a change, which a host
     * compares by identity and never parses again (a keystroke costs what it changed, not the whole document).
     */
    protected ours(text: string): boolean;
    /**
     * Whether what the bar shows of the selection, as one key (the box, the block's kind, the marks at the caret), has
     * changed since a host last asked. A <to-text> says where its selection is after every draw; a host draws again for
     * that only when its bar would show something else, so a letter typed draws the words and not the bar twice.
     */
    protected selectionMoved(key: string): boolean;
    private barSel;
    protected willUpdate(changed: PropertyValues): void;
    /** `next` read and written before anything is kept: an op the text cannot write, or the view cannot draw, throws here and leaves the editor as it was. */
    private written;
    /** `next` taken as the document, with its view and its text, and drawn. */
    private takeUp;
    /** The document with these operations applied; the shell is told. `key` names a burst of typing that undoes as one; `mark` is handed back to `undone()`. */
    edit(ops: Op[], key?: string, mark?: unknown): void;
    /** Ops the editor makes of a document as it arrives (a deck written loosely, loosened): applied and told as an edit is, with no step in the history, since nobody did anything. */
    protected arrive(ops: Op[]): void;
    /**
     * Another's ops (a page's shared document: docs/kernel.md §12), made on the document as it is here: applied, the view
     * drawn again, with no step of the history and no "docops" or "docchange" (the page knows); "docremote" says they
     * landed, for what the page draws over the view. The history is carried over them, each
     * entry as the kernel's rebase gives it, so an undo takes back only what was done here; where they cross an entry
     * (the kernel's Conflict) the history is let go. Ops that do not apply, or that leave a document the text would not
     * read back as written, throw (the kernel's checkOp and keptDoc), and nothing changes.
     */
    applyRemote(ops: Op[]): void;
    /**
     * A stack's entries carried over another's ops, the top first: each entry's `side` applies to the document as the
     * entries above it leave it, and the ops passed on apply where it has. Its mark goes with it (`carryMark`).
     */
    private carryStack;
    /** A page hears of the ops just taken, and the shell of the change. */
    private emit;
    /** An entry's side applied (an undo's inverse, a redo's ops), the entry moved to the other stack, and the shell told. */
    private step;
    private onUndo;
    private onRedo;
    get canUndo(): boolean;
    get canRedo(): boolean;
    /**
     * The page's own commands drawn in the bar (`own`, the header): those `where` the bar and in force, a group of their
     * own; nothing where the page gave none.
     */
    protected ownTools(): unknown;
    /** The page's commands the bar draws: `where` the bar, and in force. */
    private ownShown;
    /**
     * What the page's commands in the bar show, as one key (their words, pressed, off): an app that draws its bar again
     * only when its key changes (the Word Processor's) puts this in it, so the page's tools are drawn again with theirs.
     */
    protected ownKey(): string;
    /**
     * Undo and Redo, the last two tools of every app's bar (the page's commands, kit/core/keys.ts): they never take the
     * focus, are off with nothing to do, and under a finger are pinned at the bar's end, always on screen (bar.ts,
     * responsive.css). Before them, the page's own commands (`ownTools`), so the editor's tools come first.
     */
    protected undoTools(): unknown[];
}
