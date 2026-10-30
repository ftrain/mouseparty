/**
 * The calculator's document and its arithmetic, with no DOM. The document is a tape: one paragraph, an
 * expression a line ("a = 12" keeps its answer by name for the lines after; "ans" is the line before), and
 * `mode: graph` in the head when the lines are curves y = f(x) to draw. Everything else a person or a model
 * writes loosely (results after the expressions, "y = …", a list, a money mode's inputs) is read too, and
 * `tidy` is the one edit that makes it a tape.
 *
 * Expressions are parsed by hand, never run as code: numbers, + - × ÷ ^ %, parentheses, the functions a
 * scientific calculator has, π and e, and x for graphing. What the hand parser does not read (units and
 * conversions, numbers past a double, a little algebra) goes to a second engine, math.ts, which the editor
 * imports and hands over: `setEngine`. Money (a loan, savings, a budget) is the Spreadsheet's templates, not a mode here.
 */
import { type Block, type Doc, type Op } from '../../doc/index.ts';
export type Mode = 'calc' | 'graph';
/**
 * An expression worked out; NaN when it does not parse. `x` may be given, and `names` the values of names
 * from earlier lines of the tape. sin takes radians, as the keys say.
 */
export declare function evaluate(src: string, x?: number, names?: Record<string, number>): number;
/**
 * The second engine: given the expression and the values the lines before kept, the value (for the lines
 * after), its text, and the number it is (NaN when it is not one).
 */
export type Engine = (src: string, scope: Record<string, unknown>) => {
    value: unknown;
    text: string;
    number: number;
};
export declare const setEngine: (e: Engine | null) => undefined;
export declare const hasEngine: () => boolean;
/** What a line comes to. */
export interface Result {
    number: number;
    text: string;
    value: unknown;
}
/** The hand parser's number where it reads the line, else the engine's answer, else nothing. */
export declare function result(src: string, scope?: Record<string, unknown>, x?: number): Result;
/**
 * The tape worked out line by line, as the little program it is: a line "name = expression" keeps its
 * result under that name for the lines after it, and "ans" is always the line before. Each line's result (as
 * a number, and as its text), and what the names hold after the last.
 */
export declare function tape(lines: string[]): {
    results: number[];
    texts: string[];
    names: Record<string, number>;
    scope: Record<string, unknown>;
};
/**
 * A line of words with no sum in it is a note on the tape, written as a sentence: it has no answer, it ends
 * in a full stop, a colon or an exclamation mark, and it has two words or more ("Check every dose with a
 * pharmacist."). Nothing marks it but the writing; a line that is neither (a typo, "3 inch to cmm") is a
 * line with no answer, shown as one.
 */
export declare const isNote: (line: string, answer: string) => boolean;
/** What the line being typed comes to, after the tape: the words before "=" in "a = …" are its name, not the sum. */
export declare function live(entry: string, lines: string[], mode: Mode): string;
/** A number as a calculator shows it: up to 10 significant digits, no trailing noise, a real minus sign. */
export declare function shown(v: number): string;
/** Points of y = f(x) across a range, for the graph; gaps where it is not finite. */
export declare function plot(expr: string, from?: number, to?: number, n?: number): (readonly [number, number] | null)[];
/** The curves of a graph, and the range they are drawn across. */
export declare function curves(lines: string[]): {
    from: number;
    to: number;
    exprs: string[];
};
export interface CalcView {
    mode: Mode;
    /** The tape, a line each, as written. */
    lines: string[];
    /** The tape's paragraph: its block, -1 while there is none. */
    at: number;
    /** The document holds more, or other, than a tape: `tidy` makes it one. */
    loose: boolean;
}
/** A tape's paragraph: the lines as plain words, a line each. */
export declare const tapeBlock: (lines: string[]) => Block;
export declare function readCalc(doc: Doc): CalcView;
/** The one edit that makes a loosely written document a tape: its lines in one paragraph, the mode in the head. */
export declare function tidy(doc: Doc): Op[];
/** A line put at the end of the tape (on a graph, a curve not already drawn). */
export declare function addLine(v: CalcView, s: string): Op[];
/** Line i changed where it stands (the lines after it follow); emptied, it goes. */
export declare function setLine(v: CalcView, i: number, s: string): Op[];
/** Line i taken away, with its line break; the last line taken, the tape goes. */
export declare function removeLine(v: CalcView, i: number): Op[];
/** The whole tape taken away. */
export declare const clearTape: (v: CalcView) => Op[];
/** The other mode: its lines mean something else there, so the tape starts again (one undo brings it back). */
export declare const setMode: (v: CalcView, mode: Mode) => Op[];
/**
 * Lines [from, to) given way to `put` (each cleaned, the empty ones dropped): one op over the tape's words, so a
 * run of lines moved, copied in, pasted or taken away is one step to undo. Every all-lines command is this.
 */
export declare function replaceLines(v: CalcView, from: number, to: number, put: string[]): Op[];
/** Lines [from, to) moved one past their neighbour (by -1 up, 1 down); nothing at the ends. */
export declare function moveLines(v: CalcView, from: number, to: number, by: 1 | -1): Op[];
/** Line i carried to just after line `after` (a drag by its grip). */
export declare function dropLine(v: CalcView, i: number, after: number): Op[];
/** Pasted blocks read as tape lines, the way a document is read (a result after a sum goes; on a graph, "y =" goes). */
export declare const pastedLines: (blocks: Block[], mode: Mode) => string[];
