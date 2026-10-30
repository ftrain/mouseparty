/**
 * <to-draw-editor>: a little diagram tool, and pixel art as a grid mode. Shapes are drawn on a 640 by 400
 * canvas by tools in the bar (a key each), moved and resized by hand, their words typed on the shape itself (a
 * double tap, or Enter) in a one-line <to-text> whose bubble has the marks (the label keeps them as inline Markdown);
 * a shape in hand has the contextual bar under it (inks, style, text size, a text's alignment, rotate, edit, duplicate, front/back, copy,
 * cut, paste, delete), a round handle above it that rotates it ([ and ] rotate it by 15°), and a drag on empty canvas
 * chooses every shape inside its box. The clipboard carries shapes as a drawing of their own (TLO and our HTML).
 * Every change is operations on the document's table (model.ts).
 * In pixel mode (the Shapes/Pixels menu) the canvas is a grid of squares, painted with a pencil or a fill in
 * one of eight inks, and Background makes the grid the drawing's repeating tile.
 */
import { type PropertyDeclarations } from 'lit';
import { type Tool } from './commands.ts';
import { DocElement, type Entry } from '../../kit/core/element.ts';
import { type Block, type Doc } from '../../doc/index.ts';
import { type Align, type DrawView, type Kind, type Shape } from './model.ts';
import { type Theme } from './view.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/insert.ts';
import '../../kit/ui/menu.ts';
import '../../kit/ui/dialog.ts';
import '../../kit/ui/context.ts';
import '../../kit/text/text.ts';
import './style.css';
export declare const tag = "to-draw-editor";
/** The page's own colours, so a drawing looks right in the dark too. */
export declare const THEME: Theme;
type Drag = {
    mode: 'link';
    from: number;
    to: [number, number];
} | {
    mode: 'draw';
    start: [number, number];
    shape: Shape;
} | {
    mode: 'move';
    idx: number;
    off: [number, number];
    orig: Shape;
    twice: boolean;
} | {
    mode: 'resize';
    idx: number;
    orig: Shape;
} | {
    mode: 'turn';
    idx: number;
    orig: Shape;
} | {
    mode: 'marquee';
    from: [number, number];
    to: [number, number];
    base: number[];
} | {
    mode: 'free';
    pts: [number, number][];
};
/** The words editor's block back as a label's words: its line breaks are the label's " | ". */
export declare function blockWords(b: Block | undefined): string;
export declare class ToDrawEditor extends DocElement<DrawView> {
    static properties: PropertyDeclarations;
    tool: Tool;
    /** The chosen shapes, in the order they were chosen (Shift+tap adds one; Mod+A takes them all). */
    picked: number[];
    /** The Join tool from the keys: the shape the join starts from, chosen with the arrows and Enter; -1 for none yet. */
    joinFrom: number;
    /** The pen's corners so far, in px; the shape is made when the pen is closed (Enter, a double tap, or the first corner again). */
    pen: [number, number][];
    drag: Drag | null;
    /** The shapes as shown while one is being moved or resized; the document is written when the pointer lifts. */
    live: Shape[] | null;
    /** How large the canvas is shown: 1 fits the page's width. */
    zoom: number;
    /** Pixel mode: the ink in hand ('.' is the eraser) and what a tap does. */
    ink: string;
    pmode: 'pen' | 'fill';
    /** Pixel mode: the square the keyboard is on. */
    cursor: [number, number];
    /** The alt text being written, while its dialog is open; null when it is closed. */
    altDraft: string | null;
    /** The shape whose words are being typed on it, -1 for none. */
    editing: number;
    /** The shape as it was when its words were opened (Escape puts it back), and the icon kept out of the overlay. */
    private wordsFrom;
    private wordsIcon;
    /** Counts the times words are opened, so each time's typing is its own undo step. */
    private wordsTimes;
    /**
     * The last Mod+C, X or V on the canvas: done by the browser's own clipboard event when it comes, or by hand when
     * it does not; whichever is first marks it done, so the other never does it again (a paste is one paste).
     */
    press: {
        clip: 'copy' | 'cut' | 'paste';
        done: boolean;
        at: number;
    } | null;
    /** The words being typed on a shape, as the one block <to-text> holds. */
    private wordsBlocks;
    /** The icon the next tap will place, when the icon tool is armed. */
    stamp: string;
    private svgEl;
    /** The last tap on a shape by a finger or a pen, so a second one soon after on the same shape edits its words. */
    private lastTap;
    /** Two fingers are on the canvas: the pinch is kit/ui/pinch.ts's, and the pointers are not the tools'. */
    private pinching;
    private unpinch;
    /** Counts the pixel strokes, so each stroke is one undo step. */
    private strokes;
    private painting;
    constructor();
    protected read(doc: Doc): DrawView;
    /** After an undo or a redo: the shapes the change was made to are chosen again, and the canvas has the focus. */
    protected undone(entry: Entry, redo: boolean): void;
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected willUpdate(changed: Map<string, unknown>): void;
    /** The mode last drawn (0 for shapes, else the grid's side). */
    private drawnGrid?;
    /** The focus is here, or left here for nowhere (the body). */
    private hadFocus;
    private onFocusIn;
    private onFocusOut;
    protected updated(changed: Map<string, unknown>): undefined;
    /** The shapes as drawn right now: the document's, or the ones in motion under the pointer. */
    get shapes(): Shape[];
    /** The chosen shapes that are there. */
    get chosen(): number[];
    /** The one shape in hand: the last chosen; -1 for none. Set, it is the only one chosen. */
    get sel(): number;
    set sel(i: number);
    get selected(): Shape | null;
    /** An edit, with the shapes chosen before it and after it (the ones chosen now, unless said), so undo and redo choose them again. */
    private change;
    /** Every chosen shape changed the same way (a colour, a style, a size). */
    patchSel(p: Partial<Shape>, key?: string): void;
    /** The texts in hand (or those given) set left, centred or right, as one step; false when none is a text. */
    alignSel(al: Align | '', which?: number[]): boolean;
    /** A new shape, chosen, and the select tool back in hand. */
    private add;
    /** A shape of the default size in the middle of the canvas (a little along for each one already there), from Insert. */
    insert(k: Kind, text?: string): void;
    removeSel(): void;
    duplicateSel(): void;
    /** The chosen shapes to the front or the back, or a place forward or back (Alt+Up/Down), together. */
    reorder(how: boolean | 1 | -1): void;
    /** A join from one shape to another (neither a join, not the same). */
    join(from: number, to: number): void;
    /** The two chosen shapes, when exactly two shapes (no joins) are chosen. */
    get pair(): [number, number] | null;
    /** The chosen shapes moved by the keys (by dx, dy) or resized (by dw, dh), never off the canvas; a run of presses is one undo step. */
    private nudge;
    /** The chosen shapes turned by `deg` about their own centres (lines and joins stay as they are); a run of presses is one undo step. */
    turnBy(deg: number): boolean;
    /** Whether any chosen shape can be turned. */
    get turnable(): boolean;
    /** The pen's corners become a shape: its box is theirs, its points hundredths of it. */
    closePen(): void;
    private stroke;
    /** Zoom in steps of a quarter, between half size and four times. */
    zoomBy(d: number): void;
    private zoomTo;
    /** The Icon button: on a selected shape the icon goes before its label (or is the icon, for an icon shape); with none selected, the next tap places it on its own. */
    pickIcon(): Promise<void>;
    private point;
    /** Where a person starts: the canvas, with the select tool and nothing chosen. */
    focusFirst(): Promise<void>;
    private focusCanvas;
    private onDown;
    private onMove;
    private onUp;
    /** The canvas's keys (commands.ts), for the canvas alone: never from a bar button, a field, a popover, a dialog or the words. */
    private onKey;
    /** Escape, one step out per press: a join begun, then the chosen shapes, then the tool back to Select; false with nothing to step out of. */
    stepOut(): boolean;
    /** A tool's letter (or its button): K with two shapes chosen joins them; otherwise the tool is in hand. */
    pickTool(id: Tool, e?: Event): void;
    /** Mod+A: every shape chosen, the tool back to Select. */
    chooseAll(): void;
    /** The arrows nudge the shapes in hand by a grid step, Shift+Arrows by five; Mod+Arrows resize by one. False where they cannot move. */
    nudgeKey(e: KeyboardEvent): boolean;
    /** Shapes or a pixel grid of n squares. */
    setMode(n: number): void;
    removeTile(): void;
    /** The pencil or the fill, an ink in hand (the eraser gives way to black). */
    paintWith(mode: 'pen' | 'fill'): void;
    /** The Join tool from the keys: the arrows go from shape to shape, Enter takes the first end and then the other, which makes the join. */
    joinKey(e: KeyboardEvent): boolean;
    private get wordsEl();
    /** The canvas's scale: CSS pixels to a canvas unit. */
    private scale;
    /** The chosen shapes' box on the screen (as they show, turned), the handle with it: where the contextual bar goes under. */
    private shapeRect;
    /**
     * The shape's words in the editor over it, focused and all selected, synchronously: called from the tap's,
     * the key's or the button's own handler, so iOS lets the focus in and raises the keyboard. An icon shape
     * opens the icon picker instead.
     */
    openWords(i?: number): undefined;
    /**
     * The editor put exactly over the shape's words: the same font at the size the canvas shows it, centred in
     * the shape (from the left, for a text), turned with it. Below 16px it is set at 16 and scaled down, so iOS does not zoom.
     */
    private placeWords;
    /** The editor's words as the label writes them: lines joined by " | ", the marks as inline Markdown, the icon put back in front. */
    private wordsText;
    /** The words editor's ops: applied to its block, handed back, and the shape's label (and a text's box, grown to hold its words) written, so the picture follows. */
    private onWordsOps;
    private applyWords;
    /** Enter is done; Shift+Enter a line break, which the label keeps as " | ". */
    private onWordsEnter;
    /** Escape, once <to-text> has closed its boxes and let a range go: the words as they were when editing began, in the same undo step as the typing. */
    private onWordsKey;
    /** The focus gone from the words (not into their own bubble or link box): done with them. */
    private onWordsBlur;
    /** Done with the words: the editor hidden, a text left with no words taken out (true then), the focus back on the canvas. */
    private closeWords;
    /** What copy puts on the clipboard for the shape in hand: the drawing of it in TLO, and our HTML of that table. Null when nothing can be copied. */
    private clip;
    /** Pasted text into the drawing: shapes (a drawing's table) beside where they were, or a line of words as a text in the middle. */
    private pasteText;
    /** Copy, cut and paste from the keys, while the canvas has the focus (the overlay's words are the browser's own). */
    private onClipboard;
    /** The bar's Copy and Cut: the system clipboard as the page may write it, and this page's own memory of it. */
    copyOut(cut: boolean): void;
    /** The bar's Paste: the system clipboard's words if the page may read them, else what was last copied here. */
    pasteIn(): Promise<void>;
    paint(x: number, y: number, flood?: boolean): void;
    /** The square under the pointer, or null off the grid. */
    private square;
    private onPixelPointer;
    /** The pixel grid's cursor moved by an arrow. */
    moveCursor(key: string): boolean;
    /** Enter or Space: the square under the cursor painted (filled, with the fill in hand). */
    paintHere(): void;
    clearPixels(): void;
    /** The grid becomes the drawing's background: written into the head as a tile, and the shapes are shown over it. */
    useAsBackground(): void;
    /** The bar under the shape in hand (commands.ts), or under its words while they are typed. */
    private contextItems;
    /** One line under the bar saying what the hand in play does; always there, so nothing jumps. */
    private hint;
    render(): import("lit-html").TemplateResult<1>;
    private renderBar;
    private renderPixelBar;
    /** Drawn by the same code that makes the picture everywhere else (view.ts). */
    private renderShape;
    /** Each chosen shape outlined; one alone has its handle (with a 44px hit area round it under a finger). */
    private renderSelection;
    private renderCanvas;
    private renderPixels;
    openAlt(): void;
    private saveAlt;
    /** The alt text dialog: what the drawing shows, written once, read wherever the drawing goes. */
    private renderAlt;
}
export {};
