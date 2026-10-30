/**
 * The calculator drawn and written out, with no DOM: the tape as a page (each line and what it comes to),
 * the graph as a page (each curve in a colour of its own, named by its expression), and the tape as text.
 */
import type { Doc } from '../../doc/index.ts';
import type { Page } from '../../kit/core/app.ts';
/** The tape: each line, and what it comes to beside it; the last `max` of them. */
export declare function tapePage(lines: string[], title?: string, max?: number): Page;
/** The graph: y = f(x) for each line, across the range the first line may set ("x from -10 to 10"). */
export declare function graphPage(lines: string[], title?: string): Page;
/** The document drawn: its tape or its graph. */
export declare function calcPage(doc: Doc, small?: boolean): Page;
/** The tape as text: a line each and what it comes to; a graph's curves as y = …. */
export declare function tapeText(doc: Doc): string;
