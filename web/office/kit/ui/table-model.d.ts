/**
 * What a column's cells hold. text: words. number and money: a number (money in the column's `currency`). date: a
 * day ("2027-03-01", a Date or a time in ms); datetime: a moment. boolean: true or false, drawn as a box to tick.
 * enum: one of the column's `options`, drawn in its color (a status, a stage). link and person: words that open
 * something, a `{ label, href }` or words with the column's `href`; with no address, a tap is told ("cellpick").
 * tags: a list of words. record: another of the host's records (a person's company), a `{ id, label, href? }` drawn as a
 * link and chosen, when edited, from the column's `search(q, signal)`, the host's own answer (thousands, never a list
 * held here). custom: whatever the column's `render` draws.
 */
export type ColumnType = 'text' | 'number' | 'money' | 'date' | 'datetime' | 'boolean' | 'enum' | 'link' | 'person' | 'record' | 'tags' | 'custom';
/** One of an enum column's values: what the row holds, the words shown (the value, without them) and its color (any CSS color). */
export interface EnumOption {
    value: string;
    label?: string;
    color?: string;
}
/** A link or a person's cell, as a row may hold it: the words, and where they open. */
export interface LinkValue {
    label: string;
    href?: string;
}
/** A record column's cell, as a row holds it: the record's id, its words, and where it opens. */
export interface RecordValue {
    id: string | number;
    label: string;
    href?: string;
}
/** A record offered by a record column's search: its id, its words, a second line (a company's domain), where it opens. */
export interface RecordOption extends RecordValue {
    detail?: string;
}
/** A record column's search: the records for the words typed ('' as the picker opens), `signal` aborted when newer words replace them. */
export type RecordSearch = (q: string, signal: AbortSignal) => Promise<RecordOption[]>;
/** A row of a table: its id, which every event names it by, and its fields, which the columns read. */
export interface TableRow {
    id: string | number;
    [key: string]: unknown;
}
/** A column of a table. Only `key` and `label` are needed: a text column of the row's field `key`. */
export interface TableColumn<R extends TableRow = TableRow> {
    /** The row's field it shows, and its name in every event. */
    key: string;
    /** Its heading, in the page's words. */
    label: string;
    type?: ColumnType;
    /** The value read from a row, where it is not the row's field `key`. */
    value?: (row: R) => unknown;
    /** Money: the currency, a code ("USD", written as the browser writes it) or a symbol ("$", the default). */
    currency?: string;
    /** Number and money: the places after the point, always (0: whole units, "$12,000"); else money's two and a number's own. */
    decimals?: number;
    /** Enum: its values in their order, which is the order a sort puts them in. */
    options?: EnumOption[];
    /** Link, person and record: where a row's cell opens, when the value does not say. */
    href?: (row: R) => string | undefined;
    /** Record: the records the picker offers for the words typed, the host's answer (a server's search). */
    search?: RecordSearch;
    /**
     * Its cells can be changed in place, each change told to the page ("rowchange") to keep or refuse; a function, for
     * each row its own (a meeting that came by invite, not changed here): a row it says no to offers no field at all.
     */
    editable?: boolean | ((row: R) => boolean);
    /** Hidden until the person shows it from the Columns menu (or the page sets the table's `hiddenColumns`). */
    hidden?: boolean;
    /** Sorted by a click on its heading; true unless said. */
    sortable?: boolean;
    /** Its width, as a CSS grid track ("12rem", "minmax(8rem, 1fr)"); else its type's. "max-content" is `fit`. */
    width?: string;
    /**
     * As wide as its widest cell (of every row, drawn or not) and its heading, measured: within its type's least width
     * and `max` (rem, 24 unless said), or `min` where given.
     */
    fit?: boolean | {
        min?: number;
        max?: number;
    };
    /** Its words wrap, and a row grows to hold them (the rows are then measured, and windowed by their heights). */
    wrap?: boolean;
    /** Custom: the cell drawn (a Lit template, a node or words). Any type may have one. */
    render?: (value: unknown, row: R) => unknown;
    /** Custom: the order of two values, low to high, where its words are not it. */
    compare?: (a: unknown, b: unknown) => number;
    /** Custom: the cell's words, for the quick search, a sort and a screen reader; else its value as words. */
    text?: (value: unknown, row: R) => string;
}
/** A sort: a column's key and which way. A table's sort is a list of these, the first the primary. */
export interface SortBy {
    key: string;
    dir: 'asc' | 'desc';
}
/** A column's type, text unless said. */
export declare const typeOf: (col: {
    type?: ColumnType;
}) => ColumnType;
/** Whether a row's cell of a column may be changed in place: the column's `editable`, or its answer for the row. */
export declare const canEdit: <R extends TableRow>(col: TableColumn<R>, row: R) => boolean;
/** Whether a column is as wide as its widest cell: `fit`, or a width of "max-content" or "fit-content". */
export declare const fits: (col: {
    fit?: TableColumn['fit'];
    width?: string;
}) => boolean;
/** A row's value in a column: its `value(row)`, else the row's field. */
export declare const valueOf: <R extends TableRow>(col: TableColumn<R>, row: R) => unknown;
/** Nothing in the cell: null, undefined, words of spaces, an empty list, a number that is not one. */
export declare const isEmpty: (v: unknown) => boolean;
/** A day or a moment as a time in ms, and whether it is a day alone ("2027-03-01", counted at midnight UTC, and written so); null where it is none. */
export declare function timeOf(v: unknown): {
    ms: number;
    day: boolean;
} | null;
/** A link's or a person's words and address. */
export declare function linkOf<R extends TableRow>(col: TableColumn<R>, row: R, v?: unknown): LinkValue;
/** A record column's cell: the record's id, words and address (the column's `href` where the value has none); null for none. */
export declare function recordOf<R extends TableRow>(col: TableColumn<R>, row: R, v?: unknown): RecordValue | null;
/** An amount with exactly `decimals` places, in its currency as formatMoney writes it (a code as the browser writes it, else after a symbol). */
export declare function moneyWords(v: number, currency?: string, decimals?: number): string;
/** An enum column's option for a value (or one made of the value, for a value the column does not list). */
export declare const optionOf: (col: {
    options?: EnumOption[];
}, v: unknown) => EnumOption;
/**
 * A day or a moment in the page's language: a day as a day ("Mar 1, 2027"), a moment with its time. `short`, as a
 * table's cell says it: the day, the month's short name and the year's two digits ("8 Nov 26"; a moment "8 Nov 26,
 * 14:05"), English laid out day first as en-GB writes it, every other language as its own (Paul, 2026-10-22:
 * "shorten all of these dates to 8 Nov 26 format").
 */
export declare function dateText(v: unknown, withTime: boolean, short?: boolean): string;
/**
 * A cell's words, as it is shown and as the quick search and a screen reader read it: a number with its commas,
 * money in its currency, a date in the page's language, an option's label, a link's words, tags with commas between,
 * a box ticked as the column's name (so a search for it finds the rows that have it) and unticked as nothing.
 */
export declare function cellWords<R extends TableRow>(col: TableColumn<R>, row: R, v?: unknown): string;
/** What a cell sorts by: a number (amounts, times, a box, an option's place), words, or null for an empty cell, which goes last. */
export declare function sortKey<R extends TableRow>(col: TableColumn<R>, row: R): number | string | null;
/**
 * The rows in the sort's order: by its first column, ties by its second, and so on; an empty cell last whichever way;
 * rows equal in every column in the order given (a stable sort). Columns the sort names that the table lacks are
 * passed over. The rows given are not changed.
 */
export declare function sortRows<R extends TableRow>(rows: readonly R[], cols: readonly TableColumn<R>[], sort: readonly SortBy[]): R[];
/**
 * The sort after a click on a column's heading. A click: the column alone, ascending, then descending, then no sort.
 * With Shift (`add`): the column added after the others, ascending, then descending, then taken out, the others kept.
 */
export declare function nextSort(sort: readonly SortBy[], key: string, add?: boolean): SortBy[];
/**
 * The rows a quick search keeps: those with every word of `query` (in any order, "words in quotes" together, case and
 * accents aside: the library's search) somewhere in the words of the columns given. An empty query keeps every row.
 * `kept` holds each row's words, folded, between searches of the same columns (a person types a word a letter at a time).
 */
export declare function searchRows<R extends TableRow>(rows: readonly R[], cols: readonly TableColumn<R>[], query: string, kept?: WeakMap<R, string>): R[];
/** A cell's value as its editor starts with it: an amount as plain digits, a day as the date field takes it, tags with commas between. */
export declare function inputOf<R extends TableRow>(col: TableColumn<R>, row: R): string;
/**
 * What an edit typed in a cell is, as the row would hold it, or undefined where it is not one of the column's
 * (words in a number column): an amount as a number, read as the Spreadsheet reads one ("$1,200", "1200 GBP"); a day
 * as "2027-03-01" and a moment as the date field gives it ("2027-03-01T09:30"); tags as a list; empty as null.
 */
export declare function parseInput(col: {
    type?: ColumnType;
}, raw: string): unknown;
/** Two values the same as far as a cell can tell (a list by its items), so an edit that changes nothing is not told. */
export declare const sameValue: (a: unknown, b: unknown) => boolean;
/** A column's least width in rem and its grid track: given, or its type's (words wider than numbers, a box narrow). */
export declare function trackOf(col: {
    type?: ColumnType;
    width?: string;
    fit?: TableColumn['fit'];
}): {
    min: number;
    track: string;
};
