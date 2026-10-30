/**
 * An outline as a view of the document, and its commands as operations. The document is the kernel's: a
 * nested list, the first level its roots, with two more kinds of block:
 *
 *   - Launch
 *     - Product {.from label="sets"}
 *       - Pricing
 *     - Marketing
 *   ```sheet {depth=1}
 *   ...
 *   ```
 *   ~ Pricing -> Marketing: feeds
 *
 * An item's words are rich text. An item may say how it joins its parent: {.from} an arrow from the parent,
 * {.to} an arrow to it, {.both}, and label="..." names the line. Another document under an item is a fence
 * that says its depth. Edges ("~ A -> B: name") join any two items by their plain words.
 *
 * Read leniently: a text of headings and paragraphs reads as a tree too (a heading is an item with what
 * follows nested beneath it; `listify` is the one splice that makes such a text an outline). Every command
 * is pure: the document and what to do in, the ops out. The family helpers are the kernel's (family,
 * shiftFamily, moveFamily, placeFamily, removeItem, splitBlock); the rest are splices of one block, and
 * `text` ops come from the row's editor.
 */
import { type Attrs, type Block, type Dir, type Doc, type Op, type Run } from '../../doc/index.ts';
import type { TextBlock as PdfBlock } from '../../kit/file/textpdf.ts';
export type { Dir };
export interface Item {
    /** Where the item's block sits in the document. */
    at: number;
    depth: number;
    /** The words; none for a document. */
    runs: Run[];
    /** Another document under this item, as a ref: "<app>\n<its text>". */
    doc?: string;
    /** The line to the parent: '->' from the parent to this, '<-' back to it, '<->' both; absent, a plain line. */
    dir?: Dir;
    /** The line to the parent: its name. */
    label?: string;
    /** Numbered: the item counts in a numbered list with its siblings. */
    ord?: true;
    /** Folded shut, its family hidden: `{.shut}` (Paul, 2026-10-15: "the data model should track which nodes are open or shut, default is open"). */
    shut?: true;
    /** One of the document's statuses (statusesOf), `{status=DOING}`. */
    status?: string;
    /** When it is due, `{due=2026-10-20}`, a day as the Calendar writes one. */
    due?: string;
}
/**
 * A status of the document's own set, written once in its head (Paul, 2026-10-15: "settable statuses (one set per doc)
 * like TODO, DOING, DONE (green, yellow red), a checkbox, and a date field"): `statuses: TODO=red, DOING=yellow,
 * DONE=green`, a name and a color each, in the order a tap goes through them; the last is the done one, which a task's
 * box and the status keep together (setStatus, tick). A document with no `statuses:` line shows none.
 */
export interface Status {
    name: string;
    /** The pill's color, a hex. */
    color: string;
    /** The color's word, as the head writes it (a key of STATUS_COLORS). */
    word: string;
}
/** The colors a status may name (the Calendar's words, with yellow and gray); an unknown word is gray. */
export declare const STATUS_COLORS: Record<string, string>;
/** What Insert ▾'s Statuses writes when the document has none. */
export declare const DEFAULT_STATUSES = "TODO=red, DOING=yellow, DONE=green";
export declare function statusesOf(doc: Doc): Status[];
/**
 * The outline as a Calendar (View as ▾ Calendar; Paul, 2026-10-15): every item with a due day is a day's event in
 * its words, colored by its status, the statuses the legend; the rest of the outline is not a date and stays behind.
 */
export declare function outlineToCal(v: OutlineView, head?: Doc['head']): string;
/** The head's line for a set of statuses: `TODO=red, DOING=yellow`. */
export declare const writeStatuses: (list: {
    name: string;
    word: string;
}[]) => string;
/**
 * The set edited (Paul, 2026-10-15: "Can I edit statuses"): the head's line rewritten (taken away when the set is
 * empty), an item whose status was renamed (`was`, its name before) follows the new name, and one whose status is in
 * the set no more loses it; a task's box is left as it is. Empty and repeated names are dropped.
 */
export declare function applyStatuses(doc: Doc, v: OutlineView, next: {
    name: string;
    word: string;
    was?: string;
}[]): Op[];
/** The due date a new one starts from: the nearest item above with a day still to come, else today (Paul: "defaulting to today or the most recently set future date above"). */
export declare function defaultDue(v: OutlineView, i: number, today?: string): string;
/** The class that folds an item shut in the document: `{.shut}`; without it an item is open. */
export declare const SHUT = "shut";
/** The item folded shut or open, written as its class, so the link, an undo and a reader all have it. */
export declare function setShut(doc: Doc, at: number, shut: boolean): Op[];
/** Every item with a family folded shut, or every one opened. */
export declare const setShutAll: (doc: Doc, v: OutlineView, shut: boolean) => Op[];
/**
 * The item's status set (undefined: none). A status brings the task's box with it (the compound bullet, Paul, 2026-10-15:
 * "We lost the checkbox"): an item given a status is a task, checked when the status is the last, unchecked otherwise;
 * a task's box follows a change the same way. The box stays when the status is taken away.
 */
export declare function setStatus(doc: Doc, at: number, name: string | undefined, statuses?: Status[]): Op[];
/** The item's due day set (undefined: none). */
export declare function setDue(doc: Doc, at: number, due: string | undefined): Op[];
/** The item a task (an unchecked box), or no task. */
export declare function makeTask(doc: Doc, at: number, on: boolean): Op[];
/** A task's box checked or unchecked; with statuses, the status follows: checked is the last, unchecked from the last is the first. */
export declare function tick(doc: Doc, at: number, statuses?: Status[]): Op[];
/** After a task's box was checked or unchecked by the words' own editor: the status follows (tick's rule), as ops on `doc` as it is now. */
export declare function followTick(doc: Doc, at: number, statuses?: Status[]): Op[];
/** A connection between any two items, named by their plain words. */
export interface Link {
    at: number;
    from: string;
    to: string;
    dir: Dir;
    label?: string;
    /** Whether both ends name an item of the outline. */
    live: boolean;
}
export interface OutlineView {
    items: Item[];
    links: Link[];
    /** Each block's depth as an item (-1 for one that nests nothing), for the kernel's family helpers. */
    depths: number[];
    /** The document holds words that are not yet items (headings, paragraphs): `listify` makes them so. */
    loose: boolean;
}
/** An item's name, as edges name it: its plain words. */
export declare const nameOf: (runs: Run[]) => string;
/** The tree in a document, and the edges between its items. */
export declare function readOutline(doc: Doc): OutlineView;
/** A list item with these words at this depth, its line to the parent as attributes. */
export declare function itemBlock(depth: number, runs: Run[], dir?: Dir, label?: string, a?: Attrs, ord?: boolean, done?: boolean): Block;
/** A fence holding another document under an item, saying its depth. */
export declare const docBlock: (depth: number, ref: string) => Block;
/** The one splice that makes loose words an outline: headings and paragraphs become items (a paragraph's lines each one), edges go last. Nothing for an outline already. */
export declare function listify(doc: Doc): Op[];
/** Item i's parent (an index into items), or -1. */
export declare function parentOf(items: Item[], i: number): number;
/** Where item i's family ends (an index into items): the first later item no deeper than it. */
export declare function familyEnd(items: Item[], i: number): number;
export declare const hasChildren: (items: Item[], i: number) => boolean;
/** The item whose block is at `at`, as an index into items; -1 for none. */
export declare const indexAt: (v: OutlineView, at: number) => number;
/** Where the items end and the edges begin: where a new item goes. */
export declare const itemsEnd: (doc: Doc, v: OutlineView) => number;
/** Indent (by 1) or bring out (by -1) the item at `at` with its family. */
export declare const shiftItem: (doc: Doc, v: OutlineView, at: number, by: 1 | -1) => Op[] | null;
/** Move the item at `at` with its family past the family before or after it at its level. */
export declare const moveItem: (doc: Doc, v: OutlineView, at: number, by: 1 | -1) => Op[] | null;
/** Put the item at `at` with its family under the item at `to` (its last child) or right after `to`'s family. */
export declare const placeItem: (doc: Doc, v: OutlineView, at: number, to: number, how: 'under' | 'after') => Op[] | null;
/** Take the item at `at` away; its family comes out a level. */
export declare const removeAt: (doc: Doc, v: OutlineView, at: number) => Op[];
/** Where an edit leaves the caret: a row's block and the offset in its words. */
export interface Landing {
    ops: Op[];
    at: number;
    offset: number;
}
/**
 * Enter in the row at `at` with the caret at `offset`. At the start of words, an empty item goes in before the row at
 * its depth and the words move down with the caret (the row pushed down). At the end (or on an empty row), a new item:
 * the first child when the row's children are showing, else a sibling after its family. In the middle, the words
 * after the caret go to that new item, in the same place. A numbered row's new sibling is numbered too.
 */
export declare function enterAt(doc: Doc, v: OutlineView, at: number, offset?: number, folded?: boolean): Landing;
/** Backspace at the start of words: the row's words joined to the item before it in the document, the caret at the join. Nothing when that item is a document, or there is none. */
export declare function joinBack(doc: Doc, v: OutlineView, at: number): Landing | null;
/** Delete at the end of words: the next item in the document joined into this row, the caret where it was. Nothing when the next is a document, or there is none. */
export declare function joinForward(doc: Doc, v: OutlineView, at: number): Landing | null;
/** Where block `i` is after these ops: moved with its block, shifted past a splice; -1 when a splice took it (a splice that puts back as many blocks as it took keeps every place). What folds and the zoom are kept by. */
export declare function mapAt(ops: Op[], i: number): number;
/** The blocks some chosen rows cover, [from, to). */
export interface Span {
    from: number;
    to: number;
}
/** The span chosen rows cover: from the first row's block to the end of the furthest family among them (hidden children too); to the end of the document, joins and all, when it holds every item. */
export declare function spanOf(doc: Doc, v: OutlineView, rows: number[]): Span | null;
/** The items of a span whose parent is outside it: the span's top rows. */
export declare function topsOf(v: OutlineView, s: Span): Item[];
/** The span taken away: one splice. */
export declare const removeSpan: (s: Span) => Op[];
/**
 * Every item of the span a level in (1) or out (-1): one splice. In needs the first row to have a sibling before it;
 * out needs every item to stay at `floor` or deeper (the zoom's first level).
 */
export declare function shiftSpan(doc: Doc, v: OutlineView, s: Span, by: 1 | -1, floor?: number): Op[] | null;
/** The span moved past the family before it (-1) or after it (1) at its first row's level: one move. */
export declare function moveSpan(doc: Doc, v: OutlineView, s: Span, by: 1 | -1): Op[] | null;
/** The span's items again, right after it (the joins stay where they are): one splice; the copy starts at `at`. */
export declare function duplicateSpan(doc: Doc, v: OutlineView, s: Span): {
    ops: Op[];
    at: number;
};
/** The span's blocks as a clipboard holds them: the shallowest item at the margin. */
export declare function copySpan(doc: Doc, v: OutlineView, s: Span): Block[];
/** Pasted text as blocks: TLO (and so Markdown); plain lines are a paragraph's lines, each an item once listified. */
export declare const pasteText: (text: string) => Block[];
/** Whether a paste into a row is items rather than words: more than one line, or a line that is a list item. */
export declare function pastesAsItems(text: string): boolean;
/**
 * Blocks pasted into the outline: loose words listified, the items rebased to the target's depth, the joins to the
 * end. The target: a span, replaced (at its first row's depth); a row, after its family at its depth (an empty row is
 * replaced); none, the end. Says where the pasted items sit.
 */
export declare function pasteBlocks(doc: Doc, v: OutlineView, blocks: Block[], target: Span | number | null): {
    ops: Op[];
    from: number;
    to: number;
} | null;
/** The list an item belongs to: the items at its depth under its parent (documents aside). */
export declare function siblingsOf(v: OutlineView, at: number): number[];
/** These items numbered (or not): a splice for each list item that changes. */
export declare function setOrdered(doc: Doc, ats: number[], on: boolean): Op[];
/** An empty item at the end of the outline, at this depth. */
export declare function appendItem(doc: Doc, v: OutlineView, depth?: number): {
    ops: Op[];
    at: number;
};
/** The item's line to its parent: its kind and its name, as the item's attributes. */
export declare function setLine(doc: Doc, v: OutlineView, at: number, line: {
    dir?: Dir;
    label?: string;
}): Op[];
/** A document under the item at `after` (or at the end): a fence saying its depth, after the item's family. */
export declare function insertDoc(doc: Doc, v: OutlineView, after: number, ref: string): {
    ops: Op[];
    at: number;
};
/** The document under an item replaced by another text of the same app. */
export declare function setDoc(doc: Doc, at: number, ref: string): Op[];
/** A join between two items, by their words; nothing when they are the same item or already joined. */
export declare function connect(doc: Doc, v: OutlineView, from: number, to: number): Op[];
/** A join's kind or name changed. */
export declare function setLink(doc: Doc, at: number, patch: {
    dir?: Dir;
    label?: string;
}): Op[];
/** A join taken away. */
export declare const unlink: (doc: Doc, at: number) => Op[];
/** Joins name items by their words, so they follow a renamed item: the edges that named `was` now name `now` (when no other item still has the old name). */
export declare function renameIn(doc: Doc, v: OutlineView, was: string, now: string): Op[];
/** The items that say something: words, or a document. */
export declare const liveItems: (v: OutlineView) => Item[];
/** The joins whose two ends are items of the outline. */
export declare const liveLinks: (v: OutlineView) => Link[];
/** What an item holds in words, for a card or a listing: the app's name and the first line of the document. */
export declare function docGist(ref: string): {
    app: string;
    gist: string;
};
/**
 * An item's words with each footnote's mark written as "[k]" (k counting the item's own notes from 1), and the notes'
 * words in that order (inline Markdown, as the document keeps them). The files put each note right under its item, as
 * the first of its children, so the note travels with the idea it is about.
 */
export declare function notesApart(runs: Run[]): {
    runs: Run[];
    notes: string[];
};
/**
 * The document for Markdown: each item's notes made numbered items right under it, first among its children ("1. the
 * note", numbered as the outline's writer numbers a list), the marks in its words "[1]"; any other note (on a heading
 * or a paragraph) in Markdown's reference form at the end. The document itself keeps the inline form.
 */
export declare function notesAsItems(doc: Doc): Doc;
/**
 * The outline as plain text: an item a line, "- " before it, "1. " and on for a numbered one, two spaces a level, a
 * document under an item as "- [App] its first line". Empty items are left out. An item's footnotes are lines right
 * under it, numbered "1. ", "2. " (the marks in its words "[1]", "[2]"). `appName` says an app's name.
 */
export declare function outlineText(v: OutlineView, appName?: (id: string) => string): string;
/**
 * The outline as a deck: every item with something under it is a slide, its
 * words the headline and the level just under it the bullets (deeper levels
 * have slides of their own), walked in order to the last leaf; an item that
 * is a document is a slide showing that document. A lone root is the title
 * slide.
 */
export declare function outlineToDeck(v: OutlineView, head?: Doc['head']): string;
/**
 * The outline as a network: every line to a parent and every join, as edges,
 * and an item with no line at all as a node on its own. Items are named by
 * their plain words.
 */
export declare function outlineToNet(v: OutlineView, head?: Doc['head']): string;
/** A person as an org chart or a family tree writes one: "Ana Ruiz (head baker)" here is "Ana Ruiz | head baker" there, the name over the role or the years. */
export declare function personOf(words: string): {
    name: string;
    what?: string;
};
/** The outline as an org chart: its people nested, each join a dotted line. */
export declare const outlineToOrg: (v: OutlineView, head?: Doc['head']) => string;
/** The outline as a family tree: the generations nested, "Rose Hale (born 1926)" a name over its years. */
export declare const outlineToFamily: (v: OutlineView, head?: Doc['head']) => string;
/** The outline as a mind map: the plain tree, each join a cross-link as it was (its kind of line and its words). */
export declare function outlineToMind(v: OutlineView, head?: Doc['head']): string;
/**
 * The outline as OPML, what every outliner reads. A document is named by its app. An item's footnotes are outlines
 * right under it, first among its children, each its mark and its words ("[1] the note"); the marks stay in its words.
 */
export declare function toOpml(v: OutlineView, title: string): string;
/**
 * The outline as the text PDF lays it out (kit/file/textpdf.ts): a lone top item is the title and its children
 * the sections; otherwise the document's title heads it and the top items are the sections. Deeper items are
 * bullets; an item holding a document is that document's app and first line, in brackets; the notes follow,
 * numbered as their marks came.
 */
export declare function outlineBlocks(v: OutlineView, docTitle?: string, notesHeading?: string): PdfBlock[];
