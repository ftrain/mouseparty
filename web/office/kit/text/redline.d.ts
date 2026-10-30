/**
 * Tracked changes drawn over the text editor's words without touching them (docs/library.md, Tracked changes and
 * comments for a host), from what kit/text/changes.ts says of who did what. The words each person put in are
 * highlighted in that person's color, and the words they restyled underlined with dots in it, by the CSS Custom
 * Highlight API: a range over the editor's own text (kit/text/text.ts domPoint), so typing and the caret are as they
 * were. Among the words, as the editor's ghosts (kit/text/text.ts Ghost: drawn, never written, passed over by the
 * caret), each edit is bracketed in its author's color with a lozenge of their initials after the opening bracket, and
 * the words it took out stand in place, struck through; a paragraph taken out is a struck line of its own. A comment
 * is found by its words (its quote) wherever they are now, highlighted, and its place measured for a note beside them.
 *
 * The highlights are the page's, not the editor's (CSS.highlights is one registry for the document), so they are named
 * with a prefix a host may give (PREFIX, "tlo-by-": "tlo-by-0" for the first person's words, "tlo-by-fmt-0" for their
 * restyling, "tlo-by-comment" for the comments' words); the editors' stylesheet colors those of the default prefix
 * (src/styles/changes.css), and a host that gives its own colors them itself. Where the browser has no highlights,
 * nothing is painted and the ghosts are drawn all the same.
 */
import type { Block } from '../../doc/index.ts';
import type { Ghost, ToText } from './text.ts';
import { type Tracked } from './changes.ts';
/** The colors, by a person's place among the host's people (`order`): Okabe–Ito's, as the kit's charts take them. */
export declare const COLORS: string[];
/** The highlights' names begin with this unless a host gives its own (the header). */
export declare const PREFIX = "tlo-by-";
/**
 * The color of the place `i` among a host's people, light and dark: the first six COLORS', then as many more as there
 * are people, each a hue a golden angle on from the one before and at one of three depths in turn (so no two are near
 * in hue and depth both); each as near
 * its hue as words in it read on the paper at 4.5:1, darker in the light theme and lighter in the dark. Said with CSS's
 * `light-dark()`, which the page's `color-scheme` (the theme's) chooses between: a host draws with it where it would
 * draw with a color (`Drawing`'s `color`, a style's `--c`, a `color-mix()`).
 */
export declare function colorAt(i: number): string;
/**
 * A person's place among the colors: their place in the host's `order`; someone it does not name, a place past
 * everyone's that their name alone picks, so they are drawn in one color wherever they are drawn.
 */
export declare const slotOf: (who: string, order?: readonly string[]) => number;
/** A person's color: the color of their place (slotOf, colorAt). */
export declare const colorOf: (who: string, order?: readonly string[]) => string;
/**
 * What the drawing reads of the text editor: its blocks as drawn, a place in them as a point in its DOM, and each
 * block's element. A <to-text> is one (a mounted Word Processor's is wordsOf(editor)).
 */
export type Painted = Pick<ToText, 'model' | 'domPoint' | 'blockEls'>;
/** A mounted editor's words: the <to-text> that holds its whole document (the Word Processor's), or null. */
export declare const wordsOf: (editor: Element) => ToText | null;
/**
 * Each person's initials, by the string their versions name them with (Step's `author`, an email): the first letters
 * of their name's first and last words, more of the first where two would match; their email's, with no name.
 */
export declare function initialsOf(people: {
    email: string;
    name: string;
}[]): Map<string, string>;
/** The words' highlights taken away (paint's, under the same prefix). */
export declare function unpaint(prefix?: string): void;
/**
 * How the ghosts name and draw a person (by their versions' `author`): their color, initials and name, and whether
 * this reader has accepted an edit (a lozenge still waiting for them is filled); and the host's words, in its language.
 */
export interface Drawing {
    color(who: string): string;
    initials(who: string): string;
    name(who: string): string;
    accepted(ids: string[]): boolean;
    /** What a deleted word's ghost says on hover, given a name. */
    takenOutBy(name: string): string;
    /** What a card (a table, another document, a rule) changed says beside its lozenge. */
    cardChanged: string;
    /** What a lozenge says after the initials for a rejection and for words put back ("rejected", "restored"). */
    rejected: string;
    restored: string;
}
/**
 * Every edit drawn in the editor's words without being written there (kit/text/text.ts Ghost): an opening bracket in
 * its author's color, their lozenge right after it at the size of the words, the edit, and a closing bracket; the words
 * it took out in place, struck through in red; a paragraph taken out, a struck line of its own with its lozenge. A
 * lozenge's ghost is named "edit:" and its changes' ids, for the host to open, and says the words its edit covers
 * (`covers`), so the text editor finds it from the caret (Alt+Enter, "text-ghost"). A settled change is not drawn.
 */
export declare function ghostsOf(tracked: Tracked[], blocks: readonly Block[], settled: (id: string) => boolean, d: Drawing): Map<number, Ghost[]>;
/**
 * The words each person put in highlighted in their color, and the words they restyled underlined with dots in it:
 * over the editor's own text (CSS Custom Highlights), its ghosts already drawn (ghostsOf, given to showGhosts and
 * awaited), since a ghost drawn moves the text the ranges are in. `order` is the people, a person's color their place
 * in it (slotOf, colorAt), or the place itself for each person (a host that draws two people in one color says so);
 * a change `settled` is not painted. Each place's highlights are `<prefix><place>` and `<prefix>fmt-<place>`, and the
 * kit gives the page a rule for each it paints under the default prefix, in the place's color (a host that names its
 * own colors them itself).
 */
export declare function paint(text: Painted, tracked: Tracked[], order: readonly string[] | ((who: string) => number), settled?: (id: string) => boolean, prefix?: string): void;
/** Where a comment sits: the paragraph its words are in, measured from `frame`'s top. */
export interface Pinned {
    id: string;
    top: number;
}
/**
 * The comments' words found in the editor and highlighted, and where each comment's note goes (a post-it in the
 * margin beside them). A comment is kept as its words, its quote, and found by them as the words are now (the first
 * line of the quote, where it first reads; or, where the comment says where it was taken from, `block` and `offset`
 * as quoteAt gives them, there if they still read there, else where they read nearest it), so nothing about it moves
 * with an edit elsewhere. A comment whose words are no longer there is not pinned: the host lists it where it lists
 * the rest.
 */
export declare function pinComments(text: Painted, frame: HTMLElement, comments: {
    id: string;
    quote?: string;
    block?: number;
    offset?: number;
}[], prefix?: string): Pinned[];
/** The comments' highlight taken away. */
export declare const unpin: (prefix?: string) => undefined;
/** How a host draws who did what (drawChanges): what it settles, how it names and colors people, its highlights' prefix. */
export interface Redraw {
    /** A change drawn as plain words (accepted): Reviewed's `settled`. None, none is. */
    settled?: (id: string) => boolean;
    drawing: Drawing;
    /** The people in order, a person's color their place (paint's `order`), or each person's place. */
    order: readonly string[] | ((who: string) => number);
    prefix?: string;
}
/**
 * Who did what drawn over a mounted Word Processor's words, whole, as a host would otherwise write it: the words
 * drawn as they are now (their update awaited), the ghosts given and awaited, then the paint, which reads the text as
 * the ghosts left it; and then "text-redline" from the words, bubbling, so what is placed by the words (the margin's
 * notes: kit/ui/comments.ts) is placed again. One draw at a time over one editor: asked again while one is under way,
 * it draws once more after it, with what it was asked last. Resolves when what it was asked has been drawn.
 */
export declare function drawChanges(words: ToText, tracked: Tracked[], o: Redraw): Promise<void>;
