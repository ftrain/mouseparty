/**
 * The Deck's reading of a document, with no DOM in it. A deck is TLO, a slide between each "---" and the
 * next (docs/kernel.md §1, §3):
 *
 *   ## :rocket: Headline {.title}    the icon, the headline, and the layout: .title, .two or .icon
 *   - A bullet                       the words: items are bullets, paragraphs are prose
 *     - Under it
 *   |                                on a two-column slide, where the right column starts
 *   ```sheet                         another document shown on the slide (or a table)
 *   > Say this first                 speaker notes, never on the slide
 *
 * The header holds the deck's settings: "theme: midnight", "transition: cut", "color: red" (every icon),
 * "qr: no" (no closing QR slide), and "format: zine" — a printed thing (zine, booklet, brochure, comic,
 * poster, badges) is a deck whose pages have another geometry (view.ts); its header may add "sides: 2"
 * and "pages: 12". A slide records its block span, so the editor puts <to-text> straight over the blocks
 * and every command here is a list of the kernel's operations.
 */
import { type Block, type Doc, type Op, type Run } from '../../doc/index.ts';
/** '' bullets (words as written: items dotted, paragraphs plain), 't' title, '2' two columns, 'i' big icon. */
export type Layout = '' | 't' | '2' | 'i';
export declare const LAYOUTS: {
    id: Layout;
    name: () => string;
}[];
/** How one slide gives way to the next. '' is the default, a fade. */
export type Transition = '' | 'cut' | 'slide' | 'zoom';
export declare const TRANSITIONS: {
    id: Transition;
    name: () => string;
}[];
/** The printed things a deck can be: the head's "format:"; '' is a deck of slides. */
export type Format = '' | 'zine' | 'booklet' | 'brochure' | 'comic' | 'poster' | 'badges';
export declare const FORMATS: {
    id: Format;
    name: () => string;
}[];
/** One line of words on a slide: a bullet at a depth (numbered when its list is), or a paragraph. */
export interface Item {
    runs: Run[];
    depth: number;
    /** Its number in an ordered list. */
    n?: number;
    /** A paragraph: drawn without a dot. */
    para?: boolean;
}
/** A slide as read from its blocks: what to draw, and where each part sits in the document. */
export interface Slide {
    /** The slide's blocks, [from, to) in the document (the rules are not in it). */
    from: number;
    to: number;
    /** The headline block, -1 when the slide has none. */
    head: number;
    layout: Layout;
    /** The headline's icon, by name ('' for none): a leading icon run of the headline. */
    icon: string;
    /** The headline's words, the icon left off. */
    title: Run[];
    /** The blocks the words editor owns: from the headline to the notes or the end. */
    words: [number, number];
    /** The "|" paragraph that starts the right column, -1 when there is none. */
    pipe: number;
    items: Item[];
    right: Item[];
    /** The block that is a document shown on the slide (a fence named for an app, a table), -1 for none. */
    sub: number;
    /** The speaker notes: the quote blocks at the slide's end, [from, to). */
    notes: [number, number];
    /** The notes' lines, plain. */
    noteLines: string[];
}
/** The settings a deck keeps in its header. */
export interface Settings {
    theme: string;
    transition: Transition;
    /** A key of ICON_COLORS, or '' for the theme's accent. */
    color: string;
    qr: boolean;
    format: Format;
    /** Two-sided printing, where the format offers it. */
    two: boolean;
    /** How many pages the header asks for, 0 for the format's own count. */
    pages: number;
}
/** The headline's runs from an icon and words. */
export declare const joinHeadline: (icon: string, title: Run[]) => Run[];
/** The slides a document's blocks make, a slide between rules, each with its span. A document with no blocks is one blank slide. */
export declare function slidesOf(doc: Doc): Slide[];
/** Nothing written on it, nothing shown on it. */
export declare const isBlank: (s: Slide) => boolean;
/** The footnotes a slide holds, in the order their marks are drawn: the headline's, then the words', column by column. */
export declare const slideNotes: (s: Slide) => string[];
/** How a slide's words are spoken or listed: the headline, then each line. */
export declare const slideText: (s: Slide) => string[];
export declare function settingsOf(doc: Doc): Settings;
/** The colour icons are drawn: the one chosen, or the theme's accent. */
export declare const iconHex: (s: Pick<Settings, 'theme' | 'color'>) => string;
/** A header field set, or removed when the value is the default (so an untouched deck costs nothing). */
export declare const setHead: (key: string, value: string) => Op[];
/** The deck's name: the head's title, else the first headline's words, else nothing. */
export declare function titleOf(text: string): string;
export declare const retitle: (text: string, title: string) => string;
/** A new slide after slide `after` (-1: before the first), of a layout; the index it will have. */
export declare function addSlide(doc: Doc, after: number, layout?: Layout, blocks?: Block[]): {
    ops: Op[];
    at: number;
};
/** Slides i to j taken out, with the rules beside them; every slide taken is all of them emptied instead. */
export declare function removeSlide(doc: Doc, i: number, j?: number): Op[];
/** The blocks of slides i to j, the rules between them kept: what a copy of them holds. */
export declare const slideBlocks: (doc: Doc, i: number, j?: number) => Block[];
/** Slides i to j again, right after j; the index the first copy will have. */
export declare function duplicateSlides(doc: Doc, i: number, j?: number): {
    ops: Op[];
    at: number;
};
/** Slide i moved to be slide j: the slides between re-laid, every block the same object (the editor redraws nothing). */
export declare function moveSlide(doc: Doc, i: number, j: number): Op[];
/** The slide given a layout: the class on its headline; two columns puts a "|" among the words (and leaving them takes it out). */
export declare function setLayout(doc: Doc, s: Slide, layout: Layout): Op[];
/** The slide's icon: the headline's leading icon run, set or taken away. */
export declare const setIcon: (doc: Doc, s: Slide, icon: string) => Op[];
/** Another document on the slide: the block put in place of the one there, or after the words. */
export declare function setSub(s: Slide, block: Block | null): Op[];
/**
 * Markdown as a person or a model loosely writes it: with no rules between them, each heading starts a
 * slide. A "# Title" above "##" headings is the title slide.
 */
export declare function loosen(doc: Doc): Doc;
/** A comic's panel: its picture, what is said, and the caption, written as a bullet ":dog: Walk? | Monday, noon." */
export interface Panel {
    glyph: string;
    said: string;
    caption: string;
}
export declare function panelOf(item: Item): Panel;
