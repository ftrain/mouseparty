/**
 * <to-calc-editor>: the Calculator. A line to type into, with what it comes to under it as it is typed; the
 * tape above it, every line worked out, each a box of its own to change where it stands (the lines after it
 * follow); the keys below. On a graph the lines are curves y = f(x), drawn above the tape. A key never takes
 * the focus, so a phone's keyboard stays where it was. Every change is operations on the tape's paragraph
 * (model.ts): a line put in, changed or taken away is a `text` op, the tape's birth and end a `splice`, the
 * mode a `head` op. Units, conversions and algebra come from math.ts, imported lazily when the editor opens (in the
 * built site it is part of the app file, so the import is at once).
 *
 * The tape's lines are rows (kit/text/rows.ts): a tap on a line's grip, or Shift+Up/Down or Escape in it, chooses it
 * whole, with the bar under it (Edit, Move up, Move down, Duplicate | Copy, Cut, Paste | Delete) and the keys a
 * chosen thing has; a drag by the grip carries it. In a line's box: Alt+Up/Down move it, Mod+D copies it under
 * itself, Up and Down go to the line above and below, Enter is done (the caret to the line being typed),
 * Escape puts back what it said, Backspace on an empty line takes it away, and a paste of several lines makes
 * several. The line being typed is not the document (docs/editing.md §8): Up/Down with no modifier recall the
 * tape into it, Escape and C clear it, and Mod+Z in it is its own while it holds words. An undo puts the focus
 * back where it was before the change: the chosen lines, the line's box, or the line being typed.
 */
import { type PropertyDeclarations } from 'lit';
import { type Doc, type Op } from '../../doc/index.ts';
import { DocElement, type Entry } from '../../kit/core/element.ts';
import { Rows } from '../../kit/text/rows.ts';
import { type CalcView, type Mode } from './model.ts';
import '../../kit/ui/bar.ts';
import '../../kit/ui/insert.ts';
import './style.css';
export declare const tag = "to-calc-editor";
export declare class ToCalcEditor extends DocElement<CalcView> {
    static properties: PropertyDeclarations;
    /** What is being typed into the line, not yet on the tape. */
    entry: string;
    /** The engine has come: answers in units and algebra can be shown. */
    ready: boolean;
    /** Up and Down walk the tape back into the line: how far back. */
    private recall;
    /** Where the caret goes after a key, until the line is drawn with what the key typed (keys come faster than frames). */
    private caret;
    /** Line boxes put on the tape by a key already: the change their blur brings is not theirs to make again (until they are focused anew). */
    private settled;
    /** Lines chosen whole: the kit's one implementation (keys, the bar under them, the clipboard, a drag by the grip). */
    readonly rows: Rows<number>;
    constructor();
    connectedCallback(): void;
    protected read(doc: Doc): CalcView;
    protected willUpdate(changed: Map<string, unknown>): void;
    /** Commands over the tape, each on the tape the one before left, as one edit: the document made a tape first if an undo left it loose. */
    private run;
    /** Every edit keeps where the focus was before it, for its undo. */
    edit(ops: Op[], key?: string, mark?: unknown): void;
    private where;
    /** After an undo the focus is where it was before the change; after a redo (or with nothing kept), on the line the change began at. */
    protected undone(entry: Entry, redo: boolean): void;
    /** The line an entry's change begins at, on the tape as it is now; -1 when it touched no line. */
    private lineAt;
    /** Which tape line an element is in, or null. */
    private lineIndex;
    private lineBox;
    /** Where a person starts: the entry line, the caret at its end. */
    focusFirst(): Promise<void>;
    /** The caret into line i's box, once it is drawn. */
    private focusLine;
    /**
     * What a line's box says, put on the tape where it differs (an input's change comes only on blur), with the
     * commands after it, as one edit. A box drawn again after the edit says what its line says, so the change that
     * comes with the blur finds nothing to put.
     */
    private runLine;
    private onLineChange;
    /** The tape line a key is typed in, while its commands answer it (commands.ts). */
    here: {
        i: number;
        box: HTMLInputElement;
        offset: number;
    } | null;
    private onLineKey;
    /** Enter on a line: done, the line put on the tape, the caret to the line being typed (the tape grows at its end). */
    lineDone(): void;
    /** Escape on a line: what it said, back (the step out of an edit not put down); said already, the line chosen. */
    lineBack(): void;
    /** Alt+Up/Down: the line past its neighbour, the caret with it. */
    lineMove(by: -1 | 1): void;
    /** Shift+Up/Down: the line chosen whole. */
    lineChoose(): void;
    /** Up and Down: the line before or after (after the last, the line being typed). */
    lineStep(by: -1 | 1): boolean;
    /** Mod+D: the line again under it. */
    lineDuplicate(): void;
    /** Backspace in an empty line: the line taken away, the caret to the end of the one before. */
    lineRemove(): boolean;
    /** Mod+A with the box's words all selected (or none): the whole tape. False while the box has words to select first. */
    allKey(e?: Event): boolean;
    /** A box whose words are all selected (or that has none): Select All pressed again takes the whole tape. */
    private whole;
    private removeSpan;
    private moveSpan;
    /** The chosen lines again, right under them; the copies are chosen. */
    private duplicateSpan;
    /** Chosen lines on the clipboard: a tape of them as TLO, and as HTML with our mark. */
    private clip;
    /** What a paste's data says, as tape lines. */
    private linesOf;
    /** Lines pasted in place of the chosen ones (at the tape's end with none); the caret to the last. */
    private pasteLines;
    /**
     * A paste into a box: several lines (a column of sums) go on the tape a line each, in one edit, the words around
     * the caret kept at their ends; our own copy is read as the TLO it is. Words alone are the box's own.
     */
    private onBoxPaste;
    private get display();
    /**
     * Words typed into the line where its caret is (an input keeps its caret when it has not the focus), or
     * a key: ⌫ takes the letter before the caret, C the whole line, = works it out.
     */
    private put;
    private press;
    /** The line given words of its own: the caret at their end. */
    setEntry(s: string): void;
    /** Enter: the line goes on the tape, worked out; on a graph, it is drawn. */
    enter(): void;
    /** Keys in the line being typed (commands.ts). Up and Down recall the tape only with no modifier: Shift+Up is the box's own selection. */
    private onKey;
    /** Up (1) and Down (-1) in the line being typed: the tape's lines again, last first, and back to an empty line. */
    recallKey(by: 1 | -1): boolean;
    /** Insert ▾: words typed into the line where its caret is. */
    typeIn(words: string): void;
    clearTape(): void;
    mode(m: Mode): void;
    private keys;
    private tapeRows;
    render(): import("lit-html").TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'to-calc-editor': ToCalcEditor;
    }
}
