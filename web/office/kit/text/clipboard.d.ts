/**
 * The editor's clipboard. Copy and cut write the selected blocks as the words
 * a person reads (text/plain: no mark in them, an item with its marker, a
 * table's cells by tabs) and as HTML with a generator marker (text/html) that
 * carries the exact TLO in a meta, so a paste into another Tiny Little Office
 * document comes back whole, a paste into a rich editor arrives with its marks,
 * and a paste into a text field, a chat or a search box gets the words alone
 * (Paul, 2026-10-13: an address marked as code came over with its backticks,
 * and a linked item as "- [`words`](address)"). Paste reads, in order: our own HTML
 * (the marker) → the TLO it carries, or for words from within one block their exact
 * runs; a Tiny Little Office link alone → a fence holding that document;
 * any other web address is words, as typed; HTML from elsewhere → blocks (tags and styles to marks, lists to items from
 * Google Docs, Word, Apple Notes, Notion and Slack, Docs'
 * bold-that-is-not); plain text → read as TLO, a bullet glyph as an item,
 * one line too (pasted Markdown becomes headings, lists and marks); words
 * with no syntax → those words. What comes back is fitted to the editor's
 * shape and what it can show: lines keeps items and paragraphs only; a
 * line takes the words alone; a table, a connection or a fence
 * of no app's is words where it cannot be shown. Words that look like
 * syntax stay words: the TLO writer escapes them.
 */
import { type Block, type Run } from '../../doc/index.ts';
import { type Sel, type Shape } from './textops.ts';
/** The mark our own HTML carries. */
export declare const GENERATOR = "TinyLittleOffice";
/**
 * Blocks as text/plain holds them: what a person pasting into a text field, a chat or a search box expects. A
 * heading's, a paragraph's and a note's words alone; an item with its depth, its marker (numbered as it is) and its
 * box; a table's cells by tabs, a line a row; a fence's body; a connection as words with an arrow; a rule as "---".
 * Items follow one another a line each; anything else has a blank line before it; the last line ends, as lines
 * do. The exact document rides in our HTML (docToHtml), so none of this is read back by our own paste.
 */
export declare function plainOf(blocks: Block[]): string;
/** What a paste reads as TLO: our own copy exactly as it was, else the text as it came. */
export declare const clipText: (data: {
    text: string;
    html: string;
}) => string;
/** Runs as HTML: marks nested, an icon and a footnote as their own elements, a line break as <br>. */
export declare function runsToHtml(runs: Run[]): string;
/** Blocks as HTML, our marker first and the exact TLO in a meta after it: what the clipboard's text/html holds. */
export declare function docToHtml(blocks: Block[]): string;
/**
 * What copy puts on the clipboard for a selection: the words alone (plainOf; words from within one block exactly,
 * the spaces at their ends and all, with no line break after), and our HTML, which carries the exact TLO. Words
 * from within one block carry their runs exactly as well, in a meta of our HTML, marks and all.
 */
export declare function copyData(blocks: Block[], sel: Sel): {
    text: string;
    html: string;
};
/** What the clipboard holds or is to hold: the words (our TLO), and the HTML (ours carries the marker). */
export interface Clip {
    text: string;
    html: string;
}
/**
 * A copy put on the system clipboard as a page may put it, from a button rather than the keys (a phone's Copy, a
 * card's): the TLO and our HTML together, the words alone where the browser takes no HTML. False where it refuses.
 */
export declare function writeClip(c: Clip): Promise<boolean>;
/** The system clipboard read as a page may read it, for a Paste button: its words and its HTML; null where the browser refuses (then only the keyboard's paste reaches it). */
export declare function readClip(): Promise<Clip | null>;
/**
 * HTML from anywhere as blocks: tags and styles to marks, lists to items
 * with their depth, headings by level (by tag, or role="heading"), tables
 * as such, a picture as words that link to it (its description, else its address: nothing is fetched). Spaces collapse as a browser shows them; a <br> is a
 * line break. What other editors put around a list item is read as one:
 * Google Docs' <p> inside each <li> (paragraphs inside an item are its
 * lines), Word's list paragraphs (`mso-list: … level2`, the glyph in a
 * `mso-list:Ignore` span dropped), Slack's flat lists that say their depth
 * (`data-stringify-indent`), and a paragraph that opens with a bullet glyph
 * (Mail, TextEdit). Links are kept for http(s), mailto and tel only.
 * Words come as the format keeps them, with `kept` false as they were marked.
 */
export declare function htmlToBlocks(html: string, kept?: boolean): Block[];
/** What a paste becomes: blocks to put in, or words. */
export type Pasted = {
    blocks: Block[];
} | {
    runs: Run[];
};
/** A Tiny Little Office link as the fence that holds its document (a locked one by its link, kit/share/locked.ts), or null when the link is not one, or cannot be read. */
export declare function linkToFence(url: string): Block | null;
/**
 * Blocks fitted to an editor's shape: lines keeps items and paragraphs; a line takes the words alone, lines joined
 * by spaces. What the host cannot show becomes words first (asWords); in a document, only for a paste from
 * elsewhere (`foreign`): our own copy pastes back as it was. A block comes as the format keeps it (sayableBlock: no mark
 * on a space at its edge), whole blocks being what a host may put in as they are; words alone go where the editor
 * keeps them so, and so do blocks with `kept` false: the editor's paste, whose first and last blocks' words join the
 * words where they go, settled there with them (an underlined "a " pasted before an underlined word is one underline).
 */
export declare function fitBlocks(blocks: Block[], shape: Shape, foreign?: boolean, kept?: boolean): Pasted;
/**
 * What a paste's data becomes, by the rules at the top of this file. Null when there is nothing to paste. With `kept`
 * false (the editor's own paste, which settles what it makes) the words keep the marks on their edge spaces (fitBlocks).
 */
export declare function pasteFrom(data: {
    text: string;
    html: string;
}, shape: Shape, kept?: boolean): Pasted | null;
/**
 * A copy our editors did not take (the reader's pages, a slide's words, anything drawn rather than edited) is the
 * browser's own, and the browser writes what it sees: the words with the colours they were drawn in, so a copy from a
 * midnight slide pasted into Google Docs is white on white (Paul, 2026-10-11: "you're giving me white text"). Taken
 * here instead, after every editor's handler has had its say: the words as text, and as paragraphs with no colour,
 * no style and no font, one per line of what was selected.
 */
export declare function installPlainCopy(root?: Document): void;
