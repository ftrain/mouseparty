/**
 * Rows as a CSV, with the separator this person's spreadsheet expects: a semicolon where the decimal mark
 * is a comma (most of Europe, South America), as Excel there reads and writes; a comma elsewhere. Intl
 * knows the locale's decimal mark.
 */
export declare const csvSeparator: () => string;
/** Rows as CSV. With a semicolon between the cells, a plain number is written with the decimal comma that goes with it. */
export declare const csv: (rows: (string | number)[][], sep?: string) => string;
