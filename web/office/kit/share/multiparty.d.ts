/**
 * A document several people edit at once, over a journal (backends/README.md, "Multiparty, over the journal";
 * docs/kernel.md §12). The latest snapshot and the entries after it, opened and applied, are the text. Each change the
 * editor tells (`mount`'s onOps) is appended as it comes, the pending ops of the moment in one entry at the next seq;
 * an append the journal answers stale brings the entries past it, which are carried over the pending ops (the kernel's
 * `cross`) and handed to the editor (`applyRemote`), and the append is tried again. The others' entries come by the
 * held GET and are taken the same way. An entry whose ops do not apply to the journal's document, or leave one the text
 * would not read back as written (the kernel's checkOp and keptDoc), is passed over by every replica alike, since the
 * kernel is the same everywhere, so no one entry can part them; a writer whose own ops would not apply, a crossing the
 * kernel finds (Conflict), an entry that will not open, or a snapshot that is not the document as it is here, means
 * this replica has parted from the journal: the pending ops are let go and the document taken from the journal whole
 * again (rule 4: the journal's order is the document), which the page hears as a reset. Every SNAPSHOT_EVERY entries a
 * writer appends a snapshot, so a reader joining pays for the recent changes alone. Who did what is in every entry:
 * `by`, the writer's own word; the journal is the document's history, each entry a version (`versions`, `textAt`).
 */
import { type Op } from '../../doc/index.ts';
import { type Kind } from './journal.ts';
/** An ops entry's content: who, when, which client (a writer knows its own entries as they come back) and the kernel's ops. */
export interface Ops {
    by: string;
    at: number;
    client: string;
    ops: Op[];
}
/** A snapshot's content: who wrote it and when, the app and the whole text. */
export interface Snapshot {
    by: string;
    at: number;
    app: string;
    text: string;
}
/** How many entries a writer lets pass before it appends a snapshot. */
export declare const SNAPSHOT_EVERY = 500;
/** A shared document, open: what the page holds beside the editor. */
export interface Shared {
    readonly app: string;
    /** The text as it was opened, for the editor's value. */
    readonly text: string;
    /** Whether this address writes (a reader's address only follows). */
    readonly writes: boolean;
    /** The journal's last seq applied here. */
    readonly seq: number;
    /** The editor's change, as its ops: appended as soon as it can be. */
    changed(ops: Op[]): void;
    /** Others' ops as they apply here, over what is pending: for the editor's applyRemote. */
    onRemote(fn: (ops: Op[]) => void): () => void;
    /** The document taken whole again (a crossing, or an entry that would not open): the editor's new value. */
    onReset(fn: (text: string) => void): () => void;
    /** Stop following and writing. */
    close(): void;
}
/**
 * A new shared document at `service`, of `app`, holding `text` (as an editor writes it), its first entry a snapshot by
 * `by`: the writer's address, to keep and to give a fellow writer, and the reader's, to give someone who follows.
 */
export declare function newShared(service: string, app: string, text: string, by: string): Promise<{
    address: string;
    reader: string;
}>;
/** A shared document opened at its address, as `by` (the name its changes carry); null for an address that is not a journal's. */
export declare function openShared(address: string, by: string): Promise<Shared | null>;
/** One entry of a shared document's history: its place, who made it and when, and whether it is a snapshot. */
export interface Version {
    seq: number;
    by: string;
    at: number;
    kind: Kind;
}
/** A shared document's history, oldest first. */
export declare function versions(address: string): Promise<Version[] | null>;
/** The document as it was after the entry at `seq`: the first snapshot and every entry through it applied. */
export declare function textAt(address: string, seq: number): Promise<string | null>;
