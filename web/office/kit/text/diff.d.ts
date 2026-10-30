export type Change = {
    kind: ' ' | '-' | '+';
    line: string;
};
/**
 * Two lists of strings, compared: each kept (' '), taken out ('-') or put in ('+'), in the order they read. What the
 * two share at their start and end is kept first, so what one edit leaves to compare is small however long the lists.
 */
export declare function diffLines(x: string[], y: string[]): Change[];
/** A document's text as the units compared: a line per head field, then each block as written. */
export declare function blocksOf(text: string): string[];
/** Two documents' texts, compared block by block. */
export declare const diff: (a: string, b: string) => Change[];
/** How many blocks the second took out and put in. */
export declare const tally: (changes: Change[]) => {
    removed: number;
    added: number;
};
