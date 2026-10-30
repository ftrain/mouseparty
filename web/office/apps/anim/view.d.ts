/**
 * Motion drawn, with no DOM: a shape with its effects, the stage at
 * any frame, the whole as an SVG that plays itself, and every frame as a page for the GIF. Shapes are drawn
 * by Draw's own shapeSvg, so a drawing looks the same moving as still.
 */
import type { Page } from '../../kit/core/app.ts';
import type { Doc } from '../../doc/index.ts';
import { type Shape } from '../draw/model.ts';
import { type Theme } from '../draw/view.ts';
import { type AnimView, type Key, type Loop } from './model.ts';
/** The transform that puts a shape where a key says, spinning, sizing and turning it about its centre. */
export declare function transformOf(s: Shape, all: Shape[], k: Key, frame?: number): string;
/** Shape numbers from the furthest to the nearest, so near things are drawn over far ones (depth is the order, not the size). */
export declare const drawOrder: (anim: AnimView, frame: number) => number[];
/** The stage at a frame, as the inside of an <svg>. The theme is the page's colours, for the editor. */
export declare function frameSvg(anim: AnimView, frame: number, theme?: Theme): string;
/** What the motion shows, in words. */
export declare const altOf: (anim: AnimView) => string;
/**
 * The motion as a page that plays (SVG animates itself): each shape's offset, spin, size, turn and depth's dimming
 * tweened between its keys, its effects held as they are at the start. It repeats as the motion says (for ever, a
 * number of times, or forward and back); `once`, it plays once and rests where it ends, which is also what a still of
 * it (print, a picture) shows. A shape that turns is sampled every frame (a turn's squeeze is no straight line).
 */
export declare function animPage(anim: AnimView, once?: boolean): Page;
/** The animated SVG file. */
export declare const animToSvg: (doc: Doc) => string;
/** Every frame of one round as a page, for the GIF, in the order they show (bounce: there and back); how long each stays; and how it repeats. */
export declare function animFrames(doc: Doc): {
    pages: Page[];
    delayMs: number;
    loop: Loop;
};
