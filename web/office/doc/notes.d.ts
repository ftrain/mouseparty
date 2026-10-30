/**
 * Footnotes, numbered lists and links, over runs: the helpers every drawing
 * of rich text shares. A footnote is written where its mark sits, as
 * ^[the note's words] (Pandoc's inline note): the note travels with its
 * sentence and is numbered by order of appearance when drawn. Its words are
 * rich text themselves (marks and links; no blocks). The parser folds
 * Markdown's reference form ([^id] with a "[^id]: the note" paragraph) into
 * the inline form; referenceNotes writes it back out, for other readers.
 */
import type { Block, Doc, Run } from './model.ts';
/** The notes some blocks hold, in order of appearance: each note's words, as inline Markdown. */
export declare const notesOf: (blocks: readonly (Block | {
    runs: Run[];
})[]) => string[];
/** A note's words as runs (a note inside a note is left out). */
export declare const noteRuns: (fn: string) => Run[];
/** Numbers notes as they come: each call is the next number. */
export declare const noteNumbers: (from?: number) => () => number;
/** Runs as they are drawn: a note's mark is its number, raised (`sup`), the numbers given by `next` (noteNumbers()). */
export declare const markNotes: (runs: Run[], next: () => number) => (Run & {
    sup?: boolean;
})[];
/**
 * A document's notes written the way Markdown's other readers know: "[^n]"
 * in the words and "[^n]: the note" paragraphs at the end. For export; the
 * document itself keeps the inline form. A document with no notes is itself.
 */
export declare function referenceNotes(doc: Doc): Doc;
/**
 * Numbers a document's ordered lists as they come, as `write` numbers them:
 * given each block in turn, it says an ordered item's number. An ordered
 * item counts on at its depth across deeper items; a bulleted item resets
 * the count at its depth and ends the lists deeper; anything else ends
 * them all.
 */
export declare function listNumbers(): (b: Block) => number | undefined;
/** An address as it may be written in a link: what would end it early is percent-encoded. */
export declare const linkTarget: (url: string) => string;
/** Whether an address may be a link's target at all. */
export declare const linkable: (url: string) => boolean;
/** A run's words in pieces, each a link or not: linked words are one link, and a web address in plain words is a link as it stands. */
export declare const runLinks: (r: Run) => {
    t: string;
    url?: string;
}[];
/** Web addresses in a piece of text. Nothing is stored for a link: an address in the text is a link wherever the text is shown. */
export declare function linkify(text: string): {
    t: string;
    url?: string;
}[];
