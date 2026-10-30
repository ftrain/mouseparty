export interface Searchable {
    id: string;
    title: string;
    app: string;
    folder: string;
    /** The document's text, a line each (its outline). */
    lines: string[];
    at: number;
}
/** A stretch of text, and whether it is a match. */
export type Seg = {
    t: string;
    hit: boolean;
};
export interface Found {
    id: string;
    score: number;
    title: Seg[];
    /** Up to two lines of the document that hold the words, each cut down to the part around them. */
    context: Seg[][];
}
/** Lower case, accents off, character for character, so a match's place in the folded text is its place in the text. */
export declare const fold: (s: string) => string;
/** The search as its terms: words, and phrases in quotes. */
export declare function termsOf(q: string): string[];
/** A text as stretches, the matches marked. */
export declare function marked(text: string, terms: string[]): Seg[];
export declare function search(docs: Searchable[], q: string): Found[];
/**
 * A document's text as lines to search, from the kernel: a line per block of words (marks left out), a
 * table's rows with their cells side by side, the lines of a document held inside it. The head's fields
 * other than the title (a calendar's zone, an invoice's "to") are lines too.
 */
export declare function linesOf(text: string): string[];
/**
 * Whether what is typed starts any of these texts, or a word in one (case and accents aside): the drawer's one search
 * (kit/ui/drawer.ts), the same for an app, a document, a template and a command. `q` is folded and trimmed already.
 */
export declare const startsAWord: (q: string, ...texts: string[]) => boolean;
