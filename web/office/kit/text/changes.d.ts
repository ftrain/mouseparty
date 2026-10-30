/**
 * Tracked changes, for any host whose document is written by several people (docs/library.md, Tracked changes and
 * comments for a host): the host gives its versions in order, each with its author, and gets back who put in and who
 * took out each word, and who changed its formatting. Each version is compared with the one before it, block by block
 * (each block by its kind and its words) and, inside a block that changed, word by word. A word put in carries its
 * author and the change that put it in; a word taken out stays, carrying who took it out, so it can be drawn struck
 * through; a word someone put in and then took out again themself, before anyone reviewed it, is simply gone. A
 * change rejected stays in sight as a change of its own (its words struck through as rejected, or words taken out put
 * back as restored), for its author and everyone else to accept: the host says which changes were rejected, and which
 * reviewed, before each version.
 * Formatting is tracked as words are (Paul, 2026-10-16: "When I bold and change formatting you should track that as a
 * change"): a word whose marks change (bold, italic, underline, struck, highlighted, code, a link) and a block whose
 * kind or alignment changes, its words the same, carry who changed them and what they were, to be drawn, accepted or
 * put back; so does a field of the head (the title, the paper). The words are a block's text as the editor counts it
 * (an icon or a footnote mark one character, U+FFFC), so a token's place is a place in the editor (kit/text/text.ts
 * domPoint), where kit/text/redline.ts draws them. Pure: no DOM, nothing kept between calls.
 */
import { type Block, type Run } from '../../doc/index.ts';
export interface Tok {
    t: string;
    /** Who put it in: the version's author, as the host names people (an email). */
    ins?: string;
    /** Who took it out. */
    del?: string;
    /** The change that put it in, and the change that took it out (Change.id). */
    insId?: string;
    delId?: string;
    /** Taken out as a change was rejected (words someone else put in), or put back as one was (words someone else took out). */
    rejected?: true;
    restored?: true;
    /** Its marks, as one string (marksOf); and, its marks changed, who changed them, as which change, from what. */
    m?: string;
    fmt?: string;
    fmtId?: string;
    was?: string;
    /** A restyling beneath this one, made by someone else and still open: kept, so that each is seen and can be rejected. */
    under?: Under;
    /** Put back (`restored`): whose taking out it undid, and as which change, so that rejecting one or both is exact. */
    from?: {
        del: string;
        delId?: string;
        m?: string;
    };
}
/** A restyling with another made over it (a word's marks, a block's kind or look, a setting): who, which change, from what. */
export interface Under {
    fmt: string;
    fmtId: string;
    was?: string;
    wasKind?: string;
    wasLook?: string;
    rejected?: true;
    under?: Under;
}
/** A token's, a block's or a setting's restylings, the latest first, each with what it was and what it made. */
export declare function restylings(x: {
    fmt?: string;
    fmtId?: string;
    was?: string;
    wasKind?: string;
    wasLook?: string;
    rejected?: true;
    under?: Under;
}): Under[];
export interface Tracked {
    /** The block's kind ("p", "h2", "li0", "fence:sheet"): blocks of different kinds are different blocks. */
    kind: string;
    toks: Tok[];
    /** The whole block was put in, or taken out, by this person, as this change. */
    ins?: string;
    del?: string;
    insId?: string;
    delId?: string;
    /** Taken out as a change was rejected (a block someone else put in). */
    rejected?: true;
    /**
     * Put back whole where it was taken out (`ins` is who put it back, `insId` the change): whose taking out it undid, and
     * as which change. Its words keep their own changes.
     */
    restored?: true;
    from?: {
        del: string;
        delId?: string;
    };
    /** A restyling beneath this block's, by someone else, still open (Under). */
    under?: Under;
    /** A card (a table, another document, a rule): its source as written, and as it was before the changes open on it. */
    src?: string;
    wasSrc?: string;
    /** Everything about it but its kind and its words (lookOf): its look, beside its kind. */
    look?: string;
    /** Its kind or look changed, its words the same: by whom, as which change, from what. */
    fmt?: string;
    fmtId?: string;
    wasKind?: string;
    wasLook?: string;
}
/**
 * The marks a run carries, as one string: the letters of its marks in order, and its link after a ">" ("bi>https://…");
 * an icon or a footnote, what it is ("!ic:star", "!fn:the note's words"), so a note rewritten is a change too.
 */
export declare function marksOf(r: Run): string;
/** Words with the marks a string of marksOf's names (an icon or a footnote, itself). */
export declare function runOf(t: string, sig?: string): Run;
/**
 * Everything about a block but its kind and its words, as one string, so that any of it changed is a change: its id,
 * classes (alignment, the title, a rule) and attributes, a task's tick, a table's columns, a connection's direction and
 * label. Read back by lookTo, to put a block back as it was.
 */
export declare function lookOf(b: Block): string;
/** A block with another look (lookOf's string) put on it: its id, classes and attributes, tick, columns, direction. */
export declare function lookTo(b: Block, look: string): Block;
/** A block from its source as written (a card's, kept by the tracking): read after a line of words, so a rule ("---") is not taken for a head's opening. */
export declare const blockFrom: (src: string) => Block | undefined;
/** A block's kind, from kindOf's name, holding these runs. */
export declare function kindTo(b: Block, kind: string): Block;
/** A document as written, its head's fields in one order: a field's place among them is no part of what it says. */
export declare const same: (d: {
    head: Record<string, string>;
    blocks: Block[];
}) => string;
/** A head field (the document's title, paper, look…) tracked as an entry of its own: kind "head:<key>", its value its look. */
export declare const isHead: (b: Tracked) => boolean;
/** The entry that stands for changes no part of the tracking could say where they are: never empty-handed. */
export declare const OTHER = "head:~";
/** A block's words as the editor counts them. */
export declare function textOf(b: Block): string;
/**
 * Every version's blocks, tracked from the first given to the last: the head's fields first, each an entry of its
 * own, then the blocks. `rejectedBy(id, seq)`: whether a change had been rejected before the version numbered `seq` in
 * the host's log (Step's `seq`, its place in the list otherwise); `reviewedBy(id, seq)`: whether anyone had accepted or
 * rejected it by then (a change reviewed is closed: an edit beside it is a change of its own). Neither given, nothing
 * was.
 */
export declare function track(versions: readonly Step[], rejectedBy?: (id: string, seq: number) => boolean, reviewedBy?: (id: string, seq: number) => boolean): Tracked[];
/**
 * A version as the tracking reads it: who wrote it, its TLO text, its hash (which names its changes: "<hash>:0" is the
 * first change it made; its place in the list without one) and its place in the host's log, which `rejectedBy` and
 * `reviewedBy` are asked about.
 */
export interface Step {
    author: string;
    text: string;
    hash?: string;
    seq?: number;
}
/** The tracked blocks taken one version further: the `vi`th, `v`. (The words being typed and not yet saved are a version too.) */
export declare function trackOn(doc: readonly Tracked[], v: Step, vi: number, rejectedBy?: (id: string, seq: number) => boolean, reviewedBy?: (id: string, seq: number) => boolean, 
/** The version before, as written: to tell any difference the tracking did not otherwise find. */
prev?: string): Tracked[];
/** One person's change: words they put in, words they took out, or both at one place. */
export interface Change {
    id: string;
    author: string;
    /** The words put in, and taken out, as they read. */
    put: string;
    took: string;
    /** The words restyled, and how (styleDiff's "+b", "-i"; a block's "kind:p>h2", "look:>center"). */
    styled: string;
    styles: string[];
    /** An edit, a rejection of someone's words put in, words someone took out put back, or a restyling alone. */
    kind: 'edit' | 'rejection' | 'restore' | 'format';
}
/** Every change the tracked blocks hold, in the order they read. */
export declare function changesOf(doc: readonly Tracked[]): Change[];
