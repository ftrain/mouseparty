export type Kind = 'ops' | 'snapshot';
export interface Entry {
    seq: number;
    kind: Kind;
    iv: string;
    c: string;
}
/** What a journal's address gives: the id, the key that opens its entries, and the token that writes, for a writer. */
export interface Keys {
    id: string;
    key: CryptoKey;
    token?: string;
}
/** An entry's padding: its plaintext is a multiple of this many bytes. */
export declare const PAD = 256;
/** A new journal's secret: 32 random bytes, as base64url. */
export declare const newSecret: () => string;
/** The keys a writer's secret gives: the id, the read key (and its text, for a reader's address) and the token. */
export declare function writerKeys(secret: string): Promise<Keys & {
    token: string;
    read: string;
}>;
/** The keys a reader's key gives: the id and the read key, and no token. */
export declare function readerKeys(read: string): Promise<Keys>;
/** What the server keeps of a token: base64url(SHA-256(the token's text)), compared whole with what a writer sends. */
export declare const verifierOf: (token: string) => Promise<string>;
/** A journal's address: the service, its id, and after "#" the secret (`w`, a writer's) or the read key (`r`, a reader's). */
export declare const journalAddress: (service: string, id: string, part: {
    secret: string;
} | {
    read: string;
}) => string;
/** Whether an address has a journal's shape: the service, `/j/<id>` and a writer's or a reader's part. */
export declare const isJournalAddress: (address: string) => boolean;
/** An address taken apart: the service, the id, and the keys its fragment gives; null when it is not a journal's, or its id is not its key's. */
export declare function parseAddress(address: string): Promise<{
    service: string;
    id: string;
    keys: Keys;
} | null>;
/** A reader's address for a writer's, to give someone who follows and does not write; a reader's as it is; null for neither. */
export declare function readerAddressOf(address: string): Promise<string | null>;
/** An entry's content sealed for its place: the JSON's bytes after their length, padded to PAD, under a fresh IV. */
export declare function sealEntry(keys: Keys, seq: number, kind: Kind, content: unknown): Promise<Entry>;
/**
 * For the test vectors alone (test/crypto-vectors.test.ts, docs/crypto/journal.md): sealEntry() with the IV given
 * rather than drawn. An IV used twice under one key gives the key away; nothing in the site calls this, and a test
 * holds it to that.
 * @internal
 */
export declare function sealEntryAt(keys: Keys, seq: number, kind: Kind, content: unknown, iv: Uint8Array): Promise<Entry>;
/** An entry opened at its place, or null for one that is not this journal's, not at this place, or not whole. */
export declare function openEntry<T = unknown>(keys: Keys, entry: Entry): Promise<T | null>;
/** What a journal answers a reading. */
export interface Read {
    last: number;
    snapshot: number;
    entries: Entry[];
}
/** The service's answer to an append: the seq it took, or the entries past the one named (stale). */
export type Appended = {
    seq: number;
} | {
    entries: Entry[];
};
/** The four requests, at `service` (an address ending in "/"), for the journal `keys` name. */
export declare class Journal {
    readonly service: string;
    readonly keys: Keys;
    constructor(service: string, keys: Keys);
    private get url();
    private headers;
    /** The journal made with its first entry, a snapshot. */
    make(content: unknown): Promise<void>;
    /** `content` appended at `seq`; the entries past it when the seq was not the next. */
    append(seq: number, kind: Kind, content: unknown): Promise<Appended>;
    /** The entries from the latest snapshot, or from `from`. */
    read(from?: number): Promise<Read>;
    /** The entries past `after`, when there are any: held by the service until one comes, or `signal` ends the wait. */
    poll(after: number, signal?: AbortSignal): Promise<Read>;
}
