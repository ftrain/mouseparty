/**
 * The link: "#/v1/<app>/<payload>". The document lives after the "#", which a browser never sends to a
 * server. "#/v1/<app>.<view>/<payload>" opens the document as a view: a file to download on arrival
 * ("text.pdf"), or a way of showing it.
 * "…?d" is the Display Link: the same document shown as its pages, to read or print, with an Edit button
 * (never inside the payload, so the document is the same bytes either way); "…?d&text" opens it as its words, reflowed,
 * rather than its pages (the Text button puts "text" in and takes it out: withText). Everyone who arrives by a short
 * link (kit/share/short.ts) arrives with "?s=<id>&x=<expires>" (ms since the epoch) after the payload: the shell
 * shows how long the link has left (Paul, 2026-10-09); every link the shell shares is written without it.
 * tinier adds "?s=…" to whatever link it held, so "?d?s=…" reads as "?d&s=…".
 * A payload that starts "E" is sealed under a password (kit/share/crypt.ts): `sealed` says so, and the shell asks
 * for the password before anything of the document is shown. "…?show" is a
 * deck's show link: it opens presenting. "#/v1/<app>.embed/<payload>" is the embed view: the pages alone, for
 * another site's frame (served at "<site>embed/", the one address the site lets be framed).
 * "…?lang=<code>" is the language the page is in, when one was chosen in the menu (Paul, 2026-10-11: "Why are we
 * writing language at all instead of encoding the parameter in the link?"): the home page carries it too ("#/?lang=ht"),
 * a link opens in it, and nothing of it is written to the device. A link made by someone who never chose has none, and
 * opens in its reader's browser's language. (kit/core/i18n.ts; the shell keeps it in the address, withLang.)
 * The payload is written with a "+" after every 300 characters, for iMessage (kit/core/codec.ts withBreaks), and read
 * without them: a Route's payload never holds one, and a link written before them reads the same.
 * Pure: the shell and the tests both read links through here.
 */
/**
 * The version of the link format: 1 is a document's TLO text (docs/tlo.md), packed by kit/core/codec.ts and written in
 * base64url. Nothing older is read.
 */
export declare const LINK_VERSION = 1;
/** What every document's link starts with, after the "#". */
export declare const LINK = "#/v1/";
export interface Route {
    /** The app's id, or null when the link is not a document (the home page). */
    app: string | null;
    payload: string;
    version: number;
    /** The view asked for ('' for the editor). */
    view: string;
    /** Shown as its pages to read (the Display Link), not opened in the editor. */
    display: boolean;
    /** Arrived by a short link: its id, and when it expires (ms since the epoch); null otherwise. */
    arrived: {
        id: string;
        expires: number;
    } | null;
    /** The payload is sealed under a password. */
    sealed: boolean;
    /** A deck's show link: opens presenting. (Absent, not false, when it is not one.) */
    show?: true;
    /** The language the link opens in, when its maker chose one. (Absent when none was.) */
    lang?: string;
    /** A Display Link shown as its text layer, not its pages (kit/text/text-view.ts). (Absent when it is not.) */
    text?: true;
}
/** Whether a code is a well-formed language code (the link's "lang", the API's and the command line's). */
export declare const isLang: (code: string) => boolean;
export declare const onFlush: (fn: () => void) => undefined;
/** The address with the document as it is now: whatever reads the link as the document outside the shell reads it here. */
export declare function currentHash(): string;
export declare function parseHash(hash: string): Route;
/** The fragment for a document, optionally as a view; with `display`, the Display Link; with `arrived`, the short link it came by and when that expires; with `lang`, the language it opens in. */
export declare function routeHash(app: string, payload?: string, view?: string, display?: boolean, arrived?: Route['arrived'], lang?: string | null): string;
/**
 * The site's own address, from any address of it: the page's folder, less an app's own page ("/sheet/") or the embed
 * page's ("/embed/"). The site need not be at a host's root: "https://aboard-io.github.io/tinylittleoffice/sheet/#/v1/…"
 * is a page of the site at "https://aboard-io.github.io/tinylittleoffice/", the mirror on GitHub Pages (docs/mirror.md).
 * `isApp` says whether a folder's name is an app's.
 */
export declare function siteOf(href: string, isApp: (id: string) => boolean): string;
/** The address with "text" in its query or taken out, the rest as it was ("?d?s=…" read as "?d&s=…"). */
export declare function withText(hash: string, on: boolean): string;
/**
 * Any address in the site with its language put in, changed or taken out (null), the rest as it was: the home page,
 * a document, the compare view. An empty address with no language stays empty.
 */
export declare function withLang(hash: string, lang: string | null): string;
/**
 * Go to another address in the site: a template chosen, a file opened, a hand-off. The shell may ask first
 * (kit/core/shell.ts: a document that lives nowhere but its link); a link a person follows is asked about the same way.
 * Whether it went now (false: asked, and it goes once the person says so).
 */
export declare function go(hash: string): boolean;
