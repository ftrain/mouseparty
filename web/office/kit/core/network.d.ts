/**
 * Every place on the web the site can reach, in one list: what each request is for, when it happens, what
 * it carries, and what stops it. Every module that asks the web takes its host from here (`origin`), so a
 * host named anywhere else in src/ fails test/network.test.ts; the Content-Security-Policy's connect-src
 * and img-src are written from the `csp` field (scripts/headers.ts), and docs/network.md and /network
 * (public/network.html) are written from the whole list by scripts/network-doc.ts. A document fetches
 * nothing from any other site: every request here is the site's own, the map's, or one the person asks for.
 *
 * A host is a name, a "*." name (every host under it), or "*": any https address, for a place the person
 * names (their own Mastodon server). Pure data: no DOM.
 */
/** When the request is made: only after the person taps something, while a thing is on the screen, or when they share. */
export type When = 'after a tap' | 'while shown' | 'on share';
/** The CSP directive a host is allowed by (connect-src, img-src); none: the browser never asks it from a page (a new tab). */
export type Directive = 'connect' | 'img';
export interface Reach {
    host: string;
    /** What the request is for, in one line. */
    what: string;
    when: When;
    /** What the request holds. */
    carries: string;
    /** The switch or the action that prevents it. */
    stops: string;
    /** The module that makes it. */
    by: string;
    csp?: readonly Directive[];
}
export declare const NETWORK: {
    readonly site: {
        readonly host: 'tinylittleoffice.com';
        readonly what: 'The site’s own files: the page, the app file (every app, the English words, the icons, the emoji and the math), its stylesheet, an app’s templates when its list opens, a language when a page is in it, and the type (IBM Plex, a face when a page’s words need it), each fetched once and kept a year';
        readonly when: 'while shown';
        readonly carries: 'Which file; never the document, which is after the "#" and stays in the browser';
        readonly stops: 'Nothing to stop but not opening the site: these files are the app itself';
        readonly by: 'the whole site';
    };
    readonly worker: {
        readonly host: 'tinylittleoffice.com';
        readonly what: 'The service worker, /sw.js, with Save in browser on: it keeps the pages, the app file, its stylesheet, the Latin faces and each file a page fetches after, so the site opens offline';
        readonly when: 'after a tap';
        readonly carries: 'Which file, as the pages ask; never the document, which is after the "#" and never reaches the worker, and never a shared link’s "/c/<id>" page with its card';
        readonly stops: 'Save in browser, turned off: the worker is unregistered and everything it kept is deleted; while it is off there is none';
        readonly by: 'kit/share/offline.ts, sw.ts';
    };
    readonly card: {
        readonly host: 'tinylittleoffice.com';
        readonly what: 'A preview card, at the site’s own /card: posted when you share with a network (Bluesky, Mastodon, X, LinkedIn or the share sheet) with “Show a preview of the first page” on; fetched later by that network';
        readonly when: 'on share';
        readonly carries: 'A picture of the first page, the title and the first words, kept readable for a month so the network can fetch them; never the document, never its link';
        readonly stops: 'The switch “Show a preview of the first page” in Share, turned off; Edit link, Present link and Email never make one, nor does a document with a password';
        readonly by: 'kit/share/card.ts';
    };
    readonly openfreemap: {
        readonly host: 'tiles.openfreemap.org';
        readonly what: 'The Trip Planner’s map: its style, its vector tiles, its sprites and its fonts, from OpenFreeMap (made for this; no key, no limit), drawn here by MapLibre, which is fetched with the first map and is never part of the app file';
        readonly when: 'while shown';
        readonly carries: 'Which squares of the map are on the screen, and no referrer (the site sends none, and OpenFreeMap asks for none); nothing of the document';
        readonly stops: 'Map, in the Trip Planner’s bar, turned off: no map then asks for them; the home page’s pictures of the templates never do';
        readonly by: 'apps/trip/editor.ts';
        readonly csp: readonly ["connect"];
    };
    readonly tiles: {
        readonly host: 'tile.openstreetmap.org';
        readonly what: 'The pictures (tiles) under a trip’s map drawn anywhere but the Trip Planner itself (a slide, a page, an item, a card, an export), asked directly as OpenStreetMap’s policy asks: only the tiles its box needs; a picture made of that map (a card, a PDF, a PNG, a PowerPoint) asks them again to write them into it';
        readonly when: 'while shown';
        readonly carries: 'Which squares of the map are on the screen or in the picture, and the site’s name as the referrer (the origin alone, as OpenStreetMap’s tile policy asks of a web page; never the page’s path or anything of the document)';
        readonly stops: 'Map, in the Trip Planner’s bar, turned off: no map then asks for them, anywhere a trip is drawn; the home page’s pictures of the templates never do';
        readonly by: 'apps/trip/view.ts, kit/draw/raster.ts';
        readonly csp: readonly ["img", "connect"];
    };
    readonly placeSearch: {
        readonly host: 'nominatim.openstreetmap.org';
        readonly what: 'Place search in the Trip Planner';
        readonly when: 'after a tap';
        readonly carries: 'The words searched for, and the site’s name as the referrer (the origin alone, as Nominatim’s usage policy asks of an application; never the page’s path or anything of the document)';
        readonly stops: 'Not searching: typing a stop’s place by hand asks no one';
        readonly by: 'apps/trip/editor.ts';
        readonly csp: readonly ["connect"];
    };
    readonly osm: {
        readonly host: 'www.openstreetmap.org';
        readonly what: 'The credit to OpenStreetMap under the Trip Planner’s map (with OpenMapTiles’ and OpenFreeMap’s) and in the corner of a trip’s map drawn on its tiles, a link';
        readonly when: 'after a tap';
        readonly carries: 'Nothing of the document: it opens OpenStreetMap’s copyright page in a new tab';
        readonly stops: 'Not following the link';
        readonly by: 'apps/trip/editor.ts, apps/trip/view.ts';
    };
    readonly tinier: {
        readonly host: 'tinier.tinylittleoffice.com';
        readonly what: 'Short links: made or opened';
        readonly when: 'after a tap';
        readonly carries: 'The long link encrypted here, which the service cannot read, and how long to keep it';
        readonly stops: 'Not making a short link: the long link needs no one';
        readonly by: 'kit/share/short.ts';
        readonly csp: readonly ["connect"];
    };
    readonly source: {
        readonly host: 'github.com';
        readonly what: 'The site’s source: the repository, “GitHub” at the home page’s foot; the commit this copy was built from, in About; links';
        readonly when: 'after a tap';
        readonly carries: 'Which page of the source; it opens in a new tab, and nothing of the document goes with it';
        readonly stops: 'Not following the link: the commit’s name comes from the site’s own /version.json';
        readonly by: 'kit/ui/home.ts, kit/ui/drawer.ts, kit/core/version.ts';
    };
    readonly maker: {
        readonly host: 'aboard.com';
        readonly what: 'Aboard, who made the site, named at the home page’s foot and in About, a link';
        readonly when: 'after a tap';
        readonly carries: 'That the visit came from Tiny Little Office (utm_source=tlo in the address); it opens in a new tab, and nothing of the document goes with it';
        readonly stops: 'Not following the link';
        readonly by: 'kit/ui/home.ts, kit/ui/drawer.ts';
    };
    readonly bskyShare: Reach;
    readonly xShare: Reach;
    readonly linkedin: Reach;
    readonly mastodon: Reach;
};
export type Place = keyof typeof NETWORK;
/** Every entry, in the order above. */
export declare const reaches: () => Reach[];
/** An entry's https origin, without a trailing slash. */
export declare const origin: (place: Place) => string;
/** The maker's address as the chrome links it: aboard.com, told that the visit came from here. */
export declare const MAKER: string;
/** Whether `host` is one `pattern` names: the name itself, or any host under a "*." name. "*" names no host. */
export declare function hostMatches(pattern: string, host: string): boolean;
/** Whether a host is one the list names. */
export declare function listed(host: string): boolean;
