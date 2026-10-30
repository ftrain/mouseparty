/**
 * TLO: every document is Markdown with a few additions, and this reads and
 * writes it. The link holds this text (compressed), a .tlo file is this text,
 * and every app reads its document through the blocks here. docs/tlo.md is
 * the format as a person or a language model learns it.
 *
 * Blocks, one after another (a list item's depth says how it nests):
 *
 *   ---                      a header first: "key: value" lines between fences
 *   # Heading                levels 1 to 6
 *   Words                    a paragraph; its lines stay lines
 *   - item / 1. item         list items, two spaces in per level; "- [ ]" and "- [x]" are tasks
 *   > note                   a quote: a note, a speaker's note
 *   ---                      a rule: a break between pages or slides
 *   a | b                    a table: the header row names (and may type) the columns, "Price:money"
 *   --- | ---
 *   ```sheet                 a fenced block: another document inside this one, named by its app,
 *   ...                      or text kept exactly as written
 *   ```
 *   ~ A -> B: label          an edge between two things in the document (->, <-, <->, --)
 *
 * An address may hold one pair of brackets, as Wikipedia's do; a lone bracket is written escaped (%28, %29).
 * Any block may end with attributes, "{#id .kind key=value}".
 * Inline: **bold**, *italic*, ++underline++, ~~strike~~, ==highlight==, [words](address), :icon:,
 * ^[a footnote's words] (notes.ts says how notes are drawn).
 *
 * Read leniently, write canonically: and what is canonical is written back
 * byte for byte (write(parse(x)) === x), which the inline writer keeps by
 * escaping as little as it can and reading its own words back to check.
 */
import { type Attrs, type Block, type ColType, type Column, type Doc, type FenceBlock, type Head, type Run } from './model.ts';
/** Words and the attributes at their end, if any. */
export declare function splitAttrs(line: string): [string, Attrs | undefined];
/** The cells of a table row: pipes split them, "\|" is a pipe in a cell. */
export declare function cells(line: string): string[];
/** Inline Markdown, line by line, as runs: marks do not cross a line, and a line break is a '\n' among the words. */
export declare function parseLines(s: string, blank?: boolean): Run[];
/** A text as a document: its header and its blocks, read leniently. */
export declare function parse(text: string): Doc;
/** Some keys taken out of a text's header: [those keys, the text without them]. The rest of the header stays. */
export declare function takeHead(text: string, keys: string[]): [Head, string];
/** A text with keys put in its header (an empty value takes the key out). */
export declare function withHead(text: string, keys: Head): string;
/** One block as text; `n` numbers an ordered item. */
export declare function writeBlock(b: Block, n?: number): string;
/** A document as text. Blocks that would run together are kept apart by a blank line; list items and edges sit line by line. */
export declare function write(doc: Doc): string;
/** The one way a string of inline Markdown becomes runs (parseInline by its short name, for a model built by hand). */
export declare const text: (s: string) => Run[];
/**
 * One line of inline Markdown as runs of words with their marks. Lenient: what does not close is plain words.
 * `kept`, given by a line's reader, takes each escaped space, read as a NUL until the line's ends are trimmed.
 */
export declare function parseInline(s: string, kept?: string[]): Run[];
/** A note's words as they sit between "^[" and "]": a bracket that would end the note early, or open one that never closes, is escaped; so is a backslash that would swallow the "]". */
export declare function balanceNote(fn: string): string;
/** Plain words as Markdown, every mark escaped: what is written when the words cannot be left as they are. */
export declare function escapeInline(t: string): string;
/**
 * Runs as one line of inline Markdown. Marks open and close where they
 * change; spaces stay outside them, as Markdown needs. The words are
 * written with as little escaping as reads back right: first with a
 * backslash escaped and nothing else, and, when that would read as other
 * runs, with every mark escaped. So "5 * 3" and "snake_case" come back as
 * they were written, and canonical text is byte-stable.
 */
export declare function writeInline(given: Run[]): string;
/**
 * A block's runs as reading their writing gives them back: what the writer lets go of taken off first, a line at a
 * time, so `parse(write(d))` is `d` for a document whose blocks are so. A mark never holds a space at its ends: it
 * ends before the spaces after it and begins after the ones before it (`**a** b`, as Markdown has it: `**a **` is
 * no bold), and a line break carries none; a link's spaces at a line's ends go outside it (in a quote, `quote`, only
 * at its end); an icon carries no mark, a note's words are balanced, and out of code goes what a backtick span cannot
 * hold. The editor keeps its words so as it edits (kit/text/textops.ts `settle`), so what it holds is what the text
 * says. Runs already so are given back as they are, the same array.
 */
export declare function sayableRuns(runs: Run[], quote?: boolean): Run[];
/**
 * Another document held in this one is a fenced block named for its app;
 * in memory it is a "ref", the app's name, a new line, and its text. These
 * turn one into the other.
 */
export declare function refFence(ref: string): FenceBlock;
/** A fence as a ref: its app, a new line, its text. */
export declare const fenceRef: (b: {
    lang: string;
    body: string;
}) => string;
/**
 * A currency as a column head names it, written canonically: an ISO 4217 code ("gbp" is GBP), or a symbol of one
 * to three characters that are not all letters ("£", "R$"); null for anything else.
 */
export declare function currencyOf(s: string): string | null;
/**
 * A column heading, "Price:money", as its name and type ("Price: money" reads too; "Time: 10am" is a name). A money
 * column may name its currency, "Price:money(£)" or "Price:money(GBP)"; another type with parentheses is a name.
 */
export declare function column(h: string): Column;
/** Where in a table each column asked for is, found by its name (in any case, its type left off); -1 for one it has not got. */
export declare function columnsOf(table: {
    cols: Column[];
}, ...want: RegExp[]): number[];
/** A column heading as it is written: the name, and ":type" when it is not text, a money column's currency after it. */
export declare const columnText: (name: string, type?: ColType, currency?: string) => string;
