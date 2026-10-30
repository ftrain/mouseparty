import { keeping } from '../core/store.ts';
import { type Locker } from './crypt.ts';
import { type Kept } from './library.ts';
/** The preferences this site may keep, by key; with them which documents have been told they are copies (kit/core/shell.ts). */
export declare const PREFS: string[];
export declare function onPrivacy(cb: () => void): () => void;
export { keeping };
/**
 * The switch, turned: keep things from now on, or forget all of it and keep nothing: what the device holds, and
 * what this visit holds in memory too, the passwords given and the texts they opened (Paul, 2026-10-12: "Are we
 * sure when I turn stuff off no cookies or local storage or in memory remains").
 */
export declare function setPrivate(privately: boolean): Promise<void>;
export declare const prefsKept: () => number;
/** A new password's locker. */
export declare const lockWith: (password: string) => Promise<Locker>;
/** A password tried on a sealed payload (crypt.ts unlock), its locker kept for the visit: the text and the locker, or null. */
export declare function unlock(password: string, payload: string): Promise<{
    text: string;
    locker: Locker;
} | null>;
/** A sealed payload opened by a password already given this visit, or null. */
export declare function reopen(payload: string): Promise<{
    text: string;
    locker: Locker;
} | null>;
/** A locker made here (a password set) opens its document again this visit too. */
export declare const remember: (locker: Locker) => undefined;
export interface Holdings {
    /** Preferences set (theme, size…). */
    prefs: number;
    /** Documents in the library. */
    documents: number;
    /** The short links made here. */
    links: number;
}
export declare function holdings(): Promise<Holdings>;
export declare function forgetPrefs(): void;
export declare function forgetDocuments(): void;
/** Documents kept at once (a zip of them opened, kit/file/open.ts), what shows them told: how many were new. */
export declare function keepDocuments(entries: Omit<Kept, 'id' | 'at'>[]): number;
export declare function forgetLinks(): void;
/** Forget everything this site keeps here, and keep nothing from now on. */
export declare function forgetEverything(): Promise<void>;
