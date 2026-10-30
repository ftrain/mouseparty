/**
 * <to-deck-editor>: the Deck app. One bar (Insert ▾, Present, the marks, link, footnote, the slide's icon,
 * indent, Layout, Look, Transition, Format, the QR toggle, move, delete, then undoTools()) over the current
 * slide, which fills the editor in its format's shape: the headline is a <to-text shape=line> over the
 * slide's heading block, the words a <to-text shape=lines> over its items and paragraphs (two of them for
 * two columns, either side of the "|"), the speaker notes a <to-text shape=lines> over its quote blocks.
 * Every op from an editor is offset by its span's start and applied through DocElement's edit(), with a mark
 * of the slide and the caret (or the slides chosen) that undone() puts back. The footnotes are at the slide's
 * foot (<to-notes>, kit/draw/notes.ts), their words typed there: a mark tapped, or Footnote, puts the caret in its
 * note; Enter or Escape come back to the mark. A slide that shows another
 * document (a fence, a table) shows it as a card with a menu.
 * A link in a slide's words, in the show, is followed through the link guard (kit/ui/link-guard.ts) and turns no slide.
 *
 * The rail's thumbnails are the slides as rows (kit/text/rows.ts, docs/editing.md §6): a tap chooses one (Shift
 * extends), its grip drags it, and chosen slides have the contextual bar and the keys (Delete, Alt+Up/Down,
 * Mod+D, Shift+arrows, Mod+A, Mod+C/X/V as TLO with our HTML). Escape in a box chooses its slide; Select All
 * with a box whole takes every slide; Enter or a double tap on a thumbnail edits it. The keys of §8: a new
 * slide is Mod+Shift+Enter, Present Mod+Alt+Enter, PageUp/PageDown on the rail only. A printed format shows
 * its sheets on request; presenting takes the focus and shows one slide at a time with the transition the
 * header names, and ends on the QR code of the deck. Two fingers on the slide in the show zoom it in place, as in a
 * spatial canvas (kit/ui/pinch.ts pinchZoom): the show is its frame, scrolled to the rest; a pinch never turns a slide.
 * Where the host keeps pictures (kit/core/host.ts `images`), a picture file pasted or dropped on the editor goes to the
 * host and is on the slide as Insert ▾ Picture puts it; where it keeps none, a paste and a drop are as they were.
 */
import { type PropertyValues } from 'lit';
import { type Block, type Doc, type Op } from '../../doc/index.ts';
import { DocElement, type Entry, type Picked } from '../../kit/core/element.ts';
import { type ToNotes } from '../../kit/draw/notes.ts';
import { Rows, type RowRange } from '../../kit/text/rows.ts';
import type { Sel } from '../../kit/text/textops.ts';
import type { ToText } from '../../kit/text/text.ts';
import { type Format, type Layout, type Settings, type Slide } from './model.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/doc-dialog.ts';
import '../../kit/ui/insert.ts';
import '../../kit/ui/menu.ts';
import '../../kit/draw/notes.ts';
import '../../kit/text/text.ts';
import './style.css';
export declare const tag = "to-deck-editor";
/** Which box the bar's text buttons work on. */
type Field = 'title' | 'words' | 'right' | 'notes';
/** Where the selection was when an edit began, handed back to undone(): the slide, and the slides chosen or the caret in a box. */
interface Mark {
    slide: number;
    range?: RowRange<number>;
    field?: Field;
    sel?: Sel | null;
    /** The footnote whose words were typed: an undo puts the caret back in it. */
    note?: number;
}
/** Ops from an editor over a span, moved to where the span sits in the document. */
export declare function offset(ops: Op[], by: number): Op[];
export declare class ToDeckEditor extends DocElement<Slide[]> {
    static properties: {
        cur: {
            state: boolean;
        };
        showing: {
            state: boolean;
        };
        shown: {
            state: boolean;
        };
        leaving: {
            state: boolean;
        };
        noting: {
            state: boolean;
        };
        sheets: {
            state: boolean;
        };
        subMenu: {
            state: boolean;
        };
    };
    /** The slide open for editing. */
    cur: number;
    /** The slide being presented, -1 when not presenting. */
    showing: number;
    /** Reveals made on the slide being presented. */
    shown: number;
    /** The slide being left, while the next one arrives over it; -1 otherwise. */
    leaving: number;
    /** Speaker notes showing while presenting (N toggles). */
    noting: boolean;
    /** A printed format showing the sheets to print rather than its pages. */
    sheets: boolean;
    /** The sub-document's menu is open. */
    subMenu: boolean;
    /** Presenting began with the deck's show link ("?show"): the way out says "Edit this deck". */
    private fromLink;
    /** The selection the editor last reported, and which box it was in. */
    private sel;
    private field;
    private forwards;
    private settle;
    private lastClick;
    /** The slide's width in the show over its whole-screen width, 1 to 4: what two fingers set (--deck-zoom). */
    private showZoom;
    /** When two fingers last lifted from the show: the tap a pinch may leave behind turns no slide. */
    private pinched;
    private unpinch;
    /** Where one finger came down on the show (a swipe's start), and when a swipe last turned a slide. */
    private swipe;
    private swiped;
    /** Focus asked for after the next draw: the box, and the caret's place in it (or a selection to put back). */
    private focusNext;
    /** A document has been read: a value after it is either ours, the head edited, or another document. */
    private loaded;
    /** The slides chosen whole on the rail (kit/text/rows.ts): a tap on a thumbnail, its grip, Shift+arrows, Select All twice. */
    readonly rows: Rows<number>;
    constructor();
    createRenderRoot(): this;
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected read(doc: Doc): Slide[];
    get slides(): Slide[];
    get settings(): Settings;
    /** How many pages there are to edit: the slides written, or the format's count. */
    get count(): number;
    /** The current slide; past what is written, an empty one at the document's end. */
    get slide(): Slide;
    text(field: Field): ToText | null;
    /** The box last typed in, for the bar's buttons. */
    get current(): ToText | null;
    /** The spans of blocks each box owns, cut once per document and slide: the same arrays on every draw, so <to-text> redraws only what changed. */
    private spans;
    private boxes;
    protected willUpdate(changed: PropertyValues<this>): void;
    /** The slide the range last reached: the slide on show follows it when it moves, and is free while it stays. */
    private seenFocus;
    /**
     * A value from outside: ours is nothing new; the same blocks with another head is the head edited (undoable); anything
     * else is another document, loosened if written loosely: the ops that loosen it, which DocElement applies (`arrive`)
     * once it has read the document (told as an edit is, and no step to undo).
     */
    private take;
    /** Where the selection is now, for an edit to carry to its undo. */
    private mark;
    /** Ops from anywhere: applied, recorded with where the selection was, the shell told. */
    change(ops: Op[], key?: string, mark?: Mark): void;
    /** After an undo or a redo: the slide it changed shown, and the slides chosen or the caret put back as they were. */
    protected undone(entry: Entry): void;
    /** The slide holding block `at`. */
    private slideAt;
    /** The rules that make slide i exist, when it is a page past what is written: the ops, and where its (empty) span will sit. */
    private ensure;
    /** Ops from one of the boxes: offset to its span, the first block of an empty span given the kind the box is for. */
    private onOps;
    /** Ops over one of the boxes' blocks, as the box would send them. */
    private boxOps;
    /** The slide's footnote marks in order (the headline's, then the words', then the right column's), each with its box. */
    private marks;
    get notesEl(): ToNotes | null;
    /** A mark tapped in a box, or a footnote just put in: the caret in its note's words at the foot. */
    private onNote;
    private onNoteChange;
    /** Back from a note to its box, the caret after the mark. */
    private onNoteBack;
    /** A note left empty: its mark goes (the caret where it was, when the note was left for the words). */
    private onNoteRemove;
    /** The block an empty box's first words make: a headline, a bullet (prose on a printed page), a note. */
    private born;
    /** A box's selection, for the bar's pressed states (the box itself is known from its focus). */
    private onSelect;
    /** Where a person starts: the first slide, the caret at the end of its headline. */
    focusFirst(): void;
    /** The caret into a box: at its start, its end, or a selection. */
    focusBox(field: Field, at?: 'start' | 'end' | Sel): void;
    private placeFocus;
    go(i: number): void;
    /** Read-only, a slide's thumbnail activated is picked (kit/core/element.ts): its first block, and its number, from 1. */
    protected pickOf(el: Element): Picked | null;
    /** …and shown, as a tap on it shows it to the one who edits. */
    protected chose(pick: Picked): void;
    /** A new slide after this one, of a layout, opened with the caret in its headline. */
    newSlide(layout?: Layout, blocks?: Block[]): void;
    deleteSlide(): void;
    move(by: 1 | -1): void;
    /** The thumbnails of the slides written, as the rows controller takes them: each with the blocks of its slide. */
    private rowItems;
    /** The first and last slides a span covers. */
    private idsOf;
    /** The chosen slides taken out; the focus on the thumbnail of the slide now in their place. */
    private removeRange;
    /** The chosen slides past the slide before them or after them; they stay chosen. */
    private moveRange;
    /** The chosen slides again, right after them; the copies are chosen. */
    private duplicateRange;
    /** Mod+D with the caret in a slide's words: the slide again after it, the caret in the copy's headline. */
    duplicateSlide(): void;
    /** What chosen slides put on the clipboard: their words, a rule between slides, and our HTML with the exact TLO in it. */
    private copyRange;
    /** Slides pasted after slide `after`: our own copy comes back as the slides it was; anything else is read as a slide's blocks (a line of words, its headline). */
    private pasteSlides;
    /** A slide dragged by its grip and let go over another: it comes after that one. */
    private dropSlide;
    /** The current slide, made to exist first: the ops that make it, and the slide as it then is. */
    private existing;
    setLayout(layout: Layout): void;
    /** The slide's icon, from the library, its own words suggesting; the deck's icon colour is in the Look menu. */
    pickIcon(): Promise<void>;
    /** Another document on the slide: on this one if it has nothing on it, else on a new slide after it. */
    private putSub;
    private subItems;
    /** The document or table on the slide, edited in its app in the dialog: Done writes it back as one step. */
    private editSub;
    /** A locked document opened (here or in another card): the slide draws it. */
    private onOpened;
    private openSubMenu;
    insertDocument(): Promise<void>;
    /** A table, three by three, made in the Spreadsheet in the dialog; Cancel puts it on blank. */
    insertTable(): Promise<void>;
    /** A new document of another app, made in its own editor in the dialog: Done puts it on the slide, Cancel puts nothing. */
    insertApp(id: string): Promise<void>;
    /** Insert ▾'s QR code of this document, on the slide. */
    insertQr(): void;
    /** Insert ▾'s Picture, on the slide: a file from the device, put to the host that keeps pictures (offered only where one does: commands.ts). */
    insertImage(): Promise<void>;
    /** A picture file put to the host, and its fence on the slide (on this one if it has nothing on it, else on a new one after it). */
    private putPicture;
    /** The picture among what was pasted or dropped, where the host keeps pictures, the deck is edited and not shown; null otherwise. */
    private pictureIn;
    /** A picture file pasted anywhere in the editor (the words, the rail, a slide chosen): on the slide, not in the words. */
    private onPicturePaste;
    /** A picture dragged over the editor may be dropped, where the host keeps pictures; anything else is the browser's. */
    private onPictureOver;
    private onPictureDrop;
    /** Four more pages, in a format that grows by sheets. */
    morePages(): void;
    setFormat(format: Format): void;
    /** The closing code, drawn from the deck as it stands. */
    private get end();
    private total;
    steps(i?: number): number;
    show(i: number, shown?: number): void;
    /** Present from the first slide: what a show link ("…?show", kit/core/route.ts) asks of the deck on arrival. */
    present(fromLink?: boolean): void;
    forward(): void;
    back(): void;
    private onShowClick;
    /**
     * A finger drawn sideways across the whole slide turns it, as a book's page: to the left the next, to the right the
     * one before (mirrored right to left). More than 40px, and more across than down; never a mouse, never on the
     * controls, the notes or a live card, never while zoomed (a finger pans then) or as a pinch ends.
     */
    private onShowDown;
    private onShowUp;
    /** While presenting, the keys are the show's (commands.ts SHOW): nothing reaches the boxes behind it. */
    private onShowKey;
    /**
     * The editor's own keys, after the boxes and the rows controller have had theirs: Mod+Shift+Enter a new slide
     * (in every format), Mod+Alt+Enter present, Mod+Enter in the headline on to the words (a line's "done"), Mod+D
     * the slide again, Alt+Up/Down in the headline the slide past its neighbour (the caret stays). Never from a
     * dialog, a popover, a field or a bar button.
     */
    private onEditKey;
    /** Whether a key was typed in the headline. */
    private inTitle;
    /** Move slide up or down: from the bar; from the keys only in the headline (the slide past its neighbour, the caret staying). */
    moveKey(by: 1 | -1, e?: Event): boolean | void;
    /** Mod+Enter in the headline: on to the words (a line's "done"). */
    ontoWords(e?: Event): boolean | void;
    /** Mod+D in the words or on the slide: the slide again. */
    duplicateKey(e?: Event): boolean | void;
    /** PageUp and PageDown on the rail (not in a box): the slide before or after. */
    railStep(e?: Event): boolean | void;
    /** Escape in a box, once it has closed its boxes and collapsed its words: out of the words, the slide chosen on the rail. */
    private onTextEscape;
    /** Select All with a box already whole: every slide. */
    private onSelectAll;
    /** A thumbnail tapped: its slide on show, and chosen (Shift extends). */
    /**
     * A finger pressed on a thumbnail while a box on the stage has the focus: the box keeps it (the press's default, a
     * blur, is not taken, so the keyboard stays up), and when the finger lifts where it pressed the tap goes to that
     * slide with the caret in the same box (Paul, 2026-10-13: "When I'm editing a slide I need a quick way to jump to
     * other slides without leaving edit mode"). It is answered at the lift: WebKit sends no click after a press whose
     * default was refused, and the click Chromium still sends is let go. A finger that moves on is scrolling the rail.
     * With no box focused, a tap chooses the slide, as a tap on any handle does (docs/editing.md).
     */
    private jumping;
    private jumped;
    private onThumbDown;
    private onThumbUp;
    private onThumb;
    /** Keys on the rail: PageUp/PageDown change slides; on a thumbnail, Enter edits its words, and the keys that act on a chosen slide choose it first (the rows controller then answers them). */
    private onRailKey;
    /** The headline's edges: Backspace at the start of an empty slide takes the slide away (the caret to the end of the one before); Delete at its end goes on to the words. */
    private onTitleExit;
    /** A Tiny Little Office link pasted alone into empty words: its document on the slide, as Insert ▾ would put it. */
    private onWordsPaste;
    /** Delete or Backspace on the document on the slide takes it off; Enter or Space opens its menu. */
    private onSubKey;
    /**
     * The theme as the canvas wears it: its colours, the sizes the layout chose (in the canvas's own width, so the canvas
     * is the slide scaled, its shape kept at every width: on a phone the type is small, never cut; Paul, 2026-10-13:
     * "the same aspect ratio forever and shrink the text when in edit mode"), and its decoration as the background.
     */
    private canvasStyle;
    private renderCanvas;
    private renderRail;
    private renderSheets;
    private renderShow;
    render(): import("lit-html").TemplateResult<1>;
    protected updated(changed: PropertyValues<this>): void;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-deck-editor': ToDeckEditor;
    }
}
export {};
