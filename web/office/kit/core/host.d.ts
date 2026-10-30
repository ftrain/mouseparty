/** A document as a fence holds it: its app (or "locked", for a sealed one held by its link) and its text. */
export interface Placed {
    lang: string;
    body: string;
}
/**
 * The pictures a host keeps, where it keeps bytes (doc/image.ts): a file put in gives back the reference the document
 * holds (and the picture's size, when the host read it); `url` is where the browser fetches one, on the host's own
 * origin or one its Content-Security-Policy allows; `bytes`, where the host gives them, lets a PDF or a PNG write the
 * picture in; `maxBytes` is the most a file may weigh, said before a put is tried. The site keeps nothing and has
 * none (siteHost leaves it undefined), so Insert ▾ never offers a picture there and a document holding one shows
 * its words instead.
 */
export interface HostImages {
    put(file: Blob): Promise<{
        ref: string;
        w?: number;
        h?: number;
    }>;
    url(ref: string): string;
    bytes?(ref: string): Promise<Uint8Array>;
    maxBytes?: number;
}
export interface Host {
    /**
     * The address a document opens at on its own, in its app: a placed document's Open in new tab, a slide's See
     * more, a hand-off. `display`: its pages to read (a deck's take-home link), in `lang` when one is given.
     */
    link(lang: string, body: string, opts?: {
        display?: boolean;
        lang?: string | null;
    }): string;
    /** The document a link names, when the words are one: its app and text, a sealed one as its locked fence. */
    read(words: string): Placed | null;
    /** The pictures this page keeps; none on the site, or on any page that keeps no bytes (docs/library.md, Images, where the host keeps them). */
    images?: HostImages;
}
/**
 * The site's answers, for the site at `site()`: a document opens at its own link there, and a link of any site names
 * its document. A page that shows the editors on an address of its own (the Storybook) gives the site's address here.
 */
export declare const siteHost: (site: () => string) => Host;
/** The host every app asks: the site's, until a page that holds an editor puts its own in (`Object.assign(host, …)`). */
export declare const host: Host;
