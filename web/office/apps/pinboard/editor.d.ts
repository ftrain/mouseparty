/**
 * <to-pinboard-editor>: a board without edges, to pin notes, words, pictures and frames to, draw on with a pen and join
 * with arrows. A drag on the board moves it (so does a trackpad, or the wheel), a pinch or Ctrl and the wheel zoom it
 * about the pointer, and Fit everything brings the whole board into view. The tools in the bar (a letter each) put a
 * thing where the board is tapped, or as large as a drag; the pen draws while it is held; the arrow joins the thing it
 * is pressed on to the thing it is let go on. With Select, a tap takes a thing in hand (Shift adds or takes one away),
 * Shift and a drag on the board chooses every thing inside the box, a drag moves what is in hand (a frame carries what
 * it holds), the corner's handle resizes it, and a double tap types its words on it (a frame's title, a picture's
 * description). The context bar under what is in hand has its colors, its words, Connect, an arrowhead, Bring to
 * front, Duplicate, Cut, Copy, Paste and Delete (what is cut or copied is kept in the page, a frame with what it holds,
 * and the clipboard gets its words; a paste of those words is the things again). A picture pasted or dropped goes to the page's host (`host.images`) and is pinned where
 * it lands. Read-only, the board is moved and zoomed and nothing else. Every change is operations on the document's
 * table (model.ts), so two editors sharing one document through "docops" and `applyRemote` meet in the same board;
 * what is in hand is kept by id, so it stays in hand while others add and take away around it.
 */
import { type PropertyDeclarations, type PropertyValues } from 'lit';
import { type Tool } from './commands.ts';
import { DocElement, type Entry } from '../../kit/core/element.ts';
import { type Doc } from '../../doc/index.ts';
import { type BoardView, type Clip, type Color, type Item, type Patch } from './model.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/insert.ts';
import '../../kit/ui/context.ts';
import '../../kit/text/text.ts';
import './style.css';
export declare const tag = "to-pinboard-editor";
type Drag = {
    mode: 'pan';
    start: [number, number];
    o: [number, number];
    moved: boolean;
} | {
    mode: 'move';
    ids: string[];
    from: [number, number];
    at: [number, number];
    moved: boolean;
    twice: boolean;
    id: string;
} | {
    mode: 'resize';
    id: string;
    orig: Item;
    at: [number, number];
} | {
    mode: 'marquee';
    from: [number, number];
    to: [number, number];
    base: string[];
} | {
    mode: 'place';
    k: 'note' | 'text' | 'frame';
    from: [number, number];
    to: [number, number];
} | {
    mode: 'pen';
    pts: [number, number][];
} | {
    mode: 'link';
    from: string;
    to: [number, number];
};
export declare class ToPinboardEditor extends DocElement<BoardView> {
    static properties: PropertyDeclarations;
    tool: Tool;
    /** The things in hand, by id, in the order they were taken. */
    picked: string[];
    /** The board's scale (screen pixels to a board pixel), and where its origin is on the screen, from the canvas's corner. */
    zoom: number;
    ox: number;
    oy: number;
    drag: Drag | null;
    /** The things as shown while they move or are resized: each one's patch; the document is written when the pointer lifts. */
    live: Map<string, Patch> | null;
    /** The thing whose words (or a picture's description) are typed on it, by id; null for none. */
    editing: {
        id: string;
        alt: boolean;
    } | null;
    /** The canvas's size on the screen. */
    size: [number, number];
    readonly minZoom = 0.1;
    readonly maxZoom = 4;
    private readonly dots;
    /** The board has been brought into view for this document; and since, moved or zoomed by the person (until then it is fitted again as its box changes size). */
    private placed;
    private moved;
    private resizer;
    private pointers;
    private pinch;
    /** The words being typed, as the one block <to-text> holds; what they were (Escape puts them back); how many times words were opened (each time its own undo step). */
    private wordsBlocks;
    private wordsFrom;
    private wordsTimes;
    private lastTap;
    /**
     * The things last cut or copied (kept in the page; the clipboard gets their words), where they were cut from, and how
     * many times they were put down here since: each paste a little further along.
     */
    clip: (Clip & {
        text: string;
        cut: boolean;
        times: number;
    }) | null;
    private pasteWait;
    constructor();
    protected read(doc: Doc): BoardView;
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected willUpdate(changed: PropertyValues): void;
    protected firstUpdated(): void;
    protected updated(changed: PropertyValues): undefined;
    /** After an undo or a redo: what the change was made to is in hand again, and the board has the focus. */
    protected undone(entry: Entry, redo: boolean): void;
    private get canvas();
    /** The board as drawn right now: the document's, with what is moving where the pointer has it. */
    get shown(): BoardView;
    /** The ids in hand that are on the board. */
    get chosen(): string[];
    get chosenItems(): Item[];
    /** The thing in hand: the last taken; null for none. */
    get held(): Item | null;
    /** The two things in hand, when exactly two things (no joins) are. */
    get pair(): [string, string] | null;
    /** An edit, with what was in hand before it and after it (what is in hand now, unless said), so undo and redo take it up again. */
    private change;
    private freshId;
    /** The middle of the board as it is shown, in board pixels. */
    private middle;
    /** A thing of a kind put at a place (its top-left), the default size, in hand; a note, words and a frame have their words opened. */
    private put;
    /** Insert ▾: a thing in the middle of what is shown, a little along for each thing already there. */
    insert(k: 'note' | 'text' | 'frame'): void;
    colorSel(c: Color | ''): void;
    removeSel(): void;
    duplicateSel(): void;
    /** Cut or Copy: what is in hand (a frame with what it holds, and the joins among them) kept to be put down again; the clipboard gets their words. */
    copySel(cut: boolean): void;
    /**
     * Paste: what was cut or copied, put down with new ids. Where it came from is in view, a little along each time (a
     * cut, first where it was); otherwise in the middle of what is shown.
     */
    pasteClip(): void;
    front(): void;
    connect(from: string, to: string): void;
    /** An arrow becomes a line, and lines become arrows. */
    toggleHead(): void;
    pickTool(id: Tool): void;
    /** Escape, a step out a press: a drag let go, then the tool back to Select, then nothing in hand; false with nothing to step out of. */
    stepOut(): boolean;
    chooseAll(): void;
    /** The arrows move what is in hand by a step, Shift by five; a run of presses is one undo step. */
    nudgeKey(e: KeyboardEvent): boolean;
    /** What moves with these: themselves, and what each frame among them holds. */
    private withHeld;
    /** A point on the screen as a point of the board. */
    private toBoard;
    /** Zoomed by a factor about a point of the canvas (its middle by default), that point staying where it is. */
    zoomBy(f: number, at?: [number, number]): void;
    /** Everything brought into view, no larger than `most` times (two, from the bar); an empty board at its own size, its origin near the corner. */
    fit(most?: number): void;
    focusFirst(): Promise<void>;
    private focusBoard;
    /** What is in hand, on the screen: where the context bar goes. */
    private chosenRect;
    private idAt;
    private onDown;
    private onMove;
    private onUp;
    private startPinch;
    private movePinch;
    /** A trackpad's two fingers or the wheel move the board; with Ctrl (a trackpad's pinch) or Mod they zoom it about the pointer. */
    private onWheel;
    private onDouble;
    /** The board's keys (commands.ts), for the board alone: never from a bar button, a field, a popover or the words. */
    private onKey;
    /** Insert ▾ Picture…: a file from the device, pinned in the middle of what is shown. */
    choosePicture(): Promise<void>;
    /** A picture file put to the host and pinned with its middle at a point of the board, no larger than a frame grab is shown. */
    private pinPicture;
    /** Things copied here are pasted as themselves; a picture pasted goes to the host; words pasted are a note. Only while the board has the focus. */
    private onPaste;
    private onDragOver;
    private onDrop;
    private get wordsEl();
    /** A text's height for its words at its width. */
    private textHeight;
    /**
     * The words of a thing in the editor over it, focused and all chosen, synchronously: called from the tap's, the
     * key's or the button's own handler, so iOS lets the focus in and raises the keyboard. A picture's are its description.
     */
    openWords(id?: string | undefined): void;
    /** The editor laid over the thing's words: its font at the size the board shows it (at 16px or more, scaled, so iOS does not zoom), as wide as they wrap. */
    private placeWords;
    private onWordsOps;
    /** Escape, once <to-text> has closed its boxes: the words as they were, in the same undo step as the typing. */
    private onWordsKey;
    private onWordsBlur;
    /** Done with the words: the editor hidden, words on nothing left with none taken out, the focus back on the board. */
    private closeWords;
    private hint;
    render(): import("lit-html").TemplateResult<1>;
    private renderBoard;
    /** What a drag in progress shows: a stroke, an arrow from its thing, the box a tool or Shift draws. */
    private renderDrag;
    /** Each thing in hand outlined; one alone has its corner's handle (larger under a finger). */
    private renderChosen;
}
export {};
