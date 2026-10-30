/**
 * The editor's model maths, with no DOM in it: a position is a block and an
 * offset in its characters (an icon, a footnote mark or a line break counts
 * one); a selection is two of them. Every edit the editor makes is a pure
 * function from the blocks it owns and the selection to the operations
 * (docs/kernel.md §3) and the selection after; `settle` keeps what they
 * make as the format does (no mark on a space at its edge), so the model is
 * what its text reads back as. text.ts maps events onto these; the node
 * tests work them without a browser.
 */
import { isText as holdsRuns, type Block, type Op, type Run } from '../../doc/index.ts';
/** Whether a block is words the caret can sit in: a heading, a paragraph, an item, a note. Anything else is a card. */
export declare const isWords: typeof holdsRuns;
export interface Pos {
    block: number;
    offset: number;
}
export interface Sel {
    anchor: Pos;
    focus: Pos;
}
/** What the editor can be told to do; some take a word (a link's address, an icon's name, another document's ref). */
export type Command = 'b' | 'i' | 'u' | 's' | 'h' | 'c' | 'link' | 'unlink' | 'fn' | 'icon' | 'date' | 'title' | 'h1' | 'h2' | 'p' | 'quote' | 'ul' | 'ol' | 'indent' | 'outdent' | 'left' | 'center' | 'right' | 'justify';
export type Mark = 'b' | 'i' | 'u' | 's' | 'h' | 'c';
/** The marks in force where the caret is: what the next letter typed will carry. */
export type Fmt = Partial<Pick<Run, Mark | 'href'>>;
export type Shape = 'doc' | 'lines' | 'line';
/** An edit: the operations, and where the selection sits once they are applied. */
export interface Edit {
    ops: Op[];
    sel: Sel;
}
export declare const MARKS: Mark[];
export declare const cmp: (a: Pos, b: Pos) => number;
export declare const collapsed: (s: Sel) => boolean;
/** The selection's two ends, first the one nearer the start. */
export declare const ordered: (s: Sel) => [Pos, Pos];
export declare const caret: (block: number, offset: number) => Sel;
export declare const sameSel: (a: Sel | null, b: Sel | null) => boolean;
/** How many characters a block holds: none for a block that is not words. */
export declare const blockLength: (b: Block | undefined) => number;
/** A position held within the blocks: the block exists and the offset is within its words. */
export declare function clampPos(blocks: Block[], p: Pos): Pos;
/** A selection held within the blocks, and never resting on a card (another document, a table, a rule). */
export declare const clampSel: (blocks: Block[], s: Sel) => Sel;
/**
 * A selection carried over ops someone else applied (docs/kernel.md §12), as the kernel's transform carries an op on a
 * block, plainly: past blocks put in or taken out before its block, with its block through a move, and past words put
 * in or taken out before it in its block (a place where words were put in stays before them; one inside words
 * replaced goes to their end). A place inside blocks taken out goes to what follows them. Held within the document
 * after with `clampSel`.
 */
export declare function carrySel(s: Sel, ops: Op[]): Sel;
/** A position that sits in words: one on a card is moved to the next text block's start (or the previous one's end). */
export declare function skipCard(blocks: Block[], p: Pos, dir?: 1 | -1): Pos;
/** The run holding the character at `offset` (the one that starts at or spans it), with where it starts. */
export declare function runAt(runs: Run[], offset: number): {
    run: Run;
    start: number;
    index: number;
} | null;
/** The marks where the caret sits: those of the words just before it, or just after it at a block's start. An atomic run gives none. */
export declare function marksAt(runs: Run[], offset: number): Fmt;
/** The marks a selection shows: at a caret, those of the words before it; over a range, those every selected word has (a link when all share one). */
export declare function marksOf(blocks: Block[], sel: Sel): Fmt;
/** The plain character at `offset`: '' for an atomic run or past the end. */
export declare function charAt(runs: Run[], offset: number): string;
/** The blocks' words between two positions, the first and last cut at their offsets; what is not words comes whole. */
export declare function sliceBlocks(blocks: Block[], sel: Sel): Block[];
/**
 * The selection taken out and `runs` put in its place: one `text` op within
 * a block; across blocks, one `splice` joining the first block's start to
 * the last one's end. The caret lands after what was put in.
 */
export declare function insertRuns(blocks: Block[], sel: Sel, runs: Run[]): Edit;
export declare const deleteSel: (blocks: Block[], sel: Sel) => Edit;
/**
 * The whole document as a selection (Select All in a doc): from the start of the first block to the end of the
 * last, cards included, so its ends may rest on a card (the one place they do; clampSel would move them to the
 * words). An edit over it (insertRuns, insertBlocks, splitAt) takes the cards at its ends with the words, and
 * what is left is one block of words.
 */
export declare const wholeSel: (blocks: Block[]) => Sel;
/**
 * Blocks put in at the selection (a paste): the first one's words join the
 * block the caret is in, the last one's words begin the block after, and
 * what is between stands on its own. A lone text block is put in as words.
 */
export declare function insertBlocks(blocks: Block[], sel: Sel, put: Block[]): Edit;
/** Enter: the block split at the caret (a selection goes first). An empty list item comes out of its list instead; at the start of a block's words a paragraph opens above it. */
export declare function splitAt(blocks: Block[], sel: Sel): Edit;
/**
 * Backspace with the caret together: one character or one atomic run; at a
 * block's start a list item comes out of its list, a card before it is
 * taken out, or the block joins the one before. 'exit' at the very start
 * when the editor is not a document; null when there is nothing to do.
 */
export declare function backspace(blocks: Block[], sel: Sel, shape: Shape): Edit | 'exit' | null;
/** Delete: one character or atomic run forward; at a block's end the next block joins this one, or a card after it is taken out. */
export declare function forwardDelete(blocks: Block[], sel: Sel): Edit | null;
/** A mark put on the selection, or taken off when every selected word has it. One `text` op per block; the selection is kept. */
export declare function toggleMark(blocks: Block[], sel: Sel, m: Mark): Edit;
/** The selection's words with a mark set (on) or taken off; the selection is kept. */
export declare function setMark(blocks: Block[], sel: Sel, m: Mark | 'href', value: boolean | string): Edit;
/** The kind a block is asked to be: a paragraph, a heading, the title, a list item. Asking for the kind it already is (a list) makes it a paragraph. */
export declare function setKind(blocks: Block[], sel: Sel, kind: 'p' | 'h1' | 'h2' | 'title' | 'quote' | 'ul' | 'ol'): Edit;
/** Whether the first selected block is of a kind: for a bar's pressed states. */
export declare function kindAt(blocks: Block[], sel: Sel): 'p' | 'h1' | 'h2' | 'title' | 'ul' | 'ol' | 'quote' | null;
/** The selected blocks aligned: left is no class at all. */
export declare function align(blocks: Block[], sel: Sel, how: 'left' | 'center' | 'right' | 'justify'): Edit;
/** The alignment of the first selected block. */
export declare function alignAt(blocks: Block[], sel: Sel): 'left' | 'center' | 'right' | 'justify';
/** The selected list items a level deeper (by 1) or shallower (by -1): never deeper than the item above them plus one, never past the margin or the third level. Null when nothing moves. */
export declare function shiftItems(blocks: Block[], sel: Sel, by: 1 | -1): Edit | null;
/**
 * Alt+Up/Down: the selected items, with their deeper followers, moved past
 * the family before (by -1) or after (by 1) at their level; never out of
 * their parent, never past a block that is not an item. One splice over the
 * two families, the same blocks in another order; the selection moves with
 * them. Null when there is nowhere to go.
 */
export declare function moveItems(blocks: Block[], sel: Sel, by: 1 | -1): Edit | null;
/** A straight quote as the curly one the place calls for: opening after a space or a bracket, closing (or an apostrophe) after a letter. */
export declare function smartQuote(q: '"' | "'", before: string): string;
/** A paragraph that begins "- ", "1. ", "# " or "> " becomes a list item, a heading or a quote as the space is typed: the shortcut's op, or null. */
export declare function shortcut(blocks: Block[], sel: Sel, shape: Shape): Edit | null;
/**
 * One `text` op taking a block's runs to other runs (what the browser made
 * of them during a composition): the common start and end are kept, what
 * is between is replaced. Null when they are the same.
 */
export declare function runsDiff(at: number, from: Run[], to: Run[]): Op | null;
/** A block of words as the format keeps it (sayableRuns); any other block, and words already so, as it is. */
export declare function sayableBlock<B extends Block>(b: B): B;
/**
 * Marks the format let go of just before a caret: the spaces from `from` to `to` (the caret) carried them as they were
 * typed, or until the words after them went, and a mark never ends on a space (sayableRuns). `fmt` is the marks in
 * force there all the same, so the next letter typed carries them, and the spaces take back those they share with it
 * (`typeRuns`): a bold word, a space and a bold word are one bold "a b".
 */
export interface Held {
    block: number;
    from: number;
    to: number;
    fmt: Fmt;
}
/**
 * An edit's ops as the format keeps what they make (docs/kernel.md §2, point 5): every block of
 * words they leave is what its text reads back as, so the editor holds what `parse(write(model))` gives, and a server
 * that keeps the text and applies the same ops holds the same words (2026-10-17). A splice's blocks go in so;
 * a `text` op that would leave a mark on a space at its edge reaches over the marks let go of (its words and their
 * places stay as they were, so the selection after it does too), and one that then changes nothing goes. An op that
 * leaves a heading holding a line break leaves it one line and a paragraph after it (`oneLine`), and `sel` (the
 * selection after the ops; an edit puts lines into a heading with its last op) follows. `held` is what was let go of
 * just before the caret, if it is one.
 */
export declare function settle<S extends Sel | undefined>(blocks: Block[], ops: Op[], sel?: S): {
    ops: Op[];
    held: Held | null;
    sel: S;
};
/**
 * Words typed at the caret (or over the selection), with their marks. Where the format let go of marks just before
 * the caret (`held`), the spaces there take back those they share with the words' first run, and the words follow:
 * typing a bold word, a space and a bold word writes "**a b**". Spaces alone are only put in: at the edge again,
 * settle holds them again.
 */
export declare function typeRuns(blocks: Block[], sel: Sel, runs: Run[], held: Held | null): Edit;
