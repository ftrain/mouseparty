/**
 * The formula engine, over a table block. A cell starting with "=" is a
 * formula: + - * / ^ %, comparisons (= <> < > <= >=, giving 1 or 0),
 * parentheses, unary minus, cell references (A1), ranges (A1:A5), "words"
 * and the functions in FUNCTIONS: enough for a small business model. A
 * cell can have a name: a column typed `name` names, with each of its
 * cells, the cell to its right, and a formula may say `=visitors *
 * signup_rate` (a space in a name is written "_"; case does not matter).
 *
 * Dates are numbers: days counted the way spreadsheets count them (1900
 * system), so a date minus a date is a number of days and a date plus 30 is
 * the date a month on. A date column shows such numbers as dates.
 *
 * Because `evaluate` takes any document and block index, a table inside a
 * text or on a slide is worked out in place, as a sheet's is.
 */
import type { ColType, Doc } from './model.ts';
import { type Table } from './table.ts';
/** Every function the engine knows: name, example arguments, what it does. */
export declare const FUNCTIONS: [string, string, string][];
/** What a column of a sheet may hold: how its cells are read when typed, and shown. */
export declare const COLUMN_TYPES: {
    id: ColType;
    name: string;
    hint: string;
}[];
/** A civil date as a spreadsheet's day number. */
export declare const dateToSerial: (y: number, m: number, d: number) => number;
/** Today as a spreadsheet's day number. */
export declare const todaySerial: () => number;
/** A day number as "2027-03-01". */
export declare const serialToIso: (serial: number) => string;
/** What a cell works out to: a number, words (or an error code starting with #), or nothing. */
export type CellValue = number | string | null;
/** A table worked out: a value for every cell of every row, and where each name points. */
export interface Evaluated {
    values: CellValue[][];
    named: Map<string, [number, number]>;
}
/**
 * A cell as typed, read as its column's type: a number, a date's day number, a check's 1 or 0, or the words themselves.
 * Empty is null. An apostrophe before words that would otherwise read as something else (a formula, a number, a date)
 * keeps them words, the apostrophe not among them, as in Excel and Sheets (asWords); before words that read as
 * themselves it is theirs ("'Tis"). A rich column's words are inline Markdown, whose own escape is a backslash, and
 * are words whatever they say: its cell is never read as a number or a date.
 */
export declare function parseLiteral(raw: string, type?: string, today?: typeof todaySerial): CellValue;
/**
 * Words written as a cell of a column of `type` that reads back as those words whatever they start with (docs/kernel.md
 * §5, Words that look like something else). In a rich column, as inline Markdown (writeInline) with a backslash before
 * a "=" at their start, the inline form's own escape ("\=SUM(1)"), its cell being words already ("007"); in any other, as they are where they read as
 * themselves already, else with an apostrophe before them ("'=SUM(1)", "'007"), which parseLiteral reads past. Words of
 * nothing but spaces are an empty cell, as they are.
 */
export declare function asWords(words: string, type?: string): string;
/** Every cell of a table worked out, as `today`'s date has it. A cell past the rows is null. */
export declare function evaluateTable(t: Table, today?: number): Evaluated;
/**
 * What a formula reads, as written: the cells its references, ranges and names point at (row, column), the
 * functions it calls that the engine does not know, and the names no cell has. Nothing for one that cannot be read.
 */
export declare function formulaReads(raw: string, named: Map<string, [number, number]>): {
    cells: [number, number][];
    unknown: string[];
};
/** The table at block `at` (the document's first, unless said) worked out; null where there is no table. */
export declare function evaluate(doc: Doc, at?: number, today?: number): Evaluated | null;
/** A worked-out value as words: numbers rounded to what is worth showing, errors as they are, nothing for an empty cell. */
export declare function formatValue(v: CellValue): string;
/**
 * An amount of money as a column shows it: two decimals and commas, after the currency's symbol ("$" where none is
 * named); a code ("GBP") as the browser writes that currency for its reader (Intl.NumberFormat).
 */
export declare function formatMoney(v: number, currency?: string): string;
/** A value as its column shows it: a date, money (in its currency), a percentage, a number with its commas, a check box. */
export declare function formatCell(v: CellValue, type?: string, currency?: string): string;
