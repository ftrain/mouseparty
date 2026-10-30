/**
 * Write's reading of a document, with no DOM in it: the paper it prints on, its name, its own head fields
 * (an invoice's from and to), the word count, a table block as the sheet's renderer and the inline grid
 * see it, and the few commands that are not the editor's own (a cell typed into, a row or a column put in or
 * taken out, a card moved, copied or taken out). The view
 * Write draws is the Doc itself (docs/kernel.md §3); nothing is kept but the document.
 */
import { type Block, type Cells, type ColType, type Doc, type Op, type TableBlock } from '../../doc/index.ts';
import type { SheetView } from '../sheet/model.ts';
/** The paper a text prints on: its size in px (96 to the inch) and its margin, an inch or 25 mm. */
export declare const PAPERS: {
    readonly letter: {
        readonly name: 'Letter';
        readonly w: 816;
        readonly h: 1056;
        readonly m: 96;
    };
    readonly a4: {
        readonly name: 'A4';
        readonly w: 794;
        readonly h: 1123;
        readonly m: 94;
    };
};
export type Paper = keyof typeof PAPERS;
/** The paper where the reader is: letter in North America, A4 nearly everywhere else (and where there is no reader: a program). */
export declare const defaultPaper: () => Paper;
/** The paper the text says, in its header ("paper: a4"), or the reader's. */
export declare const paperOf: (doc: Doc) => Paper;
/** The head's fields that are the shell's or Write's own (the paper, the look), not the document's (an invoice's from, to, number…). */
export declare const SHELL_KEYS: Set<string>;
/** The document's own head fields, in order: what an invoice says above its lines. */
export declare const fieldsOf: (doc: Doc) => [string, string][];
/** The heading that is the document's title: a level-1 heading with the class title. */
export declare const titleBlock: (doc: Doc) => Extract<Block, {
    k: 'h';
}> | undefined;
/** The document's name: the head's title, else its title heading's words, else nothing. */
export declare function titleOf(text: string): string;
/** The document with this name: one head op, written back (the shell's one mechanism for every app). */
export declare const retitle: (text: string, title: string) => string;
/** How many words the text holds: its blocks of words and its footnotes. */
export declare function wordCount(doc: Doc): number;
/** A table block as the sheet's renderer and the grid see it: its columns, the values worked out in place. */
export declare function tableView(doc: Doc, at: number): SheetView | null;
/** A new table to type into: three columns that go by their letters, no rows yet. */
export declare const blankTable: () => TableBlock;
/** One cell of the table at `at` typed into: the table given the rows it needs, trailing blank rows never kept. A locked cell is left as it is (the op's own rule). */
export declare function setCellAt(doc: Doc, at: number, r: number, c: number, raw: string): Op[];
/** `n` blank rows put in before row r of the table at `at` (inside a sum's reach, the sum takes them in). */
export declare const tableRowsIn: (doc: Doc, at: number, r: number, n?: number) => Op[];
/** Rows r0 to r1 of the table at `at` taken out. */
export declare const tableRowsOut: (doc: Doc, at: number, r0: number, r1: number) => Op[];
/** A column put in before column c of the table at `at` (after the last when c is its width); nothing past Z. */
export declare const tableColIn: (doc: Doc, at: number, c: number) => Op[];
/** A rectangle of cells written into the table at `at` (a paste, a fill, a clear), the columns it needs added, trailing blank rows never kept. */
export declare const tablePut: (doc: Doc, at: number, cells: Cells) => Op[];
/** Column c of the table at `at` named; '' gives it its letter back. */
export declare const tableRename: (doc: Doc, at: number, c: number, name: string) => Op[];
/** What column c of the table at `at` holds; a money column may name its currency ('' or none: the head's `currency:`). */
export declare const tableSetType: (doc: Doc, at: number, c: number, type: ColType, currency?: string) => Op[];
/** Column c of the table at `at` taken out with what it holds (a table keeps one); the columns that go by a letter take their new one. */
export declare function tableColOut(doc: Doc, at: number, c: number): Op[];
/** The block at `at` moved past its neighbour (up by -1, down by 1); null at either end. */
export declare function moveBlock(doc: Doc, at: number, by: 1 | -1): Op[] | null;
/** A copy of the block at `at` put in after it. */
export declare const duplicateBlock: (doc: Doc, at: number) => Op[];
/** The block at `at` taken out. */
export declare const removeBlock: (doc: Doc, at: number) => Op[];
/** Blocks put in after the block at `at` (a paste onto a card in hand). */
export declare const putAfter: (at: number, blocks: Block[]) => Op[];
/** The words of another document held in a fence: its head's title, else its first heading's words, else its first words. */
export declare function fenceTitle(body: string): string;
