export declare const TINIER: string;
/** The most ciphertext a short link may hold, in base64url characters: tinier's MAX_BYTES (backends/tinier/tinier.ts), which a test holds equal to this. */
export declare const SHORT_MAX: number;
export declare const EXPIRIES: {
    seconds: number;
    name: () => string;
}[];
/** What a short link lives for unless the person chose otherwise (and Saved remembers): a week. */
export declare const DEFAULT_TTL: number;
/** How long a short link has left, in the largest unit that says it, and how urgently: over a week, within one, the last day. */
export interface Left {
    n: number;
    unit: 'day' | 'hour' | 'minute';
    urgency: 'ok' | 'soon' | 'last';
}
export declare function timeLeft(expires: number, now?: number): Left;
/** "This link expires in 12 days": the arrival banner's words. */
export declare function expiresSentence(expires: number, now?: number): string;
/** "Expires in 7 days (16 October)": the Share dialog's words under a short link. */
export declare function expiresLine(expires: number, now?: number, lang?: string): string;
export interface Shortened {
    /** The link to share: …/<id>#<key>. */
    short: string;
    id: string;
    /** When it expires, ms since the epoch. */
    expires: number;
}
/** A short link: the service, its id, and the key after "#". */
export declare const shortLink: (id: string, key: string, at?: string) => string;
/** The longest link a short link holds, in characters (bytes, past ASCII): what fits in SHORT_MAX base64url characters of ciphertext, less AES-GCM's 16-byte tag. */
export declare const SHORT_LINK_MAX: number;
/**
 * For the test vectors alone (test/crypto-vectors.test.ts, docs/crypto/short-links.md): a short link's
 * ciphertext with the IV given rather than drawn. An IV is drawn fresh for every link; nothing in the site
 * calls this, and a test holds it to that.
 * @internal
 */
export declare function sealShortAt(link: string, rawKey: Uint8Array<ArrayBuffer>, iv: Uint8Array<ArrayBuffer>): Promise<{
    c: string;
    iv: string;
}>;
/** A new short link for `link`, good for `seconds`. */
export declare function shorten(link: string, seconds: number, at?: string): Promise<Shortened>;
/** For tests and the page: open a short link's ciphertext with its key. */
export declare function unshorten(c: string, iv: string, key: string): Promise<string>;
