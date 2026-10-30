/** What a plain link or a file holds: the app it opens in, and the document's text. */
export interface Plain {
    app: string;
    text: string;
    /** A view asked for (`view=pdf`, `view=show`), '' for the editor. */
    view: string;
    /** The name it is to have, '' for none: given to the app's own retitle (an app may keep its name in its words). */
    title: string;
}
/** The app a text names in its head ("app: sheet"), and the text without it. */
export declare function appInHead(text: string): [string, string];
/**
 * A plain-parameter fragment ("#title=…&doc=…"), read; null when the fragment is not one (a packed link,
 * the home page). `pageApp` is the app whose page this is ("/sheet/"), `known` says which ids are apps.
 */
export declare function readPlain(hash: string, pageApp: string, known: (id: string) => boolean): Plain | null;
/** A plain-parameter link for a document: what the skill teaches an agent to write. */
export declare function plainLink(site: string, app: string, text: string, opts?: {
    title?: string;
    by?: string;
    view?: string;
}): string;
/** A document as a .tlo file: its text with the app that opens it in the head. */
export declare const tloText: (app: string, text: string) => string;
/**
 * A file's words, as a document: a .tlo (or any text whose head names its app) opens in that app; any other
 * text (a .md, a .txt) opens in `fallback`, the app open now, else the Word Processor. Its title is the file's
 * name, for a document that names none. null for a file that is not words.
 */
export declare function readFile(name: string, text: string, fallback: string, known: (id: string) => boolean): Plain | null;
/** A document found in a zip: its app and text (or, locked, its link's payload and no text), and the name its file gives it. */
export interface InZip {
    app: string;
    text: string;
    title: string;
    /** A locked document's payload ("E…"), '' for one that is words. */
    payload: string;
}
/**
 * The documents in a zip's files (kit/file/zip.ts unzip), in the zip's order: a folder an app (the folder names the app
 * where the head does not, else `fallback`), or any zip of .tlo and .md files. A .txt that is one link to a document
 * (a locked one) is that document; anything else (a README, a picture, the dot files an archiver adds) is left alone.
 * A file called "untitled" or "locked" has no name.
 */
export declare function readZip(files: Record<string, Uint8Array>, fallback: string, known: (id: string) => boolean): InZip[];
