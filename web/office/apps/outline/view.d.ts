/**
 * An outline drawn, with no DOM: a dot per item, deeper ones stepped in, the words wrapped with their marks,
 * the kind of line to the parent named before them, a document under an item as a card, the footnotes
 * and the joins listed under it. Fits a letter page's width; as tall as it needs. What def.ts builds its
 * pages on, and the print and the thumbnail.
 */
import { type Dir, type Doc, type Run } from '../../doc/index.ts';
import type { Page } from '../../kit/core/app.ts';
import { docGist } from './model.ts';
export { docGist };
/** How each kind of line looks, drawn. */
export declare const ARROW: Record<Dir, string>;
/** A run as drawn: a note's mark is its number, raised. */
export type Piece = Run & {
    sup?: boolean;
};
/** Rich words wrapped to a width: lines of pieces, broken between words, every mark kept on its piece. */
export declare function wrapRuns(runs: Piece[], max: number, px: number, bold?: boolean): Piece[][];
/** One line of rich words as SVG: tspans carry the marks, a note's number is raised, a link is in the accent, an icon is its glyph. y is the baseline. */
export declare function richText(x: number, y: number, pieces: Piece[], px: number, bold?: boolean, fill?: string): string;
/** The outline drawn: a dot per item, deeper ones stepped in, the words wrapped. `small`: larger type and the first dozen items, for a thumbnail. */
export declare function outlinePage(doc: Doc, w?: number, small?: boolean): Page;
/** An app's id as a person reads it on a card. (The registry is not reachable from a view without a cycle; the few names are said here.) */
export declare function appName(id: string): string;
