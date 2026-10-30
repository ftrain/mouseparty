import { type ReactiveController, type ReactiveControllerHost, type TemplateResult } from 'lit';
import { type ContextEntry } from '../ui/context.ts';
import type { Clip } from './clipboard.ts';
import '../ui/context.ts';
/** Blocks [from, to): a row with its family, or a run of rows. */
export interface RowSpan {
    from: number;
    to: number;
}
export interface RowItem<Id> {
    id: Id;
    el: HTMLElement;
    span: RowSpan;
}
export interface RowRange<Id> {
    anchor: Id;
    focus: Id;
}
/** A copy's words and HTML: the clipboard's one Clip, so the kit names one type for both. */
export type { Clip } from './clipboard.ts';
export type DropHow = 'under' | 'after';
export interface RowDrag<Id> {
    id: Id;
    over: Id | null;
    how: DropHow;
}
export interface RowsOptions<Id> {
    /** The rows on screen, in order. */
    rows(): RowItem<Id>[];
    /** What takes the focus while rows are chosen, so the keys come here and not to words. */
    box(): HTMLElement | null;
    /** A row's handle, as a selector inside the row's element. */
    handle: string;
    /** Rows nest: Indent and Bring out are offered, and a drop on a row's right half goes under it. */
    nests?: boolean;
    /** Shift+Up/Down and Escape in a row's words choose the row (one-line words; true unless said). */
    fromWords?: boolean;
    /** The row the caret is in, where a Shift+tap extends from. */
    current?(): Id | null;
    /** The span some chosen rows cover (default: from the first row's block to the furthest end). */
    span?(rows: RowItem<Id>[]): RowSpan | null;
    /** The caret into a row's words. */
    edit(id: Id, offset: number | 'end'): void;
    remove(span: RowSpan, ids: Id[]): void;
    move(span: RowSpan, by: 1 | -1): RowRange<Id> | null | void;
    canMove(span: RowSpan, by: 1 | -1): boolean;
    shift?(span: RowSpan, by: 1 | -1): RowRange<Id> | null | void;
    canShift?(span: RowSpan, by: 1 | -1): boolean;
    duplicate(span: RowSpan): RowRange<Id> | null | void;
    copy(span: RowSpan): Clip;
    /** Rows pasted in place of the span (null: where the host likes). */
    paste(data: Clip, span: RowSpan | null): void;
    /** A dragged row (with its family) put under or after another. */
    drop?(id: Id, to: Id, how: DropHow): void;
    /** The app's own context items (Numbered): after Move down. */
    extra?(span: RowSpan): ContextEntry[];
    /** What scrolls during a drag near its edges (default: the nearest scrolling ancestor of the box, or the page). */
    scroller?(): HTMLElement | null;
    /** The context bar's name and class. */
    label?: string;
    contextClass?: string;
}
export declare const lastCopied: () => Clip | null;
type Host = ReactiveControllerHost & HTMLElement;
export declare class Rows<Id = number> implements ReactiveController {
    private host;
    readonly o: RowsOptions<Id>;
    /** The rows chosen whole; null when the caret is in words (or nowhere). */
    range: RowRange<Id> | null;
    /** A drag by a handle under way. */
    drag: RowDrag<Id> | null;
    private press;
    /** A pointer tap was taken as a choose: the click after it is not another. */
    private tapped;
    private point;
    private scrolling;
    private target;
    constructor(host: Host, o: RowsOptions<Id>);
    hostConnected(): void;
    hostDisconnected(): void;
    hostUpdated(): void;
    private set;
    /** The chosen rows, in order. */
    chosen(): RowItem<Id>[];
    /** The blocks the chosen rows cover, families and all. */
    span(): RowSpan | null;
    /** Whether the row is chosen: inside the range's span (a chosen row's family is chosen with it). */
    has(id: Id): boolean;
    /** The row at `id` chosen whole, or (extending) the range from where it began to it; the words' caret goes. */
    choose(id: Id, extend?: boolean): void;
    /** Shift+Down: the focus to the next row after its family; Shift+Up: to the row before. Past the anchor the range turns. */
    extend(by: 1 | -1): void;
    /** Every row on screen chosen. */
    selectAll(): void;
    /** A range put back as it was (an undo): chosen, the focus on the box. */
    select(r: RowRange<Id>): void;
    /** The range let go; given a row, the caret into it. */
    release(id?: Id, offset?: number | 'end'): void;
    /** Where the chosen rows are on screen, from the first to the last. */
    rect(): DOMRect | null;
    /** After an operation: the range it says to keep, else none. */
    private after;
    remove(): void;
    move(by: 1 | -1): void;
    shift(by: 1 | -1): void;
    duplicate(): void;
    /** The chosen rows as the clipboard holds them; kept here too. */
    private clip;
    /** The bar's Copy and Cut: the system clipboard as the page may write it, and this page's own memory of it. */
    copyOut(cut: boolean): void;
    /** The bar's Paste: the system clipboard's words if the page may read them, else what was last copied here. */
    pasteIn(): Promise<void>;
    private bar;
    /** What the bar under the range offers, in the standard's order (kit/text/rows-commands.ts), the app's own after Move down. */
    contextItems(): ContextEntry[];
    /** The bar, for the host's template. */
    renderContext(): TemplateResult;
    private rowOf;
    private inWords;
    private onKey;
    /** In a row's words: Shift+Up/Down step out to the row chosen whole. */
    private onWordsKey;
    /** Escape in a row's words, once <to-text> has closed its boxes and collapsed its words: the row chosen whole, the step out of edit. */
    private onTextEscape;
    /** The keys a range answers to (kit/text/rows-commands.ts); true when the key was the range's. */
    private onRangeKey;
    /** A plain arrow on a range: the caret back in the rows' words, before them (Up, Left) or after them (Down, Right). */
    leave(key: string): void;
    /** The focus going into words (a tap, a Tab) lets the range go. */
    private onFocusIn;
    /** A tap outside the host, and outside its bar, lets the range go. */
    private onOutside;
    /** Whether a clipboard event is the range's: in the host while rows are chosen, or on the page's body. */
    private mine;
    private onClipboard;
    private handleOf;
    /** A tap on a handle: choose the row; Shift extends. */
    private tap;
    private onClick;
    private onDown;
    private onMove;
    private onUp;
    private onCancel;
    private endDrag;
    /** Where the carried row would land: the row under the pointer; its right half is "under" it where rows nest. */
    private aim;
    /** The insertion line: under the row, stepped in when the drop is under it. */
    private draw;
    /** Near the top or bottom of what scrolls (the column, or a list's own box: kit/ui/scroll.ts), it scrolls to bring more rows under the finger. */
    private edges;
}
