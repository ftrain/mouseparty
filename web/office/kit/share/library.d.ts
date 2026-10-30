import type { AppDef } from '../core/app.ts';
export interface Kept {
    /** What makes it the same document after a change: made at its first keep, carried in the tab's history.state. */
    id: string;
    app: string;
    title: string;
    /** The link's "#/v1/<app>/<payload>" part: the whole document, and nothing else of the address. */
    hash: string;
    /** When it was last kept, ms since the epoch. */
    at: number;
}
/** The most kept; the oldest go first. */
export declare const MOST = 400;
/** Every kept document, newest first; nothing under Private. */
export declare function library(): Kept[];
/** Keep a document, or the newer state of one already kept (same id). Only while Saved. */
export declare function keep(entry: Kept): void;
/**
 * Several documents kept at once (a zip of them opened, kit/file/open.ts), in one write: in their order, the first the
 * newest and each a millisecond older than the one before; one already kept with the same link is left as it is.
 * How many were new. Only while Saved.
 */
export declare function keepAll(entries: Omit<Kept, 'id' | 'at'>[], now?: number): number;
export declare function forget(id: string): void;
export declare function forgetAll(): void;
/** A document's first words, for one with no name: the first line that says something, marks and front matter left out. */
export declare function firstWords(doc: string, most?: number): string;
/** When, said as people say it: "2 hours ago", "yesterday"; older than a week, the day. */
export declare function ago(at: number, lang?: string, now?: number): string;
/** A day as "2026-10-09", in the device's own time zone. */
export declare const localDay: (d?: Date) => string;
/**
 * The first number from 1 that no title of the form `name` takes, `name` holding "{n}" where the number
 * goes ("New Spreadsheet 2026-10-09 #{n}"): how a new document is named so that it is told apart from the
 * others of its app made that day (Paul, 2026-10-09).
 */
export declare function firstFree(titles: string[], name: string): number;
/**
 * One open document's entry in the library, as the shell keeps it: adopted on arrival by the tab's history.state or
 * by its link, made at the first keep, written 800 ms after the last change (soon) or at once (flush: leaving the
 * document or the page; Mod+S). `state` is what the tab carries in history.state, so the next change, and a reload,
 * are the same entry.
 */
export declare class Keeper {
    id: string | null;
    private pending;
    private timer;
    /** The entry this tab's document is: history.state's, else the kept one at this link, else none yet. */
    adopt(hash: string): void;
    state: () => {
        kept: string;
    } | null;
    soon(entry: Omit<Kept, 'id' | 'at'>, wait?: number): void;
    flush: () => void;
}
/** A new document's name, at once: "New Spreadsheet 2026-10-09 #2", the app's noun, today, and the first number the library leaves free (Paul, 2026-10-09). */
export declare function newName(def: AppDef): string;
