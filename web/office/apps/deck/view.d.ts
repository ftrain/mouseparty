/**
 * A deck drawn, with no DOM: where everything on a slide goes and how big the type is so that it all fits
 * (the layout), the slide as a page in its theme, a printed page fitted the same way or as prose, a comic's
 * panels, and the pages laid on letter sheets so that folding puts them in order (the imposition). The
 * closing slide is a QR code of the deck's own link. The deck as a web page plays itself: one slide at a
 * time, with the transition the header names, by a fixed script the site's policy allows by hash.
 */
import { type Page } from '../../kit/core/app.ts';
import { type Doc, type Run } from '../../doc/index.ts';
import { type Format, type Settings, type Slide } from './model.ts';
import { type DeckTheme } from './theme.ts';
export declare const SW = 960;
export declare const SH = 600;
export declare const LETTER: {
    w: number;
    h: number;
};
/** A piece of a line: words with their marks, code, a link, a raised number (a footnote's mark), or an icon by name. */
export interface Span {
    t: string;
    b?: true;
    i?: true;
    u?: true;
    s?: true;
    h?: true;
    /** Code, in the monospace face. */
    c?: true;
    /** Where these words link. */
    link?: string;
    sup?: boolean;
    ic?: string;
}
/** Runs as spans: footnote marks as raised numbers, links (and web addresses in plain words) marked, icons by name. */
export declare function spansOf(runs: Run[], next?: () => number): Span[];
/** Spans wrapped to a width: words kept whole, marks kept on every piece, a note's mark staying with the word before it. */
export declare function wrap(spans: Span[], max: number, px: number, bold?: boolean): Span[][];
export declare const wrapText: (words: string, max: number, px: number, bold?: boolean) => string[];
export interface LineStyle {
    px?: number;
    bold?: boolean;
    fill?: string;
    /** Links, where the ink is not for them. */
    link?: string;
    anchor?: 'start' | 'middle' | 'end';
}
/** One line of spans as SVG text at a baseline: highlights behind the words, icons drawn as glyphs where their span sits. */
export declare function line(x: number, y: number, content: string | Span[], style?: LineStyle): string;
/** A page placed inside a box on another page, scaled to fit and centred. */
export declare function place(p: Page, x: number, y: number, w: number, h: number): string;
/** The page another document makes on a slide: its own app draws it small; a table is a sheet. `open`: in the editor (a locked document opened this visit drawn open). `still`: drawn where nothing can move (an animation a frame). */
export declare function subPage(doc: Doc, s: Slide, upTo?: number, open?: boolean, still?: boolean, thumb?: boolean, frame?: number): Page | null;
interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface SlideLayout {
    /** Font sizes chosen so everything fits: bigger when there is less to say. */
    titlePx: number;
    bodyPx: number;
    title: Box & {
        lines: Span[][];
        center: boolean;
    };
    cols: (Box & {
        items: {
            lines: Span[][];
            depth: number;
            n?: number;
            para?: boolean;
        }[];
    })[];
    icon?: Box;
    sub?: Box;
    /** The slide's footnotes, at its foot: each note's lines, and the size of their type. */
    notes?: Box & {
        lines: Span[][][];
        px: number;
    };
    /** What fitting cost (what the lint reads, src/lint.ts): a headline set at its smallest size, its lines cut off; words set at their smallest, and how far they still run past their box. */
    fit: Fitting;
}
export interface Fitting {
    title: {
        smallest: boolean;
        cut: number;
    };
    body: {
        smallest: boolean;
        over: number;
    };
}
/** The page a slide is laid on: a slide's 960 by 600 unless told otherwise; `loud` makes the type bigger (a poster). */
export interface SlideSize {
    w?: number;
    h?: number;
    loud?: number;
    /** A film's frame of the motion the slide holds (deckFrames). */
    frame?: number;
}
/** Where everything on a slide goes, and how big the type is. */
export declare function layoutSlide(s: Slide, o?: SlideSize): SlideLayout;
/** What a slide reveals, a click at a time: its lines of words; a slide that shows a document, that document's steps (given `doc`). */
export declare const slideSteps: (s: Slide, doc?: Doc) => number;
/** The look a slide is drawn in: the theme, the colour of its icons, whether it is drawn where nothing can move (print, a picture, a thumbnail: a document on it is drawn still), and whether as a thumbnail (the rail, a kept deck's preview: a trip on it asks OpenStreetMap for nothing, as kit/core/app.ts ViewOpts says of `thumb`). */
export interface Look {
    theme: DeckTheme;
    themed: boolean;
    icon: string;
    still?: boolean;
    thumb?: boolean;
}
export declare const lookOf: (s: Settings, still?: boolean, thumb?: boolean) => Look;
/**
 * A slide as a page. `shown` says how many lines have been revealed (absent: everything); unrevealed
 * lines keep their place, so nothing moves as the slide builds. The sub-document is drawn by its own app.
 */
export declare function slidePage(doc: Doc, s: Slide, look: Look, shown?: number, o?: SlideSize): Page;
export interface Fit {
    /** Centred and louder, as a cover is. */
    cover?: boolean;
    /** How much louder the type is than a slide's, for a page with a layout. */
    loud?: number;
    /** A line at the foot (a page number). */
    foot?: string;
    /** The largest the words may be, in px. */
    max?: number;
    /** The margin, in px. */
    m?: number;
}
/**
 * A slide fitted to a printed page: the largest type at which everything is on it. A page with a layout
 * is a slide laid on paper by the deck's engine, louder on a cover; a page with none is prose, its
 * paragraphs and bullets from the top; a page that shows another document is given over to it.
 */
export declare function fitted(doc: Doc, s: Slide, look: Look, w: number, h: number, o?: Fit): Page;
export declare const MAX_PANELS = 6;
/**
 * One side of a sheet: rows of page numbers (0 for an empty place), each page in its cell of an even
 * grid. Dotted lines are folds; `cut` adds a dashed line to cut along ([row, from column, to column],
 * below that row); `flip` lists the rows printed upside down.
 */
export declare function side(pages: Page[], rows: number[][], o?: {
    flip?: number[];
    cut?: [number, number, number];
    note?: string;
}): Page;
/** Sheets folded in half and nested, as a booklet is: page n beside page 1, and so on inward. */
export declare function saddle(pages: Page[]): Page[];
/** Cards cut from letter sheets: as many sheets as it takes, `cols` by `rows` on each, with lines to cut along. */
export declare function tile(cards: Page[], cols: number, rows: number, sheet?: {
    w: number;
    h: number;
}): Page[];
export interface Geometry {
    /** How many pages; with `grow`, how many to start with. */
    count: number;
    /** The most pages it can grow to. */
    grow?: number;
    /** How many pages it grows by: four (a sheet folded) unless said; one for cards. */
    by?: number;
    /** Offers one-sided and two-sided printing. */
    sides?: boolean;
    /** A page, in px at 96 to the inch. */
    size(two: boolean): {
        w: number;
        h: number;
    };
    /** What page i of n is called. */
    name(i: number, n: number): string;
    /** The pages laid on the sheets to print. */
    sheets(pages: Page[], two: boolean): Page[];
    /** Draws a page its own way; otherwise the words are fitted to it. */
    page?(doc: Doc, s: Slide, look: Look, i: number, n: number): Page;
    /** How to print and fold it. */
    how(two: boolean): string;
}
export declare const ZINE: Geometry;
export declare const BOOKLET: Geometry;
export declare const BROCHURE: Geometry;
export declare const COMIC: Geometry;
export declare const POSTER: Geometry;
export declare const BADGES: Geometry;
export declare const geometryOf: (format: Format) => Geometry | null;
/** How many pages a printed thing has: the format's count, grown by sheets (or cards) to hold what is written or what the header asks. */
export declare function pageCount(doc: Doc, s: Settings, written?: number): number;
/** The size of a page in the document's format, in px. */
export declare const pageSize: (s: Settings) => {
    w: number;
    h: number;
};
/** An empty slide past what is written, for a page the format has and the document has not filled yet. */
export declare const emptySlide: (at: number) => Slide;
/** Page i of the document, drawn in its format: a slide, or a printed page (its cover first; inside pages numbered). */
export declare function pageOf(doc: Doc, i: number, s?: Settings, slides?: Slide[], look?: Look): Page;
/** Every page of the document in its format (blank pages included, where the format has them); `still` where nothing can move. */
export declare function pagesOf(doc: Doc, s?: Settings, still?: boolean): Page[];
/** The sheets to print: the pages laid where the fold needs them; a deck's slides are their own sheets. */
export declare function sheetsOf(doc: Doc, s?: Settings, still?: boolean): Page[];
/**
 * The deck the room takes home: its slides as the Display Link, every speaker note cut (the quotes at each slide's
 * end are the speaker's, never the room's), where the host opens it (kit/core/host.ts: on the site it is shown from, else
 * the fragment alone), or on `site`; in the language the deck is shown in, when one was chosen.
 */
export declare function takeHomeLink(doc: Doc, site?: string, lang?: string | null): string;
/** Whether the deck ends with its code: not a printed thing, not an empty deck, not when the header says "qr: no". */
export declare const wantsClosing: (doc: Doc, s: Settings) => boolean;
/**
 * The deck ends with a slide that is a QR code of its slides, its title beneath: whoever is in the room can take
 * them home. Drawn, not written. None unless wanted (wantsClosing), or when the slides are too long for a code.
 */
export declare function closingPage(text: string, doc?: Doc, s?: Settings, look?: Look): Page | null;
/** The deck as shown and printed: every page in its format, then (for slides) the closing code. `still`: drawn where nothing can move (print, a picture, a thumbnail), so a document on a slide is too. */
export declare function deckPages(text: string, small?: boolean, still?: boolean, thumb?: boolean): Page[];
/**
 * How long a frame of the film holds, in milliseconds: a breath, then the words it brings at four a second, three
 * seconds at the least (a picture, a chart, a code take looking at) and ten at the most (Paul, 2026-10-14: "The GIF
 * export should be at a readable speed, it's very fast now"; it was a second and a half a frame).
 */
export declare const frameMs: (words: number) => number;
/**
 * The slides as they play, for a film: every slide, every reveal, the closing code last; each a still picture, held
 * for as long as its words take to read. A slide that holds an animation plays it once through, a frame a frame of
 * the film at the motion's own rate, before resting (Paul, 2026-10-14: "export animations as part of deck export").
 * The last frame holds LAST_MS.
 */
export declare function deckFrames(text: string): (Page & {
    ms: number;
})[];
/** The deck (or printed thing) as a page that plays itself: one page at a time, the transition the header names, the way home at the foot. */
export declare function deckToHtml(text: string, title: string, link?: string): string;
export {};
