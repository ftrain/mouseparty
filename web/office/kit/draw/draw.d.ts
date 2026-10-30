/**
 * Drawing a document's pages, with no DOM: what a definition's view() builds on, what the build and the
 * tests read under node. The colours and the font are the ones every page is drawn with; a page is SVG.
 */
import type { Page } from '../core/app.ts';
export declare const xml: (s: string) => string;
export declare const PAPER = "#ffffff";
export declare const INK = "#18181b";
export declare const MUTED = "#52525b";
/** The pages' type: IBM Plex Sans, the site's own (src/styles/fonts.css), with the system's behind it where a page is read without the site (an exported SVG or web page). */
export declare const FONT = "'IBM Plex Sans', 'IBM Plex Sans Arabic', 'IBM Plex Sans Hebrew', 'IBM Plex Sans Devanagari', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
/** Code's type: IBM Plex Mono, the site's (tokens.css --to-font-mono), the system's monospace behind it. */
export declare const MONO = "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace";
/** A page as a complete SVG document: a picture named by its alt, unless `attrs` gives it a role and name of its own. */
export declare function pageSvg(p: Page, attrs?: string): string;
/**
 * Every preview is the one box, 4:3, whatever the page's shape (Paul, 2026-10-10: "All previews of docs and templates
 * should be the same size. Cropping is fine. The grid is all over the place."): the page is scaled to cover the box
 * and cropped, kept to the top and the middle, so a portrait page shows its head and a wide slide loses its edges.
 * The box's size is the stylesheet's (.to-thumb, to-preview); these attributes make the drawing fill it.
 */
export declare const CROPPED = "preserveAspectRatio=\"xMidYMin slice\"";
/** Several pages as one tall one. */
export declare function stack(pages: Page[], gap?: number): Page;
/**
 * Words as a file name safe on every filesystem: letters and digits of any script, lowercased, joined by
 * hyphens; Latin letters lose their accents; nothing else, and never long.
 */
export declare function slug(s: string): string;
export declare const fileName: (title: string, fallback: string, ext: string) => string;
export declare const utf8: (s: string) => Uint8Array<ArrayBuffer>;
/** The lightest grey for words: 4.9:1 on white, which is enough to read. */
export declare const FAINT = "#6b7280";
export declare const LINE = "#d4d4d8";
export declare const SHADE = "#f4f4f5";
export declare const ACCENT = "#4f46e5";
export declare const r: (n: number) => string;
export declare const rect: (x: number, y: number, w: number, h: number, fill: string, extra?: string) => string;
/** Width of text in px, estimated: a page is drawn the same under node and in a browser. */
export declare const textWidth: (text: string, px: number, bold?: boolean) => number;
/** Width of code in px: every character of a monospace face is as wide, 0.6em in Plex Mono. */
export declare const monoWidth: (text: string, px: number) => number;
/** Cut text to fit a width, with an ellipsis. */
export declare function clip(text: string, max: number, px: number, bold?: boolean): string;
/**
 * Words wrapped to a width: the lines, broken between words; a word too long for a line (a web address,
 * say) is broken after a "/", ".", "-", "?", "&", "=" or "_" near the end of a piece, else where the line
 * runs out.
 */
export declare function wrapText(content: string, max: number, px: number, bold?: boolean): string[];
export interface TextStyle {
    px?: number;
    bold?: boolean;
    fill?: string;
    anchor?: 'start' | 'middle' | 'end';
}
/** One line of words. y is the baseline. */
export declare function text(x: number, y: number, content: string, style?: TextStyle): string;
/**
 * Colours in the order a series takes them: each a clear step from the last, whatever your eyes. Blue,
 * orange, green, purple and red are the Okabe–Ito colours, with lightness as well as hue between them.
 */
export declare const SERIES: string[];
/**
 * Something besides colour, for charts: a pattern to lay over each series after the first, so bars and
 * slices can be told apart in black and white. The patterns, as SVG defs, and the fill that uses one.
 */
export declare function patternDefs(id?: string): string;
export declare const patternFill: (i: number, id?: string) => string;
