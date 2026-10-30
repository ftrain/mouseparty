/** A document as the index holds it. */
export interface Kept {
    /** The document's journal id: what makes it the same document across devices. */
    id: string;
    /** Its address, a writer's or a reader's (src/kit/share/journal.ts journalAddress). */
    address: string;
    app: string;
    title: string;
    /** When it was last added, renamed or made here, ms since the epoch. */
    at: number;
}
/** A store opened by its address (a writer's: a reader's could only look). */
export declare class SyncStore {
    readonly address: string;
    private journal;
    private keys;
    private by;
    private seq;
    private documents;
    private watchers;
    private stop;
    private closed;
    private constructor();
    /** A new store at `service`: its journal made with an empty index. Its address is the thing to keep, and to give the next device. */
    static make(service: string, by: string): Promise<SyncStore>;
    /** The store an address names, its index read; null for an address that is not a journal's. */
    static open(address: string, by: string): Promise<SyncStore | null>;
    /** The documents, newest first. */
    list(): Kept[];
    /** The latest index from the journal. */
    private read;
    /** The index written as `change` leaves it; another device's writing in between is read first and changed instead. */
    private write;
    /** A document put in the index (one already there, the same id, is replaced). */
    add(kept: Omit<Kept, 'at'>): Promise<void>;
    /** A document taken out of the index: the journal itself stays for whoever else has its address, until it expires. */
    remove(id: string): Promise<void>;
    /** A document renamed. */
    rename(id: string, title: string): Promise<void>;
    /** A new document of `app` with `text`: its own journal made with a snapshot, its writer's address kept here. */
    create(service: string, app: string, text: string, title: string): Promise<Kept>;
    /** Told the documents each time another device writes the index, until the function returned is called. */
    watch(fn: (documents: Kept[]) => void): () => void;
    private follow;
    close(): void;
}
