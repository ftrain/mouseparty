export interface KeptLink {
    /** The short link. */
    link: string;
    title: string;
    /** When it was made, ms since the epoch. */
    made: number;
    /** When it expires, ms since the epoch, as the service said. */
    expires: number;
}
/** The links kept here that have not yet expired, newest first. */
export declare function keptLinks(now?: number): KeptLink[];
/** Keep one. */
export declare function keepLink(link: KeptLink): void;
/** Drop one from the list (the short link itself is untouched: it expires on its own). */
export declare function dropKept(link: string): void;
