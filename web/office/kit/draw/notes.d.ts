/**
 * <to-notes>: a document's footnotes drawn where they are listed (the end of a page, a slide's foot, under an
 * outline), each note's words typed where they are drawn (docs/editing.md §2): a <to-text shape=line> over the
 * note's runs, rich as a note is (its marks and links: no blocks, no note inside a note). The host gives the
 * notes' words in the order of their marks (`notes`, as the document holds them) and answers what it hears:
 *
 *   note-change  {nth, fn}    the note's words now (inline Markdown): the host writes them on its mark, one `text` op.
 *   note-back    {nth}        Enter or Escape in the note, or its ↩ (`backs`): back to the words, after the mark.
 *   note-remove  {nth, back}  a note emptied and left, or Backspace at the start of an empty one: its mark goes;
 *                             `back`, the caret goes where the mark was.
 *
 * focusNote(nth) puts the caret at the end of a note's words and brings it into view (a mark tapped, a new
 * footnote). noteMarks() and noteIndex() are how a host finds a note's mark among its blocks.
 */
import { LitElement, nothing } from 'lit';
import { type Block } from '../../doc/index.ts';
import type { ToText } from '../text/text.ts';
import '../text/text.ts';
/** A footnote's mark among blocks: its block, its offset there (one character), and its words. */
export interface NoteMark {
    block: number;
    offset: number;
    fn: string;
}
/** Every footnote mark in the blocks, in order. */
export declare function noteMarks(blocks: readonly Block[]): NoteMark[];
/** Which note mark `nth` of block `block` is, among all the marks of the blocks. */
export declare const noteIndex: (marks: readonly NoteMark[], block: number, nth: number) => number;
export declare class ToNotes extends LitElement {
    static properties: {
        notes: {
            attribute: boolean;
        };
        backs: {
            type: BooleanConstructor;
        };
    };
    /** Each note's words, in the order of their marks. */
    notes: string[];
    /** A ↩ beside each note, back to its mark (the Word Processor's endnotes). */
    backs: boolean;
    /** Each note's paragraph and the words it was last written as: kept while the document says the same, so the editor keeps its element and its caret. */
    private held;
    /** The note whose leaving is already answered (Escape, Enter, Backspace): its focusout says nothing more. */
    private settled;
    constructor();
    createRenderRoot(): this;
    /** The note's editor. */
    field(nth: number): ToText | null;
    /** The caret at the end of note `nth`'s words, the note in view. */
    focusNote(nth: number): Promise<void>;
    protected willUpdate(changed: Map<string, unknown>): void;
    private say;
    private onOps;
    /** The note left with nothing in it: its mark goes too. */
    private leave;
    private back;
    private onFocusOut;
    private onFocusIn;
    render(): typeof nothing | import("lit-html").TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-notes': ToNotes;
    }
}
