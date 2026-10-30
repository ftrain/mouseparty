/**
 * A drawing drawn, with no DOM: each shape as SVG, the page of
 * them over its background tile, the pixel grid as a picture. What `def.ts` builds its pages and files on;
 * the editor draws its shapes with the same shapeSvg, in the page's own colours.
 */
import type { Page } from '../../kit/core/app.ts';
import { type Tile } from '../../kit/draw/tile.ts';
import { type Doc, type Run } from '../../doc/index.ts';
import { type Shape } from './model.ts';
export interface Theme {
    ink: string;
    paper: string;
    shade: string;
    /** Words on a color's tint (a light fill of it), from the color: the color itself unless a theme says (the Diagram Maker's, in the dark). */
    onTint?: (color: string) => string;
}
/** A shape's turn about its centre, as a transform ('' for none: a line is never turned). */
export declare const turnOf: (s: Shape) => string;
/**
 * One shape as SVG. `all` is the drawing it belongs to (joins need to find their shapes). The editor draws
 * with the same function, passing the page's colours and asking for a fat invisible line to make thin ones
 * easy to hit. A turned shape is drawn in a group turned about its centre, its words with it.
 */
export declare function shapeSvg(s: Shape, all?: Shape[], th?: Theme, hit?: boolean): string;
/** A shape's words as they are set in it: wrapped to the room inside, made smaller (to 0.6 of their size) while they do not fit, and past that cut short with "…". */
export interface LabelFit {
    icon: string;
    words: string;
    /** The icon's size beside the words, in the size of the type (0 for none). */
    big: number;
    laid: {
        px: number;
        room: number;
        lines: {
            runs: Run[];
            t: string;
            small: boolean;
            strong: boolean;
        }[];
    };
    /** How much smaller than the shape's own size the words had to be set (1: not at all). */
    scale: number;
    /** Whether the words were cut short, the last line ending in "…". */
    cut: boolean;
}
/** How a shape's words fit it (`base` its type's size): what shapeSvg draws, and what the lint reads (src/lint.ts). */
export declare function fitLabel(s: Shape, base?: number): LabelFit;
/** The arrowheads a drawing may use, one per colour. */
export declare const arrowDefs: (ink?: string) => string;
/** The side of one repeat of a background tile on a page, in px. */
export declare const TILE_SIDE = 64;
/** Shapes as a page of any size, over a tile if there is one; `upTo` of them while it builds. Every diagram draws through here. */
export declare function shapesPage(shapes: Shape[], w?: number, h?: number, upTo?: number, tile?: Tile | null): Page;
/** A page cut to the box at (x, y), w by h: what lies outside it is out of the picture. */
export declare const cropPage: (p: Page, x: number, y: number, w: number, h: number) => Page;
/**
 * The drawing's one page: in pixel mode the grid; else the shapes over their tile, with the alt text its author
 * wrote, or a description from the shapes. As a thumbnail (`thumb`) the page is the picture's own box (landscape
 * when it is wider than tall), so a small drawing in a corner is not a speck; a tiled page stays whole.
 */
export declare function drawingPage(doc: Doc, upTo?: number, thumb?: boolean): Page;
export declare const drawingToSvg: (doc: Doc) => string;
