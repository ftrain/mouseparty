import type { Block, Column, Doc, Run } from './model.ts';
export declare const fitRuns: (v: unknown, path: string) => Run[];
export declare const fitColumn: (v: unknown, path: string) => Column;
/** The deepest a list item may nest and the most rows a table may hold: bounds on what one block can ask of the writer, not an app's own limits (the Spreadsheet's ROWS). A table has one column to MAX_COLS (table.ts). */
export declare const MAX_DEPTH = 64;
export declare const MAX_ROWS = 100000;
/** A block of the schema's shape and within the bounds above, or a throw naming the fault: what an op may put in (ops.ts checkOp). */
export declare function checkBlock(b: Block, what: string): void;
/** A head key and its value as the header keeps them, or a throw: lower-case letters, digits, "-" and "_" (as the reader reads a key), never "__proto__"; a string the header reads back as given. */
export declare function keptHead(key: unknown, value: unknown): void;
/**
 * A document as the text keeps it: written, read back and written the same, or a throw. The writer escapes what it
 * can; what it cannot keep (a heading of two lines, a fence named with a space, a list item deeper than the one
 * before it leads to) reads back as something else, and a replica holding it would part from one that read the text.
 * (What the writer changes and the reader keeps so, a quote in an attribute made an apostrophe, a cell's "<br>" made a
 * line break, writes the same from either, and is let be.) An editor's own edit may pass through such a block and settle
 * it before the edit is whole (kit/text/textops.ts), so this is asked of a document, not of an op: of a remote entry's
 * ops once applied (kit/core/element.ts applyRemote), and of a document from JSON (jsonDoc).
 */
export declare function keptDoc(doc: Doc): void;
/** A document as JSON: stable key order, two-space indent, a line's end at the end. */
export declare const docJson: (doc: Doc) => string;
/** JSON as a document; throws when it is not JSON, or not a document, naming the path of the fault. */
export declare function jsonDoc(json: string): Doc;
