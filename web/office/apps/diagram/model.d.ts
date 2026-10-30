import { type Block, type Dir, type Doc, type Op, type Run } from '../../doc/index.ts';
export declare const KINDS: readonly ['mind', 'org', 'family', 'lanes', 'timeline', 'venn', 'seating', 'net'];
export type KindId = (typeof KINDS)[number];
/** The document's kind; a document that names none is a mind map. */
export declare const kindOf: (doc: Doc) => KindId;
/** Kinds that are a tree: an item's place is under its parent. */
export declare const isTree: (k: KindId) => k is "family" | "mind" | "org";
/** Kinds whose line holds a list of things after its key: the people at a table, the things in a set. */
export declare const isListed: (k: KindId) => k is "seating" | "venn";
/** Kinds whose things may be joined by a connection of their own: across a tree, or a network's every line. */
export declare const joins: (k: KindId) => k is "family" | "mind" | "net" | "org";
export declare const charsOf: (runs: Run[]) => string;
/** Which separators would be read as structure where a part's words go: a colon (a key), a comma (a list), an ampersand (sets). A bar always is. */
export interface Seps {
    colon?: boolean;
    comma?: boolean;
    amp?: boolean;
}
/** Whether a part of a line is shown with its second lines (a thing's own words, a step's), or is one line (a key, a thing of a list). */
export declare const hasLines: (which: Which) => which is "all" | "words";
/** Whether a part is a timeline's event whole: its date the first line, what happened the next. */
export declare const isDated: (kind: KindId, which: Which) => boolean;
/** The words of part `which` of line l, its characters [from, to), as they are typed: plain, a second line after a line break. */
export declare function wordsOn(kind: KindId, l: Line, which: Which, from: number, to: number): Run[];
/**
 * Words typed on part `which` of line l, as the line writes them: whatever would be read as a separator there
 * escaped (`sepsFor`), then a line break as " | " (a timeline's first as ": ", its date escaped as a key is); a
 * part of one line has its breaks as spaces.
 */
export declare function wordsInto(kind: KindId, l: Line, which: Which, runs: Run[]): Run[];
/** A stretch of a line: where it is (in the line editor's characters), its words as written and as drawn, and the icon in it. */
export interface Part {
    from: number;
    to: number;
    /** The words as the line writes them, escapes and all (a Venn's key is cut into its sets from these). */
    src: string;
    /** The plain words: escapes taken off, a second line (the line's " | ") after a line break. */
    words: string;
    icon: string;
}
/** The part of the line between from and to, its spaces trimmed off. */
export declare function partOf(runs: Run[], chars: string, from: number, to: number): Part;
/** A list item of the document, read as a line of a diagram. */
export interface Line {
    at: number;
    depth: number;
    runs: Run[];
    chars: string;
    /** The whole line. */
    all: Part;
    /** The words before the first ": ", or null for a line with none. */
    key: Part | null;
    /** The words after the key (the whole line when there is no key). */
    words: Part;
    /** The words after the key, cut at each comma: the things of a list. */
    items: Part[];
}
export declare function lineOf(b: Extract<Block, {
    k: 'li';
}>, at: number): Line;
/** Every list item of the document, as lines. */
export declare const linesOf: (doc: Doc) => Line[];
/** A connection between two things, by their names. */
export interface Edge {
    at: number;
    from: string;
    to: string;
    dir: Dir;
    label: string;
}
/** Every connection of the document, its ends read against its things. */
export declare function edgesOf(doc: Doc): Edge[];
/** Plain words as a label of Draw's (whose words are inline Markdown, " | " a second line): each line escaped, a plain bar too. */
export declare const asLabel: (words: string) => string;
/** A part as a shape's label: ":rocket Launch", the icon first (as Draw's shapes take it). */
export declare const labelOf: (p: Pick<Part, 'words' | 'icon'>) => string;
/** A name as it is compared: its words alone, its first line, in any case. */
export declare const same: (a: string, b: string) => boolean;
export declare const who: (s: string) => string;
/** A thing's name: its words' first line ("Name" of "Name | Role"). */
export declare const nameOf: (s: string) => string;
/** The sets a venn key names, plain: "Fast & Cheap" is two, "R\&D" one. */
export declare const setNames: (key: string) => string[];
/** Set names as a Venn line's key: "Fast & R\&D". */
export declare const setKey: (names: string[]) => string;
/** Which part of a line a shape shows: all of it, its key, its words after the key, or one thing of its list. */
export type Which = 'all' | 'key' | 'words' | number;
/** That part of the line, as it now is (null for a thing of the list that is no longer there). */
export declare const partFor: (l: Line, which: Which) => Part | null;
/**
 * What a shape of the picture was drawn from, so a tap there edits it: a line's words (or one thing of its
 * list, or its key), a lane by its name, a thing of a network that only its connections name, a connection.
 */
export type Hit = {
    k: 'line';
    at: number;
    part: Which;
} | {
    k: 'lane';
    name: string;
} | {
    k: 'node';
    name: string;
} | {
    k: 'edge';
    at: number;
};
/**
 * A thing about to be added: the line the editor opens on, and where it goes. `n` 0 puts the block in at
 * `at`; `n` 1 puts it in place of the line there (one thing more in a list). The editor puts it in at once
 * (`commitDraft`, one `splice`), its words offered at the caret and chosen, and opens them over the thing.
 */
export interface Draft {
    at: number;
    n: 0 | 1;
    block: Extract<Block, {
        k: 'li';
    }>;
    /** The caret, in the draft's characters. */
    sel: [number, number];
}
/** The draft made real: its block put in. */
export declare const commitDraft: (d: Draft, block: Block) => Op[];
/**
 * A tap on empty space, or Insert: a new thing. In a region (a lane, the circles of a Venn) it goes there;
 * a tree's goes under its first root; a table is numbered on from the last.
 */
export declare function newThing(doc: Doc, key?: string): Draft;
/** Enter on a thing: the next one like it. A tree's root gains a branch, a branch a sibling; a list one thing more; a lane its next step. */
export declare function nextThing(doc: Doc, hit: Hit): Draft | null;
/** One thing more under a tree's item (its last child), or in a line's list. */
export declare function childOf(doc: Doc, at: number): Draft;
/** The thing tapped, taken away: one thing of a list; a tree's item (its family comes out a level); a line; a lane and its steps; a thing of a network and its connections; a connection. */
export declare function removeThing(doc: Doc, hit: Hit): Op[];
/**
 * One thing of line `from`'s list moved into line `to`'s: after its thing `after`, or at the end. A line `to`
 * of -1 is a new line keyed `key` (a thing moved into an overlap no line names yet).
 */
export declare function moveItem(doc: Doc, from: number, item: number, to: number, after?: number, key?: string): Op[];
/** A thing dragged onto another: under it (a tree), after it and into its lane (a step), after it (an event), beside it (a person, a thing of a set), joined to it (a network). */
export declare function dropOn(doc: Doc, hit: Hit, onto: Hit): Op[];
/** A thing dragged into a region: a step into another lane; a thing of a set into the circles round where it was let go. */
export declare function dropIn(doc: Doc, hit: Hit, key: string): Op[];
/** A connection from one named thing to another: an arrow in a network, a plain line across a tree (dashed in a mind map, dotted in an org chart or a family). None to itself, none twice. */
export declare function connect(doc: Doc, from: string, to: string): Op[];
/** A connection's words, or its direction: the edge block replaced. */
export declare function setEdge(doc: Doc, at: number, patch: {
    label?: string;
    dir?: Dir;
}): Op[];
/**
 * After line `at` was typed in (`before` is the document as it was): whatever names the thing follows its new
 * name. An org chart's or a network's connections; the overlaps of a Venn that name the set.
 */
export declare function follow(before: Doc, after: Doc, at: number): Op[];
/**
 * A name typed where it is not one line's words: a lane (every step in it), a thing of a network that only
 * connections name (each of them), a connection's words.
 */
export declare function rename(doc: Doc, hit: Hit, old: string, now: string): Op[];
/** A picture on the thing: an icon at the start of its words, in place of the one there. */
export declare function withIcon(doc: Doc, hit: Hit, name: string): Op[];
/** A list left tidy once its editor closes: no empty things between commas, nothing after the last. */
export declare function tidy(doc: Doc, at: number): Op[];
/** The kind of diagram, as the head says it. */
export declare const setKind: (doc: Doc, kind: KindId) => Op[];
/** A thing as blocks, for the clipboard: a line (a tree's with its family, brought to the margin), one thing of a list as a line of its own, a lane's steps, a thing only connections name, a connection. */
export declare function thingBlocks(doc: Doc, hit: Hit): Block[];
/**
 * Blocks pasted at a thing (or, with none, where a new thing goes): words alone into a list after the thing of it
 * (a seat at a table, a thing of a set); else lines after the thing (a tree's after its family, at its level, or
 * under a root unless `beside`; a step into its lane), and any connections at the end, none twice. The ops, and the first thing pasted.
 */
export declare function pasteThings(doc: Doc, hit: Hit | null, blocks: Block[], beside?: boolean): {
    ops: Op[];
    hit: Hit | null;
};
/** Whether a thing can be duplicated: not a connection (never twice), not a thing of a network (one name is one thing). */
export declare const canDuplicate: (doc: Doc, hit: Hit) => boolean;
/** A copy of the thing, right after it. */
export declare const duplicateThing: (doc: Doc, hit: Hit) => {
    ops: Op[];
    hit: Hit | null;
};
/** The thing past its neighbour (by -1 up, 1 down): a line (a tree's with its family, among its siblings); one thing of a list past the one beside it. Null when it cannot go. */
export declare function moveThing(doc: Doc, hit: Hit, by: 1 | -1): {
    ops: Op[];
    hit: Hit;
} | null;
/** The thing into the lane above or below (a step), or to the table before or after (a seat): Mod+Alt+Left/Right. */
export declare function moveAcross(doc: Doc, hit: Hit, by: 1 | -1): {
    ops: Op[];
    hit: Hit;
} | null;
/**
 * Bring out (Shift+Tab): a tree's thing becomes a child of its grandparent, right after its parent, its whole
 * family a level shallower with it. Null for a root or a root's child: there is nowhere further out to go.
 */
export declare function promoteThing(doc: Doc, hit: Hit): {
    ops: Op[];
    hit: Hit;
} | null;
/** Indent (Tab): a tree's thing becomes the last child of the sibling before it, its family with it. Null for a first child or a root. */
export declare function demoteThing(doc: Doc, hit: Hit): {
    ops: Op[];
    hit: Hit;
} | null;
/**
 * The diagram as an outline: its list as the Outliner reads it, its connections as the outline's joins. In an org
 * chart or a family tree a person's role or years, "Ada Diaz | Chief executive", goes back into brackets after the
 * name, "Ada Diaz (Chief executive)", which is how the outline writes a person (outline/model.ts personOf); the
 * kind stays behind, the title comes (Paul, 2026-10-11: a mind map had no way back to the outline).
 */
export declare function diagramToOutline(doc: Doc): string;
