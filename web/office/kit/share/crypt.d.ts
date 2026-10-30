/** A password's key and the salt it was derived with: what re-seals a document without asking again. */
export interface Locker {
    salt: Uint8Array;
    key: CryptoKey;
}
/** The key for a password and a salt: HKDF-SHA-256 over the password's NFKC bytes (as it is typed to open), the salt as HKDF's salt. */
export declare function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey>;
/** A fresh locker for a new password. */
export declare function newLocker(password: string): Promise<Locker>;
/** Encrypt a flag and bytes into a link's payload, under a fresh IV. */
export declare function seal(locker: Locker, flag: string, bytes: Uint8Array): Promise<string>;
/**
 * For the test vectors alone (test/crypto-vectors.test.ts, docs/crypto/password.md): seal() with the IV
 * given rather than drawn, so a fixed input has one known output. An IV used twice under one key gives the
 * key away; nothing in the site calls this, and a test holds it to that.
 * @internal
 */
export declare function sealAt(locker: Locker, flag: string, bytes: Uint8Array, iv: Uint8Array): Promise<string>;
/** Whether a payload has a sealed payload's shape at all: "E", base64url, and at least a salt, an IV, a flag and a tag. A link cut short in a chat fails here, before any password is asked for. */
export declare const isWholeSeal: (payload: string) => boolean;
/**
 * Decrypt a sealed payload. Null for a wrong password or a damaged link (AES-GCM cannot tell the two apart).
 * The locker returned reuses the link's salt, so later edits are re-sealed without deriving again.
 */
export declare function unseal(password: string, payload: string): Promise<{
    locker: Locker;
    flag: string;
    bytes: Uint8Array;
} | null>;
/** Decrypt with a locker already held (the same document met again this visit): null unless its salt is the link's and the key fits. */
export declare function unsealWith(locker: Locker, payload: string): Promise<{
    flag: string;
    bytes: Uint8Array;
} | null>;
/** A document's text as its link's payload: sealed under the locker when there is one. */
export declare function pack(text: string, locker: Locker | null): Promise<string>;
/** A password tried on a sealed payload: the text and its locker, or null when it is not the password, or the seal holds no document. */
export declare function unlock(password: string, payload: string): Promise<{
    text: string;
    locker: Locker;
} | null>;
/** A sealed payload opened by a locker already held: the text, or null when the locker is not its or the seal holds no document. */
export declare function reopenWith(locker: Locker, payload: string): Promise<string | null>;
