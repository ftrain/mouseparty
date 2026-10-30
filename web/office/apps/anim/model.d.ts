/**
 * Motion as a view of the document, and its commands as operations. A motion document is a drawing whose shapes move: Draw's table of shapes as Draw
 * writes it (src/apps/draw/model.ts), the length, the speed and how it repeats in the head, and a table of
 * the shapes that move:
 *
 *   ---
 *   frames: 24
 *   fps: 8
 *   loop: bounce
 *   ---
 *   Kind | X | Y | W | H | Style | Label
 *   --- | --- | --- | --- | --- | --- | ---
 *   i | 8 | 36 | 8 | 8 | 0b | rocket
 *
 *   Shape | Keys
 *   --- | ---
 *   0 | 0,0,0,0,1,0; 23,200,-200,100,1,-30,d
 *
 * A shape is its number among the drawing's shapes, from 0 (as a join counts them). Keys are separated by
 * ";", each "<t>,<dx>,<dy>,<z>,<s>,<r>[,<fx>[,p<corners>][,u<turn>]]": the frame, the offset in px from
 * where the shape was drawn, its depth (which shape is in front: nearer when positive, -200 to 200; a far
 * shape is drawn a little dimmer, never smaller), its size (1 = as drawn), its spin in the plane in degrees
 * (on top of the turn the drawing gives it), letters for effects (EFFECTS), for a pen shape its corners
 * ("p0:0/100:50/0:100"), and its turn about its upright axis in degrees ("u180": a card turned over, drawn
 * as a squeeze across of cos(turn), mirrored past 90°). Between keys a shape travels in straight lines.
 *
 * The head: `frames` (2 to 120, 24 when absent), `fps` (1 to 30, 8 when absent) and `loop`: absent for
 * forever, "once", a number of times ("3"), or "bounce" (forward, then back, and again). Playback, the GIF
 * and the animated SVG all keep it. A Draw document on its own is a motion document in which nothing moves
 * yet, which is the whole of Draw's hand-off.
 *
 * The commands: the shapes are Draw's, so a shape taken out or copied is Draw's own ops on the shapes table
 * (`rows`, `cells`), and a drawing redrawn in Draw mode replaces that table (`splice`); the keys table is
 * replaced whole by a `splice` (put in when the first key is, taken out with the last); length, speed, alt
 * and the background tile are `head` ops. In every case the keys follow their shapes.
 */
import { type Doc, type Op } from '../../doc/index.ts';
import { type DrawView, type Shape } from '../draw/model.ts';
export declare const DEFAULT_FRAMES = 24;
export declare const MIN_FRAMES = 2;
export declare const MAX_FRAMES = 120;
export declare const MIN_FPS = 1;
export declare const MAX_FPS = 30;
export declare const DEFAULT_FPS = 8;
/** How it repeats: for ever, once, a number of times, or forward and back for ever. */
export type Loop = 'forever' | 'once' | 'bounce' | number;
/** How far a thing may come forward or go back, in px. */
export declare const MAX_Z = 200;
/** The effects, by letter: the order the menu lists them in. Names are keys for t(). */
export declare const EFFECTS: {
    letter: string;
    name: string;
}[];
export interface Key {
    /** Frame number. */
    t: number;
    /** Offset from where the shape was drawn, px. */
    dx: number;
    dy: number;
    /** Depth, px: positive is nearer (and so larger). */
    z: number;
    /** Scale, 1 = as drawn. */
    s: number;
    /** Spin in the plane, degrees. */
    r: number;
    /** Turn about the upright axis, degrees; absent for none. */
    u?: number;
    /** Effect letters, any combination. */
    fx: string;
    /** For a pen shape: its corners at this key (hundredths of its box), tweened to the next key's when both have as many. */
    pts?: number[];
}
/** What Motion draws, read from the document. */
export interface AnimView {
    frames: number;
    fps: number;
    loop: Loop;
    /** Draw's reading of the same document: the shapes, their table, the alt, the tile. */
    draw: DrawView;
    shapes: Shape[];
    /** One list per shape, sorted by frame; empty when it stays put. */
    keys: Key[][];
    /** The keys table's block, or -1 while nothing moves. */
    keysAt: number;
    alt: string;
}
/** A key that leaves the shape as it was drawn. */
export declare const restKey: (t: number) => Key;
/** How bright a shape is drawn at a depth: as drawn in front (0 and nearer), down to two thirds at the very back. Depth never changes the size. */
export declare const depthDim: (z: number) => number;
/** How wide a shape turned about its upright axis is drawn: cos(turn), so it narrows to an edge at 90° and comes back mirrored. */
export declare const turnScale: (u: number | undefined) => number;
/** The keys table: the first table with a Keys column. */
export declare const keysAt: (doc: Doc) => number;
/** How it repeats, from "loop: once" (leniently: "1" is once, "0", "", "forever" and anything else for ever). */
export declare function loopOf(v: string | undefined): Loop;
/**
 * Where a playback is after `f` frames' time (fractional): the frame to show and whether it has stopped. For
 * ever and bounce never stop (bounce runs to the end and back); once and a number stop on the last frame.
 */
export declare function playhead(frames: number, loop: Loop, f: number): {
    frame: number;
    done: boolean;
};
/** The frames of one round, in the order they show: 0 to the end, and for bounce back again (the ends shown once each). */
export declare const frameOrder: (frames: number, loop: Loop) => number[];
/** The GIF's loop count (the NETSCAPE block's: 0 for ever, else the repeats after the first play), or false for none at all (it plays once). */
export declare const gifLoop: (loop: Loop) => number | false;
/** A cell of keys read, for a motion `frames` long. */
export declare function keysOf(cell: string, frames: number): Key[];
export declare function readAnim(doc: Doc): AnimView;
/** Where shape `i` is at a (possibly fractional) frame. Effects hold from a key until the next. */
export declare function stateAt(anim: AnimView, i: number, frame: number): Key;
/** Does shape `i` have a key at this frame? */
export declare const hasKey: (anim: AnimView, i: number, t: number) => boolean;
/**
 * Several shapes keyed at once, each at its own key's frame, as one splice of the keys table: what a drag, a
 * nudge, K, an effect or a slider does to the shapes in hand. A shape keyed for the first time at a later
 * moment gets a key at the start too, where it was drawn, so it travels from there (its corners as drawn,
 * when its corners are what is keyed).
 */
export declare function withKeys(doc: Doc, list: {
    i: number;
    key: Key;
}[]): Op[];
/** How far shape i may go from where it was drawn and stay on the stage: [min dx, max dx, min dy, max dy]. */
export declare function room(anim: AnimView, i: number): [number, number, number, number];
/** Shape i's key at frame t taken away. */
export declare function removeKey(doc: Doc, i: number, t: number): Op[];
/** The length and the speed: `head` ops, and the keys past the new end taken out. */
export declare function setLength(doc: Doc, frames: number, fps: number): Op[];
/** Frame f shown twice (the motion a frame longer); [] at the longest. */
export declare function duplicateFrame(doc: Doc, f: number): Op[];
/** Frame f cut out (the motion a frame shorter); [] at the shortest. */
export declare function removeFrame(doc: Doc, f: number): Op[];
/** Frame f moved a frame earlier (by -1) or later (by 1), changing places with its neighbour; [] past either end. */
export declare function moveFrame(doc: Doc, f: number, by: -1 | 1): Op[];
/** How it repeats: a `head` op ([] when it is so already). */
export declare function setLoop(doc: Doc, loop: Loop): Op[];
/**
 * Which old shape each new one is, after the drawing was changed by hand (Draw mode): first a shape
 * unchanged wherever it went (a reorder, a join renumbered), then what is left paired in order (a shape
 * moved, resized or relabelled, with the joins to it). -1 for a shape that is new.
 */
export declare function follow(was: Shape[], now: Shape[]): number[];
/** Shape i taken out, with the joins to it (Draw's ops), and the keys of the rest kept with their shapes. */
export declare function removeShape(doc: Doc, i: number): Op[];
/** A copy of shape i, a little down and to the right, at the end, moving as it does. */
export declare function duplicateShape(doc: Doc, i: number): Op[];
/** Several shapes taken out, the last first, each with the joins to it, and the keys of the rest kept with their shapes. */
export declare function removeShapes(doc: Doc, list: number[]): Op[];
/** Copies of several shapes, each moving as its own does; `sel` the copies' numbers. A join has no copy. */
export declare function duplicateShapes(doc: Doc, list: number[]): {
    ops: Op[];
    sel: number[];
};
/**
 * Shapes in hand as a motion of their own, for the clipboard: their table (the joins among them renumbered),
 * their keys with them, the length and the speed. Pasted into the Drawing Tool it is their drawing; into a
 * motion, they move as they did.
 */
export declare function motionOf(doc: Doc, list: number[]): Doc | null;
/**
 * A motion (or a drawing) pasted in: its shapes added beside where they were (Draw's paste) and its keys
 * following them, those past this motion's end left out. `sel` the shapes pasted, joins aside; [] when there
 * were none.
 */
export declare function pasteMotion(doc: Doc, pasted: Doc): {
    ops: Op[];
    sel: number[];
};
/** The drawing alone, as Draw's editor is given it in Draw mode: its alt, its tile and its table. */
export declare function drawingOf(doc: Doc): Doc;
/**
 * The drawing as Draw's editor left it: the table of shapes replaced (a `splice`; put in or taken out as
 * need be), its alt and tile into the head, and the keys following their shapes. Draw's other fields (a
 * pixel grid) are not Motion's and are left out.
 */
export declare function redraw(doc: Doc, drawing: Doc): Op[];
/**
 * Motion as a person or a program loosely writes it, with no table of shapes: each thing listed (an item, a
 * line of a paragraph or a heading) on the stage, one above the next, drifting from left to right
 * (":rocket:" alone is that icon), and a quote saying what it shows. Applied as the document arrives, one
 * splice and the head; [] for a document that has its table, or nothing to list.
 */
export declare function loosen(doc: Doc): Op[];
