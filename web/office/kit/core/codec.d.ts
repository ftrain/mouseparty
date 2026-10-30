/**
 * The link the header's meter counts to: 2,048 characters, the length a link was safe at everywhere when Internet
 * Explorer stopped at 2,083, and that much software passing links on still keeps. No browser in use stops here (Chrome
 * at 2,097,152, Firefox at 1,048,576): kit/share/limits.ts says every limit, and the Share dialog's table states them.
 */
export declare const URL_LIMIT = 2048;
/** What a link puts in its payload so no run of letters and digits is longer than BREAK_EVERY. */
export declare const BREAK = "+";
/** iMessage and Signal take a run of up to 301; 300 leaves the payload's breaks on round numbers. */
export declare const BREAK_EVERY = 300;
/** A payload as a link carries it: a BREAK after every BREAK_EVERY characters (never at its end). */
export declare function withBreaks(payload: string): string;
/** A payload without its breaks: what the codec and the seal read. "%2B" too, a "+" something on the way percent-encoded. */
export declare const withoutBreaks: (payload: string) => string;
export declare function toBase64Url(bytes: Uint8Array): string;
export declare function fromBase64Url(s: string): Uint8Array;
/** The dictionary's bytes (exported for scripts/dictionary.ts, which measures it). */
export declare const DICTIONARY: Uint8Array<ArrayBuffer>;
export type Flag = 'y' | 'z' | 'r';
/** Pack text as bytes: deflated with the dictionary ("y"), without ("z"), or raw ("r"), whichever is shortest. */
export declare function packDoc(doc: string): {
    flag: Flag;
    bytes: Uint8Array;
};
/** The most a document may inflate to. A link is small; a few hundred bytes that unpack to gigabytes is an attack on the browser, not a document. */
export declare const MAX_DOC_BYTES: number;
/** Inverse of packDoc. Throws on malformed input, and on input that unpacks to more than MAX_DOC_BYTES. */
export declare function unpackDoc(flag: string, bytes: Uint8Array): string;
/** Whether a payload is sealed under a password (kit/share/crypt.ts), rather than one of the three packings. */
export declare const isSealed: (payload: string) => boolean;
/** A document's text as a link payload; '' for an empty document. */
export declare function encodeDoc(doc: string): string;
/** The text a payload holds; '' for anything unreadable. */
export declare function decodeDoc(payload: string): string;
/** How many characters of payload fit under URL_LIMIT after a given prefix (origin, path, "#/v1/app/"). */
export declare function budgetFor(prefixUrl: string): {
    available: number;
};
