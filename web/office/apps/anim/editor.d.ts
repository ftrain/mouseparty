/**
 * <to-anim-editor>: a drawing that moves. Draw mode is Draw's own editor, given the drawing alone; what it
 * changes comes back as one splice of the table of shapes (in Draw's own bursts), and the keys follow their
 * shapes. Move mode puts the time on a moment and lets you drag a shape to where it should be then, bring it
 * in front of the others (depth), grow it (the handle, or the slider), spin it in the plane, turn it about its
 * upright axis like a card, and give it effects; between the moments you set, it travels in straight lines. A canvas as the standard has it (docs/editing.md §5, §8): a tap chooses a shape,
 * Shift+tap adds one, Mod+A takes them all; the shapes in hand have a contextual bar under them (a key here,
 * the words, duplicate, copy, cut, paste, delete); the arrows nudge them (with none in hand, and always by
 * comma and full stop, they step a frame); Enter or two taps open a shape's words in Draw; the clipboard
 * carries the shapes with their keys. Every change is operations on the document (model.ts), and an undo
 * puts the shapes in hand back. Laid out for a phone first (Paul, 2026-10-11: "all over the place with lots of white
 * space"): in Move mode the stage, the filmstrip right under it (every frame, numbered, the one in hand outlined, with
 * its menu: duplicate, delete, a frame earlier or later), the scrubber with the chosen shape's keys on it and the time
 * at its end, then the chosen shape's sliders; the length (frames), the speed (frames a second) and how it repeats
 * (for ever, once, a number of times, back and forth) behind Settings in the bar, a small sheet. Under either mode, at
 * the column's foot above the bar, the row: Draw and Move as one control, and the mode's hint in full.
 */
import { type PropertyDeclarations, type PropertyValues } from 'lit';
import { DocElement, type Entry } from '../../kit/core/element.ts';
import { type Doc, type Op } from '../../doc/index.ts';
import { type AnimView, type Key as AnimKey } from './model.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/menu.ts';
import '../../kit/ui/context.ts';
import '../../kit/ui/dialog.ts';
import './style.css';
export declare const tag = "to-anim-editor";
export declare class ToAnimEditor extends DocElement<AnimView> {
    static properties: PropertyDeclarations;
    mode: 'draw' | 'move';
    frame: number;
    /** The shapes in hand, the last chosen last; [] for none. */
    sels: number[];
    playing: boolean;
    /** The fractional frame while playing. */
    clock: number;
    /** The motion as shown while a shape is dragged; the document is written when the pointer lets go. */
    live: AnimView | null;
    /** How large the stage is shown: 1 fits the page's width. */
    zoom: number;
    /** A drag is on: the stage keeps the finger. */
    held: boolean;
    /** Once the mode has been chosen by hand, a new reading of the document does not choose it again. */
    private chosen;
    private raf;
    private drag;
    private thumbs;
    /** Draw's editor is made afresh when this changes (after an undo under its open words, or a refused change). */
    private drawGen;
    /** The shapes to hand Draw once it is drawn. */
    private handOver;
    /** The last tap on a shape: which, and when (for two taps). */
    private lastTap;
    /** The last Mod+C, X or V on the stage: done by the browser's own event or by hand, whichever comes first, never both. */
    private press;
    /** Two fingers are on the stage: the pinch is kit/ui/pinch.ts's, and the pointers are not the shapes'. */
    private pinching;
    private unpinch;
    constructor();
    protected read(doc: Doc): AnimView;
    protected willUpdate(changed: PropertyValues): void;
    protected updated(changed: PropertyValues): undefined;
    /** After an undo or a redo: the shapes that were in hand then are in hand again, and the focus is on the stage (or Draw's canvas). */
    protected undone(entry: Entry, redo: boolean): void;
    connectedCallback(): void;
    disconnectedCallback(): void;
    private onInnerHistory;
    /** What is drawn: the document's motion, or the one under the pointer. */
    private get anim();
    /** The shape chosen last, -1 for none: the one whose keys are on the scrubber and whose depth, size and spin are shown. */
    get sel(): number;
    private get stageEl();
    private get drawEl();
    /** Where a person starts: the stage (Draw's canvas while the drawing is open). */
    focusFirst(): Promise<void>;
    private focusStage;
    seek(frame: number): void;
    pause(): void;
    /** Play from the moment in hand (from the start, when a play that stops has ended), as the motion repeats: for ever, once, a number of times, or back and forth. */
    toggle(): void;
    setMode(mode: 'draw' | 'move'): void;
    private secs;
    private drawSelection;
    private handDraw;
    /** Draw mode's change: Draw's text is not the document, ours is, with the drawing inside it; Draw's burst is ours. */
    private onDrawChange;
    /** The selected shape's words, typed on it: Draw's own words, opened on the same shape from here (Enter, two taps). */
    editWords(i?: number): void;
    /** An edit made in Move mode: the shapes in hand before and after it go with it, for undo. */
    act(ops: Op[], key?: string, after?: number[]): void;
    /** Each shape in hand keyed at this moment, changed as asked (a function of where it is now, or the same change for all). */
    key(change?: Partial<AnimKey> | ((at: AnimKey, i: number) => Partial<AnimKey>), burst?: string): void;
    toggleFx(letter: string): void;
    /** The shapes in hand moved by (x, y) at this moment, never off the stage. */
    nudge(x: number, y: number): void;
    /** The shapes in hand grown (or shrunk) a tenth at this moment. */
    grow(by: number): void;
    removeKeyHere(): void;
    removeSel(): void;
    duplicateSel(): void;
    selectAll(): void;
    /** What copy puts on the clipboard for the shapes in hand: their motion in TLO, and our HTML of it. Null when nothing can be copied. */
    private clip;
    /** Pasted: shapes (a motion's or a drawing's) beside where they were, moving as they did; or words as a text in the middle. */
    private pasteData;
    /** Copy, cut and paste from the keys, while the stage has the focus. */
    private onClipboard;
    /** The contextual bar's Copy and Cut: the system clipboard as the page may write it, and this page's own memory of it. */
    copyOut(cut: boolean): void;
    /** The contextual bar's Paste: the system clipboard's words if the page may read them, else what was last copied here. */
    pasteIn(): Promise<void>;
    /** The stage's keys in Move mode (commands.ts); in Draw mode the keys are Draw's, and only the stage's own keys are ours (never a bar button's, a field's, a menu's). */
    private onKey;
    /** The arrows: the shapes in hand nudged (Shift by five), sized with Mod; with none in hand Left and Right step a frame (§8). */
    arrowKey(e: KeyboardEvent): boolean;
    /** Escape, one step a press: the playing stops, then the shapes are let go. */
    stepOut(): boolean;
    /** The pointer in stage units (the stage's box may be wider than its picture when its height is capped: the picture is centred in it). */
    private point;
    /** CSS pixels to a stage unit. */
    private scale;
    /** Where the shapes in hand are on the screen: where the contextual bar goes under. */
    private selRect;
    private onDown;
    private onMove;
    private onUp;
    private onWheel;
    /** The frame in hand shown twice; the second of them in hand. */
    duplicateFrame(): void;
    /** The frame in hand cut out; the one after it (or the new last) in hand. */
    removeFrame(): void;
    /** The frame in hand moved a frame earlier or later; it stays in hand. */
    moveFrame(by: -1 | 1): void;
    /** The frame in hand scrolled into the strip's view, the strip alone (never the column). */
    private showFrame;
    /** The length, the speed and the repeat: a small sheet (Settings in the bar). */
    openSettings(): void;
    /** A number field's words committed: the length or the speed, held to what it may be (the field shows what was kept). */
    private setNumber;
    /** The contextual bar under the shapes in hand (commands.ts; §5's order, for a motion). (Depth, size, spin, turn and the effects are beside the sliders.) */
    private contextItems;
    render(): import("lit-html").TemplateResult<1>;
    private hint;
    private renderBar;
    /** The row at the column's foot, above the bar, in either mode: Draw and Move as one control, and what to do now, in full. */
    private renderRow;
    private renderStage;
    private renderProps;
    /** The sheet behind Settings: the length in frames, the speed in frames a second and how it repeats, one line each, and the length in seconds under them; written as the head's frames, fps and loop. */
    private renderSettings;
    /** Every frame's little picture; drawn again when the document changes. */
    private thumbnails;
    /** Under the stage: the filmstrip (every frame, the one in hand outlined, its menu at the end), then the scrubber with the keys on it and the time at its end. */
    private renderTime;
}
