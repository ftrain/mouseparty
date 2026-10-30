/**
 * The five backends behind one shape (backends/README.md, "Five backends, one shape"): where a document lives, as the
 * page that holds an editor sees it. `open(address, ask)` gives the document an address names and what to do with each
 * change; the backend is found by the address's form, and `place` puts what was opened in an editor on the page. The
 * link and the sealed link are the site's own ways (the codec, the seal), the short link opens to one of them, and a
 * journal's address is a shared document (src/kit/share/multiparty.ts); a person's store (src/kit/share/sync.ts) is an
 * index of those, and is opened by its own class.
 */
import type { Op } from '../../doc/index.ts';
import { type Mounted, type Own } from '../core/mount.ts';
/** What a backend may ask the page for. */
export interface Ask {
    /** A password for a sealed document; null when the person gives none. */
    password?(): Promise<string | null>;
    /** The name a shared document's changes carry: the person's own word. */
    by?: string;
}
/** A document, open: its app and text, and what the page does with it. */
export interface Opened {
    app: string;
    text: string;
    /** The address that holds the document now: the one opened, until a change gives another (a link's, with every edit). */
    address: string;
    /** Shown, not edited: a reader's address. */
    readOnly?: boolean;
    /** A change the editor told, as its ops and the text after them: kept; the address that holds the document now. */
    changed(ops: Op[], text: string): Promise<string>;
    /** Others' changes, where there can be any: ops to hand to the editor's applyRemote. */
    remote?(fn: (ops: Op[]) => void): () => void;
    /** The document taken whole again, where that can happen: the editor's new value. */
    reset?(fn: (text: string) => void): () => void;
    close(): void;
}
export interface Backend {
    name: 'link' | 'sealed' | 'short' | 'multiparty';
    /** Whether an address is this backend's. */
    owns(address: string): boolean;
    /** The document the address names, or null when it names none this backend can open (a wrong password, a link gone). */
    open(address: string, ask?: Ask): Promise<Opened | null>;
}
/** The document in its address (docs/threat-model.md: the link is the document). */
export declare const link: Backend;
/** The document in its address under a password (docs/crypto/password.md). */
export declare const sealed: Backend;
/** A short link: the long link, fetched and opened, then that link's own backend (docs/crypto/short-links.md). */
export declare const short: Backend;
/** A document several people edit at once, in a journal (src/kit/share/multiparty.ts). */
export declare const multiparty: Backend;
/** Every backend, in the order addresses are tried. */
export declare const backends: readonly Backend[];
/** The document an address names, by whichever backend owns the address; null for an address none does, or that will not open. */
export declare function open(address: string, ask?: Ask): Promise<Opened | null>;
/** What `place` gives back: the editor mounted (kit/core/mount.ts Mounted), and the way to stop. */
export interface Placement extends Mounted {
    close(): void;
}
/**
 * An opened document put in an editor on the page: mounted with its text, each change handed to the backend, and the
 * backend's own news (others' ops, the document taken whole again) handed to the editor. `moved` is told each time the
 * address that holds the document changes (a link's, with every edit); `own` is the page's, as for `mount`.
 */
export declare function place<C>(opened: Opened, into: Element, moved?: (address: string) => void, own?: Own<C>): Promise<Placement>;
