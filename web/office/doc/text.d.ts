/**
 * The text layer: a document as what it says, in the order it says it, for whoever cannot see its pages (a screen
 * reader on a Display Link), for whoever would rather read it reflowed (the Display Link's Text), for a web page made
 * of it (kit/file/exports.ts htmlOf) and for an agent (src/api.ts `text`, as Markdown). A small tree of nodes: headings,
 * paragraphs (runs with their marks and links), lists (nested, a task with its state), tables (the values a reader
 * sees, worked out), fences as written, a document held in this one, footnotes, and the breaks between pages or slides.
 *
 * textOf builds it from the blocks every text-shaped app shares (Word Processor, Outliner, Presentation Builder,
 * Spreadsheet, Calculator); an app whose model is spatial gives its own in the same shape (kit/core/app.ts
 * AppDef.text). A fence naming an app is another document: the host says how to read it (`inner`); with none, it is
 * its text as written. textMarkdown writes the nodes as Markdown through the kernel's own writer (TLO is Markdown),
 * so read back and written again it is the same bytes. Read-only: nothing here edits a document.
 */
import { type Doc, type Run } from './model.ts';
/** Words with their marks; a footnote's mark is its number (`t`), carrying the note's words as inline Markdown. */
export type TextRun = Omit<Run, 'ic' | 'fn'> & {
    note?: string;
};
/** A list item: its words, its state when it is a task, and the list under it. */
export interface TextItem {
    runs: TextRun[];
    done?: boolean;
    list?: TextList;
}
export interface TextList {
    k: 'list';
    ord: boolean;
    items: TextItem[];
}
/** One node of the text layer. */
export type TextNode = {
    k: 'h';
    level: 1 | 2 | 3 | 4;
    runs: TextRun[];
} | {
    k: 'p';
    runs: TextRun[];
} | {
    k: 'quote';
    runs: TextRun[];
} | TextList | {
    k: 'table';
    head: string[];
    rows: string[][];
} | {
    k: 'pre';
    lang: string;
    body: string;
}
/** Another document held in this one, by its app (its name), its title and its own nodes. */
 | {
    k: 'doc';
    app: string;
    title: string;
    nodes: TextNode[];
}
/** The footnotes, numbered from 1 as their marks are. */
 | {
    k: 'notes';
    notes: TextRun[][];
}
/** The next page or slide. */
 | {
    k: 'break';
};
export interface TextOptions {
    /** A fence naming an app, read as that app's document; undefined to leave it as written. */
    inner?: (lang: string, body: string) => TextNode | undefined;
}
/** The text layer of a document's blocks. */
export declare function textOf(doc: Doc, opts?: TextOptions): TextNode[];
/** The text layer as Markdown: what a document says, for an agent or a file; footnotes in the reference form other readers know. */
export declare const textMarkdown: (nodes: TextNode[]) => string;
/** How many words a reader hears and how many headings they can move between. */
export declare function textCounts(nodes: TextNode[]): {
    words: number;
    headings: number;
};
/** The words a reader hears, in order, one space between them: a footnote's mark and the notes left out (a preview's text: kit/share/card.ts). */
export declare function textWords(nodes: TextNode[]): string;
