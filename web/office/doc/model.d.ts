/**
 * The document kernel's one model: a header of key: value fields and a
 * list of blocks. Every app draws a view of this and edits it with the
 * operations in ops.ts; TLO (tlo.ts) is its one serialisation. Text sits
 * in blocks as runs (words with their marks), a table as typed columns and
 * raw cells, and anything else as what it is: a rule, an edge, a fence
 * holding another document.
 */
/** The header: lowercase keys, string values (title, by, created; an app's own settings). */
export type Head = Record<string, string>;
/** A document: its header and its blocks. */
export interface Doc {
    head: Head;
    blocks: Block[];
}
/** What any block may end with: "{#id .cls key=value}". */
export interface Attrs {
    id?: string;
    cls?: string[];
    kv?: Record<string, string>;
}
/** An edge's direction. */
export type Dir = '->' | '<-' | '<->' | '--';
/** The eight kinds of block. */
export type Block = {
    k: 'h';
    level: 1 | 2 | 3 | 4 | 5 | 6;
    runs: Run[];
    a?: Attrs;
} | {
    k: 'p';
    runs: Run[];
    a?: Attrs;
} | {
    k: 'li';
    depth: number;
    ord?: true;
    done?: boolean;
    runs: Run[];
    a?: Attrs;
} | {
    k: 'quote';
    runs: Run[];
    a?: Attrs;
} | {
    k: 'hr';
    a?: Attrs;
} | {
    k: 'table';
    cols: Column[];
    rows: string[][];
    a?: Attrs;
} | {
    k: 'fence';
    lang: string;
    body: string;
    a?: Attrs;
} | {
    k: 'edge';
    from: string;
    to: string;
    dir: Dir;
    label?: string;
    a?: Attrs;
};
/** The four kinds that hold words: h, p, li, quote. */
export type TextBlock = Extract<Block, {
    runs: Run[];
}>;
/** The table kind, and the fence kind, on their own. */
export type TableBlock = Extract<Block, {
    k: 'table';
}>;
export type FenceBlock = Extract<Block, {
    k: 'fence';
}>;
/** Words with their marks. An icon or a footnote is a run of its own with no words (atomic: it counts as one character). */
export interface Run {
    t: string;
    b?: true;
    i?: true;
    u?: true;
    s?: true;
    /** Highlighted. */
    h?: true;
    /** Code: set in a monospace face, its words verbatim (a backtick span). */
    c?: true;
    /** Where these words link. */
    href?: string;
    /** An icon in the line, by name. */
    ic?: string;
    /** A footnote: the note's words as inline Markdown. */
    fn?: string;
}
/** What a table's column holds. */
export type ColType = 'text' | 'number' | 'money' | 'percent' | 'date' | 'time' | 'check' | 'url' | 'rich' | 'long' | 'icon' | 'name' | 'option';
/** A column of a table: its name and what it holds. */
export interface Column {
    name: string;
    type: ColType;
    /** A money column's currency: a symbol ("£") or an ISO 4217 code ("GBP"); none takes the document's, else "$". */
    currency?: string;
}
/** The words alone, marks and all taken away. */
export declare const plainText: (runs: Run[]) => string;
/** Whether a block holds words. */
export declare const isText: (b: Block) => b is TextBlock;
/** A run with no words of its own: an icon or a footnote mark. It counts as one character. */
export declare const isAtomic: (r: Run) => boolean;
/** Runs as the parser would give them: no empty run of words, and no two neighbours with the same marks. */
export declare function normalRuns(runs: Run[]): Run[];
/** Whether a block carries a class in its attributes. */
export declare const hasClass: (b: {
    a?: Attrs;
}, c: string) => boolean;
/** A key's value among a block's attributes, or undefined. */
export declare const attr: (b: {
    a?: Attrs;
}, k: string) => string | undefined;
/** Whether a block is a horizontal rule: a break with the class rule, drawn as a line and never starting a page or slide. */
export declare const isRule: (b: Block) => boolean;
/** A horizontal rule: the kernel's break marked rule, so the plain break keeps its meaning. */
export declare const rule: () => Block;
/** Whether a block is another document held in this one: a fence named for its app. */
export declare const isInnerDoc: (b: Block) => boolean;
/** The blocks between rules: a deck's slides, a booklet's pages. */
export declare function pages(blocks: Block[]): Block[][];
/** The blocks under each heading of a level: [heading, or null for what comes before, blocks]. */
export declare function sections(blocks: Block[], level: number): [Extract<Block, {
    k: 'h';
}> | null, Block[]][];
