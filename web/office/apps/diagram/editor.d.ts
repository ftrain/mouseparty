/**
 * <to-diagram-editor>: the picture is the editor. Tap empty space and a new thing is made there (in a lane,
 * or in the circles tapped), its words offered and chosen; tap a thing and its words are typed where they are
 * drawn, in a <to-text> laid exactly over them (the Drawing Tool's overlay, placed by `wordsOver`), with the few
 * things to do to it underneath (one more like it, a picture, a connection, take it away); Enter starts the
 * next; drag a thing onto another to put it under or after it, into a lane or a set to move it there. The
 * kind is a menu in the one bar. Every change is the kernel's operations (model.ts): a `text` op on the line
 * for the words typed, a `splice` when a thing comes or goes, a `move` when one moves; nothing else
 * touches the document.
 *
 * The thing open (or, with its words closed, the thing that has the focus) is the thing in hand: under the words a
 * <to-context> in the standard's order (Move up, Move down, the kind's own, Duplicate | Copy, Cut, Paste | Delete),
 * and the keys of docs/editing.md on a focused thing (arrows go to the nearest thing that way, Alt+Up/Down move it
 * past its neighbour, in a tree Tab and Shift+Tab indent it under the thing before it and bring it out to its grandparent
 * with its children, as the Outliner does, Mod+Alt+Left/Right into the next lane or table, Mod+D, Mod+C/X/V, Delete,
 * Enter). Where it cannot go further in or out Tab moves the focus on, so the keys are never trapped. The words are
 * plain (`no-bubble`, no marks), and plain whatever they hold: the line is written with its separators escaped
 * (model.ts `wordsInto`). Shift+Enter is a second line where the thing draws one ("Name | Role", a
 * date and what happened); a comma ending a thing of a list is the next, as Enter is, and a "+" ending a family's
 * name starts the partner's (anywhere else they are characters). Escape puts them back as they were when opened,
 * Enter or Mod+Enter or a tap elsewhere keeps them. No box ever holds the words apart from the picture (docs/editing.md §5). Undo brings
 * the focus back to the thing that changed.
 *
 * A seating chart's bar has Print place cards: a card a guest, their name large and their table small, eight to
 * a letter sheet with lines to cut along (view.ts `placeCards`), through the kit's print path.
 */
import { type PropertyDeclarations } from 'lit';
import { type Doc, type Op } from '../../doc/index.ts';
import { DocElement, type Entry, type Picked } from '../../kit/core/element.ts';
import { type Draft, type Hit, type KindId } from './model.ts';
import { type Diagram } from './view.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/context.ts';
import '../../kit/ui/insert.ts';
import '../../kit/ui/menu.ts';
import '../../kit/text/text.ts';
import './style.css';
export declare const tag = "to-diagram-editor";
export interface DiagramView {
    kind: KindId;
    d: Diagram;
}
/**
 * What the words over the picture are editing: a thing of a line of the document (`at`; the characters of the
 * line its words take, `span`), or a name that is not one line's words (a lane, a thing only connections name, a
 * connection's words), written back wherever the name is.
 */
interface Target {
    hit: Hit;
    at: number;
    span: [number, number];
    /** A second line is kept, as the line's " | " (a timeline's event: its date, then ": " and what happened). */
    lines: boolean;
    dated: boolean;
    /** The name as it stands, for a name renamed wherever it is. */
    name: string;
}
export declare class ToDiagramEditor extends DocElement<DiagramView> {
    static properties: PropertyDeclarations;
    /** The thing whose words are open, or null. */
    target: Target | null;
    /**
     * Joining, armed (the bar's Join, the thing's own Join): the name of the thing the connection starts from, and the
     * next thing tapped is its other end; '' while the first end is still to be tapped. Null when not joining.
     */
    joining: string | null;
    /** The picture's scale: 0 fits it to the width. */
    zoom: number;
    private drag;
    /** When a drag last ended: the click that follows it is not a tap. */
    private quietUntil;
    /** Counts the times the words are opened: a burst of typing is one undo step within one opening only. */
    private session;
    /** The document as it was when the words were opened (Escape puts it back), and the thing they were opened on. */
    private openText;
    private openHitAt;
    /** The words over the thing open, as <to-text> holds them: one block, its lines the thing's lines. */
    private wordsBlocks;
    /** Escape is taking the typing back: the undos it makes move nothing. */
    private restoring;
    /** A Mod+C, X or V whose clipboard event has not come (Safari sends none with nothing selected): done by hand. */
    private clipPending;
    private unpinch;
    constructor();
    protected read(doc: Doc): DiagramView;
    connectedCallback(): void;
    disconnectedCallback(): void;
    /** An edit that moves the thing in hand from `before` to `after`, so undo and redo can give it back. */
    change(ops: Op[], before: Hit | null, after?: Hit | null, key?: string): void;
    /** Undo or redo: the words close, and the focus goes to the thing that changed (where it was, else where the change begins). */
    protected undone(entry: Entry, redo: boolean): void;
    protected updated(changed: Map<string, unknown>): void;
    /** The things to do to the thing open sit under its words while a thing is in hand. */
    private syncContext;
    private get ctx();
    private get wrap();
    /** The drawn thing for a hit (or, with none, for the line at `at`). */
    private gOf;
    /** Where a person starts: the picture itself, nothing being edited. */
    focusFirst(): Promise<void>;
    /** The focus on a thing once the picture is drawn again; on the picture itself when the thing is gone. */
    private focusThing;
    private get wordsEl();
    /** What the words are called, and what they say while empty, for a target. */
    private wording;
    /**
     * A thing's words as a target and as the words over it show them: the part of its line the thing draws (an
     * icon in front left where it is, drawn on the thing), its " | " as line breaks; a timeline's date its first line.
     */
    private targetFor;
    /** The words over a line's thing, as its line writes them (model.ts `wordsInto`). */
    private lineRuns;
    /**
     * The words of a thing, over it, the caret (or a selection) at [from, to) of them, all of them chosen when none
     * is given. Focused here, synchronously, in the tap's, the key's or the menu's own handler, as the Drawing Tool's
     * are: iOS lets the focus in and raises the keyboard only so.
     */
    open(hit: Hit, sel?: [number, number], fresh?: boolean): void;
    /**
     * The words laid exactly over the thing's own (which it draws blank meanwhile): the same font at the size the
     * picture shows it, in the wrap's frame so they scroll with the picture.
     */
    private placeWords;
    /**
     * A new thing: in the document at once, its words offered (the kind's "New idea", "Name", a table's next name)
     * and chosen, so the first letter typed replaces them; Escape takes it away again. The words open over it.
     */
    openDraft(d: Draft): void;
    /** The thing drawn for the characters [a, b) of line `at`: the smallest part of it that holds them. */
    private hitOn;
    /** Done with the words: hidden, and a list they leave tidied. */
    shut(tidyUp?: boolean): void;
    /** Done: the words kept, the focus back on the thing they were opened on. */
    shutAndFocus(): void;
    private onOps;
    /** The words' ops: applied to their block, handed back, and the thing's words written where they belong, so the picture follows. */
    private applyWords;
    /** Enter: the next thing like this one, made and its words open. Shift+Enter a second line, where the thing draws one. */
    private onEnter;
    /** Done with these words, and the next thing like this one made, its words open (Enter; a comma ending a thing of a list). */
    private next;
    /** Backspace at the start: a thing with no words left goes. */
    private onExit;
    /** Escape, once <to-text> has closed its boxes and collapsed its words: the words as they were when opened (a new thing gone again), the thing still in hand. */
    private onEscape;
    /** Mod+A with the words already whole: there is no choosing every thing of a picture, so the words stay chosen. */
    private onSelectAll;
    /**
     * Keys in the words, before <to-text> sees them: Mod+Enter is done; the words are plain, so the marks' keys do
     * nothing; Mod+D, Alt+Up/Down and, in a tree, Tab and Shift+Tab act on the thing open, as they do on a focused one.
     */
    private onWordsKey;
    /** The focus gone from the words by the keys (Tab) to somewhere not the picture, the things under them or a box of theirs: done with them. */
    private onWordsBlur;
    private indexOf;
    iconFor(hit: Hit): Promise<void>;
    /** The thing open, or the thing that has the focus. */
    private inHand;
    /** After an edit to the thing in hand: its words open on it again where it now is, or the focus on it. */
    private reopenOn;
    /** Past its neighbour (Alt+Up/Down, Move up/down); the words stay open on it if they were. */
    move(hit: Hit, by: 1 | -1): void;
    /** Whether a tree's thing can go in under the thing before it (1) or out to its grandparent (-1). */
    canShift(hit: Hit, by: 1 | -1): boolean;
    /**
     * Indent (Tab) or bring out (Shift+Tab) a tree's thing with its family. Open words are kept first, as Enter keeps
     * them, and opened again on the thing where it now is, the caret where it was; one undo step takes the move back.
     */
    shift(hit: Hit, by: 1 | -1): void;
    /** Into the next lane or to the next table (Mod+Alt+Left/Right). */
    across(hit: Hit, by: 1 | -1): void;
    duplicate(hit: Hit): void;
    removeHit(hit: Hit): void;
    /** The thing as our clipboard carries it: TLO, and our HTML with the marker. */
    private clip;
    private paste;
    /** Copy, cut and paste from the keys while a thing (or the picture) has the focus; words being typed are <to-text>'s own. */
    private onClipboard;
    /** The context bar's Copy and Cut: the system clipboard as the page may write it, and this page's own memory of it. */
    copyOut(hit: Hit, cut: boolean): void;
    /** The context bar's Paste: the system clipboard if the page may read it, else what was last copied here. */
    pasteIn(hit: Hit | null): Promise<void>;
    /** The things to do to the thing open (commands.ts), in the standard's order: Move up, Move down, the kind's own, a tree's Indent and Bring out, Duplicate | Copy, Cut, Paste | Delete. */
    private contextItems;
    /** A new thing, its words opened (Add under it, Add a step). */
    addFrom(d: Draft | null): void;
    /** Insert ▾'s thing: a new one, its words offered. */
    addThing(): void;
    setKindTo(k: KindId): void;
    /** A connection drawn as a plain line or an arrow. */
    toggleArrow(hit: Hit, arrow: boolean): void;
    printCards(): void;
    /** A thing's name, for whether it can be joined from. */
    nameOfHit(hit: Hit): string;
    private point;
    /** A tap on the picture: on a thing, its words (or the other end of a connection being made); on empty space, a new thing there. */
    /**
     * Read-only, a thing activated (a click, a tap, Enter on it) is picked (kit/core/element.ts "docpick"): its line's
     * block (`at`, -1 for a thing only connections or a lane name), what it is (`thing`: a line's `line`, a connection's
     * `edge`, a lane's `lane`, a name's `node`), its words as drawn (`words`), and for a line which of its parts (`part`:
     * the whole, its key, its words, or a thing of its list by place) and for a name or a lane the name (`name`).
     */
    protected pickOf(el: Element): Picked | null;
    private onClick;
    /**
     * Join, from the bar or the thing's own row: armed from the thing in hand (open or focused), the next thing tapped
     * is joined to it; with nothing in hand, the next two tapped are joined. Pressed again, or Escape, disarms it.
     */
    armJoin(): undefined;
    /** A thing tapped (or Enter on it) while joining: the first end taken, or the connection made and joining done. */
    private joinTo;
    private nameOf;
    /** A press outside the words, the things under them, the picture and the bar: the words close (kept), as a menu's would. */
    private onOutside;
    /** The thing nearest the focused one in an arrow's direction. */
    private nearest;
    /** The thing a key is typed on, while the commands answer it (commands.ts); null on the picture itself. */
    here: Hit | null;
    /** Keys on the picture (commands.ts): on a focused thing, the standard's (docs/editing.md §1, §5); on the picture, Escape stops a join. */
    private onKey;
    /** Enter or Space on a thing: its words open, or a join ends on it. */
    openKey(hit: Hit): undefined;
    /** An arrow on a thing: the nearest thing that way takes the focus. */
    nearestKey(e: KeyboardEvent): boolean;
    /** The first arrow on the picture goes in, to its first thing. */
    focusFirstThing(): void;
    private onDown;
    private onMove;
    /** The thing under the pointer, the one being dragged aside. */
    private overAt;
    private onUp;
    private onCancel;
    /** Mod with the wheel (a trackpad's pinch is one) zooms the picture; the wheel alone scrolls. */
    private onWheel;
    zoomBy(by: number): void;
    /** The zoom as the picture is drawn: its own, or (fitted to the width) the width it has over its natural one. */
    private shown;
    private thing;
    render(): import("lit-html").TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-diagram-editor': ToDiagramEditor;
    }
}
export {};
